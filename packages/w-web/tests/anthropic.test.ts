import { test } from "node:test";
import assert from "node:assert/strict";
import { anthropicProvider, fetchedPage, NativeBlocks, searchHits } from "../anthropic.ts";

const usage = { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: .001, output: .002, cacheRead: 0, cacheWrite: 0, total: .003 } };
const searchBlock = {
	type: "web_search_tool_result", tool_use_id: "tool_1",
	content: [{ type: "web_search_result", url: "https://example.com/docs", title: "Docs", encrypted_content: "private-provider-state" }],
};

function context(responses: any[], payloads: any[] = []) {
	return {
		model: { id: "claude-test", provider: "anthropic" },
		modelRegistry: {
			isUsingOAuth() { return false; },
			async getApiKeyAndHeaders() { return { ok: true, apiKey: "api-key-fixture" }; },
			streamSimple(model: any, input: any, options: any) {
				assert.equal(model.id, "claude-test");
				assert.equal(input.messages.length, 1);
				assert.equal(options.apiKey, "api-key-fixture");
				const payload = options.onPayload({ model: model.id, system: ["host authentication compatibility"], thinking: undefined });
				payloads.push(structuredClone(payload));
				const response = responses.shift();
				return { async result() {
					for (const [index, block] of response.blocks.entries()) options.onProviderStreamEvent({ type: "content_block_start", index, content_block: block });
					options.onProviderStreamEvent({ type: "message_delta", usage: { server_tool_use: { web_search_requests: response.searchRequests ?? 0 } } });
					return { stopReason: response.stopReason ?? "stop", rawStopReason: response.rawStopReason ?? "end_turn", usage, errorMessage: response.errorMessage };
				} };
			},
		},
	} as any;
}

test("Claude search uses the selected Claude and only returns sources and cited excerpts", async () => {
	const payloads: any[] = [];
	const ctx = context([{ blocks: [searchBlock, { type: "text", text: "An uncited claim", citations: [{ type: "web_search_result_location", url: "https://example.com/docs", cited_text: "An exact passage" }] }] }], payloads);
	const result = await anthropicProvider(ctx).search("exact query");
	assert.equal(payloads[0].tools[0].type, "web_search_20250305");
	assert.deepEqual(payloads[0].tool_choice, { type: "tool", name: "web_search" });
	assert.deepEqual(payloads[0].system, ["host authentication compatibility"]);
	assert.equal(result.value[0].snippet, "An exact passage");
	assert.doesNotMatch(JSON.stringify(result), /private-provider-state|uncited claim/);
	assert.deepEqual(result.usage, usage);
});

test("paused Claude turns replay native encrypted blocks unchanged and add usage", async () => {
	const payloads: any[] = [];
	const ctx = context([{ rawStopReason: "pause_turn", blocks: [searchBlock] }, { blocks: [{ type: "text", text: "Done" }] }], payloads);
	const result = await anthropicProvider(ctx).search("query");
	assert.deepEqual(payloads[1].messages[1], { role: "assistant", content: [searchBlock] });
	assert.deepEqual(payloads[1].tool_choice, { type: "auto" });
	assert.equal(result.usage?.totalTokens, 240);
});

test("HTTP-success native tool failures remain errors with their paid usage", async () => {
	const ctx = context([{ blocks: [{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } }] }]);
	await assert.rejects(anthropicProvider(ctx).search("query"), error => {
		assert.match((error as Error).message, /too_many_requests/);
		assert.deepEqual((error as any).usage, usage);
		return true;
	});
	assert.deepEqual(searchHits([{ type: "web_search_tool_result", content: [] }]), []);
	assert.throws(() => searchHits([{ type: "text", text: "I did not search" }]), /did not execute/);
});

