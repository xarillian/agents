import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Model, Usage } from "@earendil-works/pi-ai";
import { calculateCost } from "@earendil-works/pi-ai";

export type InputItem = Record<string, unknown>;

export function supportsNative(model: Model<any> | undefined): boolean {
	return model?.provider === "openai" && model.api === "openai-responses"
		|| model?.provider === "openai-codex" && model.api === "openai-codex-responses";
}

export function endpoint(model: Model<any>, baseUrl = model.baseUrl): string {
	const url = new URL(baseUrl);
	const codex = model.provider === "openai-codex";
	if (url.origin !== (codex ? "https://chatgpt.com" : "https://api.openai.com") || url.username || url.password) {
		throw new Error("native compaction is only enabled for first-party OpenAI endpoints");
	}
	let path = url.pathname.replace(/\/+$/, "");
	if (codex && !path.endsWith("/codex") && !path.endsWith("/codex/responses")) path += "/codex";
	if (!path.endsWith("/responses")) path += "/responses";
	url.pathname = codex ? path : `${path}/compact`;
	url.search = "";
	url.hash = "";
	return url.href;
}

export function validateOutput(value: unknown): InputItem[] {
	if (!value || typeof value !== "object") throw new Error("OpenAI returned an invalid compaction response");
	const { output } = value as { output?: unknown };
	if (!Array.isArray(output) || !output.every(item => item && typeof item === "object" && !Array.isArray(item))
		|| !output.some(item => item.type === "compaction" && typeof item.encrypted_content === "string" && item.encrypted_content.length > 0)) {
		throw new Error("OpenAI returned no encrypted compaction state");
	}
	return output;
}

export async function requestCompaction(
	ctx: ExtensionContext,
	input: InputItem[],
	instructions: string,
	signal: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): Promise<{ output: InputItem[]; usage?: Usage }> {
	const model = ctx.model!;
	const bounded = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
	bounded.throwIfAborted();
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	bounded.throwIfAborted();
	if (!auth.ok || !auth.apiKey) throw new Error("OpenAI authentication is unavailable; use /login");
	const url = endpoint(model, auth.baseUrl ?? model.baseUrl);
	if (model.provider === "openai-codex") return requestCodexCompaction(ctx, input, instructions, bounded);
	const headers = new Headers(model.headers);
	for (const [key, value] of Object.entries(auth.headers ?? {})) {
		if (value === null) headers.delete(key);
		else headers.set(key, value);
	}
	headers.set("Authorization", `Bearer ${auth.apiKey}`);
	headers.set("Content-Type", "application/json");
	headers.set("Accept", "application/json");
	const response = await fetchImpl(url, {
		method: "POST", redirect: "error", headers,
		body: JSON.stringify({ model: model.id, input, instructions }), signal: bounded,
	});
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(`OpenAI compaction returned HTTP ${response.status}`);
	}
	if (!response.body) throw new Error("OpenAI compaction returned an empty body");
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of response.body) {
		size += chunk.byteLength;
		if (size > 32 * 1024 * 1024) throw new Error("OpenAI compaction exceeded the response size limit");
		chunks.push(chunk);
	}
	let value: any;
	try { value = JSON.parse(Buffer.concat(chunks).toString()); }
	catch { throw new Error("OpenAI compaction returned invalid JSON"); }
	const output = validateOutput(value);
	const raw = value.usage;
	let usage: Usage | undefined;
	if (raw && Number.isSafeInteger(raw.input_tokens) && raw.input_tokens >= 0
		&& Number.isSafeInteger(raw.output_tokens) && raw.output_tokens >= 0) {
		const cached = raw.input_tokens_details?.cached_tokens ?? 0;
		if (!Number.isSafeInteger(cached) || cached < 0 || cached > raw.input_tokens) throw new Error("OpenAI returned invalid compaction usage");
		usage = {
			input: raw.input_tokens - cached, output: raw.output_tokens, cacheRead: cached, cacheWrite: 0,
			totalTokens: raw.input_tokens + raw.output_tokens,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		};
		calculateCost(model, usage);
	}
	return { output, usage };
}

async function requestCodexCompaction(ctx: ExtensionContext, input: InputItem[], instructions: string, signal: AbortSignal) {
	let output: unknown;
	const items = new Map<number, InputItem>();
	const response = await ctx.modelRegistry.complete(ctx.model!, {
		messages: [{ role: "system", content: instructions, timestamp: Date.now() }],
	}, {
		signal, cacheRetention: "none", transport: "sse",
		onPayload: payload => ({ ...(payload as object), input: [...input, { type: "compaction_trigger" }], instructions }),
		onProviderStreamEvent: event => {
			const value = event as { type?: string; output_index?: number; item?: InputItem; response?: { output?: unknown } };
			if (value.type === "response.output_item.done" && value.item && Number.isInteger(value.output_index)) {
				items.set(value.output_index!, value.item);
			}
			if (value.type === "response.completed" || value.type === "response.done") output = value.response?.output;
		},
	});
	signal.throwIfAborted();
	if (response.stopReason !== "stop") throw new Error(`Codex native compaction ended with ${response.stopReason}`);
	if (!Array.isArray(output) || output.length === 0) output = [...items.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
	return { output: validateOutput({ output }), usage: response.usage };
}
