import { cleanText, deadline, publicUrl, type Page, type SearchHit, type WebContext, type WebProvider } from "./contracts.ts";

const ENDPOINT = "https://chatgpt.com/backend-api/codex/alpha/search";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export function codexProvider(ctx: WebContext, fetchImpl: typeof fetch = fetch): WebProvider {
	const model = ctx.model!;
	async function request(commands: object, signal?: AbortSignal): Promise<Record<string, unknown>> {
		const bounded = deadline(signal);
		bounded.throwIfAborted();
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		bounded.throwIfAborted();
		if (!auth.ok || !auth.apiKey) throw new Error("w-web needs a Codex login in Pi: /login openai-codex");
		if (auth.baseUrl && new URL(auth.baseUrl).origin !== "https://chatgpt.com") {
			throw new Error("w-web will not forward alternate-endpoint credentials to Codex.");
		}
		let account: unknown;
		try {
			const claims = JSON.parse(Buffer.from(auth.apiKey.split(".")[1], "base64url").toString());
			account = claims["https://api.openai.com/auth"]?.chatgpt_account_id;
		} catch { /* Report an authentication error without exposing the token. */ }
		if (typeof account !== "string" || !account) throw new Error("w-web requires Codex OAuth credentials from /login openai-codex.");
		const response = await fetchImpl(ENDPOINT, {
			method: "POST",
			redirect: "error",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${auth.apiKey}`,
				"ChatGPT-Account-ID": account,
			},
			body: JSON.stringify({
				id: ctx.sessionManager.getSessionId(),
				model: model.id,
				commands: { ...commands, response_length: "long" },
				max_output_tokens: 6000,
			}),
			signal: bounded,
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw new Error(`Codex search returned HTTP ${response.status}${response.status === 401 ? "; use /login openai-codex" : ""}. No other provider was tried.`);
		}
		const chunks: Uint8Array[] = [];
		let size = 0;
		if (!response.body) throw new Error("Codex search returned an empty body.");
		for await (const chunk of response.body) {
			size += chunk.byteLength;
			if (size > MAX_RESPONSE_BYTES) throw new Error("Codex search exceeded the response size limit.");
			chunks.push(chunk);
		}
		const value = JSON.parse(Buffer.concat(chunks).toString());
		if (!value || typeof value !== "object" || value.error) throw new Error("Codex search returned a provider error.");
		return value;
	}
	return {
		name: "openai-codex",
		async search(query, signal) {
			const value = await request({ search_query: [{ q: query }] }, signal);
			if (!Array.isArray(value.results)) throw new Error("Codex search returned no structured result list.");
			const hits: SearchHit[] = [];
			for (const item of value.results) {
				if (item.type !== "text_result" || typeof item.url !== "string") continue;
				try {
					hits.push({ url: publicUrl(item.url), title: cleanText(item.title ?? item.url), snippet: cleanText(item.snippet ?? "") });
				} catch { /* Non-public results are not usable by these tools. */ }
			}
			return { value: hits };
		},
		async read(url, line, signal) {
			const value = await request({ open: [{ ref_id: url, lineno: line }] }, signal);
			return { value: parseCodexPage(value.output) };
		},
		async find(url, pattern, signal) {
			const value = await request({ find: [{ ref_id: url, pattern }] }, signal);
			return { value: parseCodexPage(value.output) };
		},
	};
}

export function parseCodexPage(output: unknown): Page {
	if (typeof output !== "string") throw new Error("Codex returned no document text.");
	const total = output.match(/Total lines:\s*(\d+)/);
	if (!total) throw new Error(`Codex did not return a readable document: ${cleanText(output).slice(0, 300)}`);
	const lines: Record<number, string> = {};
	const pattern = /\bL(\d+)(?:@P\d+(?:-\d+)?)?:\s?([\s\S]*?)(?=\bL\d+(?:@P\d+(?:-\d+)?)?:|$)/g;
	for (const match of output.matchAll(pattern)) {
		lines[Number(match[1])] = cleanText(match[2]
			.replace(/\uE200cite\uE202([^\uE201]+)\uE201/g, (_whole, inner: string) => inner.includes("†") ? inner.split("†")[1] : "")
			.trimEnd());
	}
	const wordLimit = output.match(/\[wordlim:\s*\d+\]/)?.[0];
	return { lines, totalLines: Number(total[1]), notice: wordLimit ? `Provider quotation limit: ${wordLimit}.` : undefined };
}
