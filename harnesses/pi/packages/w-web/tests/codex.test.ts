import { test } from "node:test";
import assert from "node:assert/strict";
import { codexProvider, parseCodexPage } from "../codex.ts";

function context() {
	const token = `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } })).toString("base64url")}.signature`;
	return {
		model: { id: "codex-test", provider: "openai-codex" },
		modelRegistry: { async getApiKeyAndHeaders() { return { ok: true, apiKey: token }; } },
		sessionManager: { getSessionId() { return "isolated-session"; } },
	} as any;
}

test("Codex sends only native commands and uses Pi's resolved credentials", async () => {
	const ctx = context();
	let request: any;
	const provider = codexProvider(ctx, async (url, init) => {
		assert.equal(url, "https://chatgpt.com/backend-api/codex/alpha/search");
		assert.equal(init?.redirect, "error");
		assert.equal((init?.headers as any)["ChatGPT-Account-ID"], "test-account");
		request = JSON.parse(init!.body as string);
		return Response.json({ results: [{ type: "text_result", url: "https://example.com", title: "Example", snippet: "Evidence" }] });
	});
	const result = await provider.search("exact failure");
	assert.deepEqual(request.commands.search_query, [{ q: "exact failure" }]);
	assert.equal(request.id, "isolated-session");
	assert.equal(request.model, "codex-test");
	assert.equal(request.messages, undefined);
	assert.equal(result.value[0].snippet, "Evidence");
});

test("Codex pagination preserves inline line markers and exposes quotation limits", () => {
	const page = parseCodexPage("Title\n[wordlim: 200] Total lines: 500\nL296: Before\nL297: API cite11†link L298: After");
	assert.equal(page.lines[297], "API link");
	assert.equal(page.lines[298], "After");
	assert.equal(page.totalLines, 500);
	assert.match(page.notice!, /wordlim: 200/);
	assert.throws(() => parseCodexPage("Access denied"), /did not return a readable document/);
});

test("Codex uses native open and find for the given URL", async () => {
	const commands: any[] = [];
	const provider = codexProvider(context(), async (_url, init) => {
		commands.push(JSON.parse(init!.body as string).commands);
		return Response.json({ output: "Total lines: 900\nL800: useful", results: [] });
	});
	await provider.read("https://example.com/docs", 800);
	assert.deepEqual(commands[0].open, [{ ref_id: "https://example.com/docs", lineno: 800 }]);
	await provider.find!("https://example.com/docs", "useful");
	assert.deepEqual(commands[1].find, [{ ref_id: "https://example.com/docs", pattern: "useful" }]);
});

test("a rate limit does not become an empty result or a second-provider request", async () => {
	let calls = 0;
	const provider = codexProvider(context(), async () => { calls++; return new Response("rate limited", { status: 429 }); });
	await assert.rejects(provider.search("query"), /HTTP 429.*No other provider/);
	assert.equal(calls, 1);
});

test("an aborted search makes no authentication or network request", async () => {
	const ctx = context();
	ctx.modelRegistry.getApiKeyAndHeaders = async () => { throw new Error("must not resolve auth"); };
	const provider = codexProvider(ctx, async () => { throw new Error("must not fetch"); });
	await assert.rejects(provider.search("query", AbortSignal.abort()), { name: "AbortError" });
});

test("missing auth and alternate-endpoint credentials are not sent to Codex", async () => {
	const ctx = context();
	ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: false });
	await assert.rejects(codexProvider(ctx).search("query"), /login openai-codex/);
	ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: "secret", baseUrl: "https://example.com" });
	await assert.rejects(codexProvider(ctx).search("query"), /will not forward/);
});