test("Claude fetch returns the original document rather than the assistant's summary", async () => {
	const payloads: any[] = [];
	const blocks = [
		{ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://example.com/docs", content: { type: "document", source: { type: "text", data: "Intro\nImportant limitation" } } } },
		{ type: "text", text: "A lossy summary" },
	];
	const result = await anthropicProvider(context([{ blocks }], payloads)).read("https://example.com/docs", 0);
	assert.equal(result.value.lines[1], "Important limitation");
	assert.doesNotMatch(JSON.stringify(result), /lossy summary/);
	assert.equal(payloads[0].tools[0].type, "web_fetch_20250910");
	assert.match(payloads[0].messages[0].content, /https:\/\/example.com\/docs/);
	assert.throws(() => fetchedPage(blocks, "https://example.com/unrelated"), /did not return/);
});

test("a redirected Claude page is accepted only with proof of the requested native fetch", () => {
	const result = { type: "web_fetch_tool_result", tool_use_id: "fetch_1", content: { type: "web_fetch_result", url: "https://example.com/final", content: { source: { type: "text", data: "Final content" } } } };
	assert.throws(() => fetchedPage([result], "https://example.com/original"), /did not return/);
	const call = { type: "server_tool_use", id: "fetch_1", name: "web_fetch", input: { url: "https://example.com/original" } };
	const page = fetchedPage([call, result], "https://example.com/original");
	assert.equal(page.lines[0], "Final content");
	assert.match(page.notice!, /https:\/\/example.com\/final/);
});

test("binary Claude fetches fail explicitly instead of substituting generated text", () => {
	assert.throws(() => fetchedPage([{ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://example.com/a.pdf", content: { source: { type: "base64", data: "binary" } } } }], "https://example.com/a.pdf"), /binary document/);
});

test("native streaming reconstructs split arguments and citations without mutating events", () => {
	const blocks = new NativeBlocks();
	const event = { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", name: "web_search", input: {} } };
	blocks.accept(event);
	blocks.accept({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"exa' } });
	blocks.accept({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'mple"}' } });
	assert.deepEqual(blocks.finish()[0].input, { query: "example" });
	assert.deepEqual(event.content_block.input, {});
});

test("Claude API usage includes the native tool's reported search charges", async () => {
	const ctx = context([{ blocks: [searchBlock], searchRequests: 1 }]);
	const result = await anthropicProvider(ctx).search("query");
	assert.ok(Math.abs(result.usage!.cost.total - .013) < Number.EPSILON);
});

test("Claude subscription auth is rejected without resolving credentials or starting inference", async () => {
	const ctx = context([]);
	let lookups = 0;
	let requests = 0;
	ctx.modelRegistry.isUsingOAuth = () => true;
	ctx.modelRegistry.getApiKeyAndHeaders = async () => { lookups++; return { ok: true, apiKey: "sk-ant-oat01-private" }; };
	ctx.modelRegistry.streamSimple = () => { requests++; throw new Error("must not request"); };
	await assert.rejects(anthropicProvider(ctx).search("query"), /does not use Claude subscription credentials/);
	await assert.rejects(anthropicProvider(ctx).read("https://example.com/docs", 0), /does not use Claude subscription credentials/);
	assert.equal(lookups, 0);
	assert.equal(requests, 0);
});

test("subscription tokens stored as API keys or headers cannot bypass the auth guard", async () => {
	for (const location of ["apiKey", "headers", "modelHeaders"]) {
		const ctx = context([]);
		const token = "sk-ant-oat01-private";
		const auth = { ok: true, apiKey: location === "apiKey" ? token : "api-key-fixture", headers: {} };
		if (location === "headers") auth.headers = { Authorization: `Bearer ${token}` };
		if (location === "modelHeaders") ctx.model.headers = { "x-api-key": token };
		ctx.modelRegistry.getApiKeyAndHeaders = async () => auth;
		let requests = 0;
		ctx.modelRegistry.streamSimple = () => { requests++; throw new Error("must not request"); };
		await assert.rejects(anthropicProvider(ctx).search("query"), error => {
			assert.match((error as Error).message, /does not use Claude subscription credentials/);
			assert.doesNotMatch((error as Error).message, /sk-ant-oat01-private/);
			return true;
		});
		assert.equal(requests, 0);
	}
});

test("missing API auth, redirected credentials and cancellation never reach Claude inference", async () => {
	const ctx = context([]);
	let requests = 0;
	ctx.modelRegistry.streamSimple = () => { requests++; throw new Error("must not request"); };
	ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: false, error: "private error" });
	await assert.rejects(anthropicProvider(ctx).search("query"), /explicit Anthropic API-key authentication/);
	ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true });
	await assert.rejects(anthropicProvider(ctx).search("query"), /explicit Anthropic API-key authentication/);
	ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: "api-key-fixture", baseUrl: "https://example.com" });
	await assert.rejects(anthropicProvider(ctx).search("query"), /native Anthropic endpoint/);
	const controller = new AbortController();
	ctx.modelRegistry.getApiKeyAndHeaders = async () => { controller.abort(); return { ok: true, apiKey: "api-key-fixture" }; };
	await assert.rejects(anthropicProvider(ctx).search("query", controller.signal), { name: "AbortError" });
	assert.equal(requests, 0);
});
