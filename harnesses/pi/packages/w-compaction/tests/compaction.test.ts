import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const host = pathToFileURL(realpathSync(execFileSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim())).href;
registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith("@earendil-works/")) return nextResolve(specifier, { ...context, parentURL: host });
	return nextResolve(specifier, context);
} });
const { default: install } = await import("../index.ts");
const { requestCompaction, endpoint, supportsNative } = await import("../openai.ts");
const { nativeEntries, restoreHistory } = await import("../history.ts");
const { SessionManager, convertToLlm, ModelRuntime, ModelRegistry, DefaultResourceLoader, SettingsManager, createAgentSession } = await import("@earendil-works/pi-coding-agent");
const { convertResponsesMessages } = await import("@earendil-works/pi-ai/api/openai-responses-shared");
const { createAssistantMessageEventStream } = await import("@earendil-works/pi-ai");

const model = {
	id: "gpt-test", provider: "openai", api: "openai-responses", baseUrl: "https://api.openai.com/v1",
	name: "Test", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 16000,
	cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
};
const output = [{ role: "user", content: "retained by OpenAI" }, { type: "compaction", id: "cmp_test", encrypted_content: "opaque-state" }];
const response = () => Response.json({ output, usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10 } } });
const user = (text: string) => ({ role: "user" as const, content: text, timestamp: Date.now() });

function setup() {
	const session = SessionManager.inMemory();
	session.appendMessage(user("Old requirement: preserve the sentinel 8675309"));
	const kept = session.appendMessage(user("Recent work"));
	const handlers = new Map<string, Function>();
	install({ on: (name: string, handler: Function) => handlers.set(name, handler) } as any);
	const notifications: string[] = [];
	const ctx: any = {
		model: { ...model }, sessionManager: session, hasUI: true, ui: { notify: (message: string) => notifications.push(message) },
		getSystemPrompt: () => "Current system prompt", abort: () => { ctx.aborted = true; },
		modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret", headers: { "OpenAI-Organization": "org-test" } }) },
	};
	const event: any = {
		type: "session_before_compact", signal: new AbortController().signal, reason: "manual", willRetry: false,
		preparation: { firstKeptEntryId: kept, messagesToSummarize: [user("Old requirement: preserve the sentinel 8675309")], turnPrefixMessages: [],
			isSplitTurn: false, tokensBefore: 1000, fileOps: { read: new Set(), written: new Set(), edited: new Set() },
			settings: { enabled: true, reserveTokens: 100, keepRecentTokens: 20 } },
	};
	return { ctx, session, handlers, event, notifications };
}

function save(s: ReturnType<typeof setup>, result: any) {
	const c = result.compaction;
	return s.session.appendCompaction(c.summary, c.firstKeptEntryId, c.tokensBefore, c.details, true, c.usage);
}

function payload(s: ReturnType<typeof setup>) {
	return { model: s.ctx.model.id, input: convertResponsesMessages(s.ctx.model,
		{ messages: convertToLlm(s.session.buildSessionProjection().messages) }, new Set(["openai", "openai-codex"])) };
}

function mockFetch(t: any, impl: typeof fetch) {
	t.mock.method(globalThis, "fetch", impl);
}

test("OpenAI compaction uses resolved credentials and accounts for cached tokens", async () => {
	const s = setup();
	const result = await requestCompaction(s.ctx, [{ role: "user", content: "full input" }], "focus", s.event.signal, async (url, options) => {
		assert.equal(url, "https://api.openai.com/v1/responses/compact");
		assert.equal(new Headers(options!.headers).get("Authorization"), "Bearer secret");
		assert.equal(new Headers(options!.headers).get("OpenAI-Organization"), "org-test");
		assert.equal(options!.redirect, "error");
		assert.deepEqual(JSON.parse(options!.body as string), { model: model.id, input: [{ role: "user", content: "full input" }], instructions: "focus" });
		return response();
	});
	assert.deepEqual(result.output, output);
	assert.equal(result.usage!.input, 90);
	assert.equal(result.usage!.cacheRead, 10);
	assert.equal(result.usage!.totalTokens, 120);
});

test("Codex compaction uses the provider stream's native trigger and captures opaque output", async () => {
	const s = setup();
	s.ctx.model = { ...model, provider: "openai-codex", api: "openai-codex-responses", baseUrl: "https://chatgpt.com/backend-api" };
	assert.equal(endpoint(s.ctx.model), "https://chatgpt.com/backend-api/codex/responses");
	s.ctx.modelRegistry.complete = async (_model: any, _context: any, options: any) => {
		const body = options.onPayload({ model: "gpt-test", store: false, input: [] });
		assert.deepEqual(body.input, [{ role: "user", content: "history" }, { type: "compaction_trigger" }]);
		assert.equal(body.instructions, "focus");
		assert.equal(options.cacheRetention, "none");
		options.onProviderStreamEvent({ type: "response.completed", response: { output } });
		return { stopReason: "stop", usage: { totalTokens: 15 } };
	};
	const result = await requestCompaction(s.ctx, [{ role: "user", content: "history" }], "focus", s.event.signal,
		async () => { throw new Error("must use Pi's provider transport"); });
	assert.deepEqual(result.output, output);
});

test("Codex preserves completed stream items when the terminal response omits its output", async () => {
	const s = setup();
	s.ctx.model = { ...model, provider: "openai-codex", api: "openai-codex-responses", baseUrl: "https://chatgpt.com/backend-api" };
	s.ctx.modelRegistry.complete = async (_model: any, _context: any, options: any) => {
		options.onProviderStreamEvent({ type: "response.output_item.done", output_index: 1, item: output[1] });
		options.onProviderStreamEvent({ type: "response.output_item.done", output_index: 0, item: output[0] });
		options.onProviderStreamEvent({ type: "response.completed", response: { output: [] } });
		return { stopReason: "stop" };
	};
	assert.deepEqual((await requestCompaction(s.ctx, [], "", s.event.signal)).output, output);
	s.ctx.modelRegistry.complete = async () => ({ stopReason: "length" });
	await assert.rejects(requestCompaction(s.ctx, [], "", s.event.signal), /ended with length/);
});

test("alternate endpoints and unsupported APIs never receive first-party credentials", async () => {
	assert.equal(supportsNative({ ...model, api: "openai-completions" } as any), false);
	assert.throws(() => endpoint({ ...model, baseUrl: "https://proxy.example/v1" } as any), /first-party/);
	const s = setup();
	s.ctx.modelRegistry.getApiKeyAndHeaders = async () => ({ ok: true, apiKey: "secret", baseUrl: "https://proxy.example/v1" });
	await assert.rejects(requestCompaction(s.ctx, [], "", s.event.signal, async () => { throw new Error("must not fetch"); }), /first-party/);
});

test("native success persists the entire window and replays it before recent messages after reload", async t => {
	const s = setup();
	mockFetch(t, async (_url, options) => {
		const body = JSON.parse(options!.body as string);
		assert.match(JSON.stringify(body.input), /8675309/);
		assert.doesNotMatch(JSON.stringify(body.input), /Recent work/);
		assert.equal(body.instructions, "Current system prompt\n\nPreserve tests");
		return response();
	});
	s.event.customInstructions = "Preserve tests";
	const result = await s.handlers.get("session_before_compact")!(s.event, s.ctx);
	save(s, result);
	const reloaded = new Map<string, Function>();
	install({ on: (name: string, fn: Function) => reloaded.set(name, fn) } as any);
	const replay = await reloaded.get("before_provider_request")!({ payload: payload(s) }, s.ctx);
	assert.deepEqual(replay.input.slice(0, 2), output);
	assert.match(JSON.stringify(replay.input[2]), /Recent work/);
	assert.doesNotMatch(JSON.stringify(replay.input), /w-compaction:/);
	assert.deepEqual(s.notifications, []);
});

test("a second native compaction carries forward opaque state without re-summarizing raw history", async t => {
	const s = setup();
	mockFetch(t, async () => response());
	const first = await s.handlers.get("session_before_compact")!(s.event, s.ctx);
	save(s, first);
	const newBoundary = s.session.appendMessage(user("Newest work"));
	s.event.preparation = { ...s.event.preparation, firstKeptEntryId: newBoundary, previousSummary: first.compaction.summary, messagesToSummarize: [user("Recent work")] };
	t.mock.method(globalThis, "fetch", async (_url: any, options: any) => {
		const input = JSON.parse(options.body).input;
		assert.deepEqual(input.slice(0, 2), output);
		assert.match(JSON.stringify(input), /Recent work/);
		assert.doesNotMatch(JSON.stringify(input), /8675309|Newest work|w-compaction:/);
		return response();
	});
	const second = await s.handlers.get("session_before_compact")!(s.event, s.ctx);
	save(s, second);
	const restored = restoreHistory(s.session.buildSessionProjection().messages, s.session);
	assert.deepEqual(restored.filter(m => m.role === "user").map(m => m.content), ["Old requirement: preserve the sentinel 8675309", "Recent work", "Newest work"]);
});

test("native compaction preserves full tool results and honors recovery omissions", async t => {
	const s = setup();
	const session = SessionManager.inMemory();
	const omitted = session.appendMessage(user("This failed attempt must not return"));
	session.appendContextEdit(omitted, null);
	session.appendMessage(user("Read the file"));
	session.appendMessage({ role: "assistant", provider: "openai", api: "openai-responses", model: model.id, timestamp: Date.now(),
		content: [{ type: "toolCall", id: "call_read|fc_read", name: "read", arguments: { path: "file.txt" } }], stopReason: "toolUse",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
	session.appendMessage({ role: "toolResult", toolCallId: "call_read|fc_read", toolName: "read", content: [{ type: "text", text: "x".repeat(5000) + "TAIL_SENTINEL" }], isError: false, timestamp: Date.now() });
	const boundary = session.appendMessage(user("Continue here"));
	s.ctx.sessionManager = session;
	s.event.preparation.firstKeptEntryId = boundary;
	mockFetch(t, async (_url, options) => {
		const input = JSON.parse(options!.body as string).input;
		assert.equal(input.find((item: any) => item.type === "function_call").call_id, "call_read");
		assert.equal(input.find((item: any) => item.type === "function_call_output").call_id, "call_read");
		assert.match(JSON.stringify(input), /TAIL_SENTINEL/);
		assert.doesNotMatch(JSON.stringify(input), /failed attempt|Continue here/);
		return response();
	});
	assert.ok((await s.handlers.get("session_before_compact")!(s.event, s.ctx)).compaction);
});

test("HTTP, malformed, and network failures announce Pi fallback without persisting native state", async t => {
	for (const fetchImpl of [async () => new Response("secret provider detail", { status: 503 }), async () => Response.json({ output: [] }), async () => { throw new Error("network unavailable"); }]) {
		const s = setup();
		t.mock.method(globalThis, "fetch", fetchImpl);
		assert.equal(await s.handlers.get("session_before_compact")!(s.event, s.ctx), undefined);
		assert.match(s.notifications[0], /using fallback compaction \(Pi\)/);
		assert.doesNotMatch(s.notifications[0], /secret provider detail/);
		assert.equal(nativeEntries(s.session).length, 0);
	}
});

test("fallback after native compaction invokes Pi's summarizer with recovered source history", async t => {
	const s = setup();
	mockFetch(t, async () => response());
	const first = await s.handlers.get("session_before_compact")!(s.event, s.ctx);
	save(s, first);
	s.event.preparation.previousSummary = first.compaction.summary;
	s.event.preparation.messagesToSummarize = [user("More old work")];
	t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 500 }));
	let calls = 0;
	s.ctx.modelRegistry.streamSimple = (_model: any, context: any) => {
		calls++;
		assert.match(JSON.stringify(context), /8675309/);
		assert.match(JSON.stringify(context), /More old work/);
		assert.doesNotMatch(JSON.stringify(context), /opaque-state|w-compaction:/);
		const stream = createAssistantMessageEventStream();
		const message = { role: "assistant", provider: model.provider, api: model.api, model: model.id, timestamp: Date.now(),
			content: [{ type: "text", text: "Pi's portable summary" }], stopReason: "stop", usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
		stream.push({ type: "done", reason: "stop", message } as any);
		stream.end();
		return stream;
	};
	const result = await s.handlers.get("session_before_compact")!(s.event, s.ctx);
	assert.match(result.compaction.summary, /Pi's portable summary/);
	assert.equal(calls, 1);
	assert.match(s.notifications.at(-1)!, /using fallback compaction/);
});

test("cancellation does not start fallback compaction", async t => {
	const s = setup();
	const controller = new AbortController();
	s.event.signal = controller.signal;
	mockFetch(t, async () => { controller.abort(); throw new Error("aborted"); });
	assert.deepEqual(await s.handlers.get("session_before_compact")!(s.event, s.ctx), { cancel: true });
	assert.deepEqual(s.notifications, []);
});

test("model switching restores source history rather than sending opaque state to another model", async t => {
	const s = setup();
	mockFetch(t, async () => response());
	save(s, await s.handlers.get("session_before_compact")!(s.event, s.ctx));
	s.ctx.model = { ...model, provider: "anthropic", api: "anthropic-messages" };
	const result = await s.handlers.get("context")!({ messages: s.session.buildSessionProjection().messages }, s.ctx);
	assert.match(JSON.stringify(result.messages), /8675309/);
	assert.doesNotMatch(JSON.stringify(result.messages), /opaque-state|w-compaction:/);
	assert.equal(s.handlers.get("before_provider_request")!({ payload: {} }, s.ctx), undefined);
});

test("ordinary non-OpenAI compaction remains Pi's responsibility", async () => {
	const s = setup();
	s.ctx.model = { ...model, provider: "anthropic", api: "anthropic-messages" };
	assert.equal(await s.handlers.get("session_before_compact")!(s.event, s.ctx), undefined);
	assert.deepEqual(s.notifications, []);
});

test("branch summaries use original entries rather than opaque compaction markers", async t => {
	const s = setup();
	mockFetch(t, async () => response());
	save(s, await s.handlers.get("session_before_compact")!(s.event, s.ctx));
	const entries = s.session.getBranch();
	s.handlers.get("session_before_tree")!({ preparation: { entriesToSummarize: entries } }, s.ctx);
	assert.equal(entries.filter(entry => entry.type === "compaction").length, 0);
	assert.match(JSON.stringify(entries), /8675309/);
	assert.equal(nativeEntries(s.session).length, 1);
});

test("fallback failure after native compaction cancels without handing Pi an opaque marker", async t => {
	const s = setup();
	mockFetch(t, async () => response());
	const first = await s.handlers.get("session_before_compact")!(s.event, s.ctx);
	save(s, first);
	s.event.preparation.previousSummary = first.compaction.summary;
	t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 500 }));
	s.ctx.modelRegistry.streamSimple = () => { throw new Error("provider unavailable"); };
	assert.deepEqual(await s.handlers.get("session_before_compact")!(s.event, s.ctx), { cancel: true });
	assert.match(s.notifications.at(-1)!, /fallback compaction failed/);
	assert.equal(nativeEntries(s.session).length, 1);
});

test("Pi's extension loader accepts the package without import or registration errors", async t => {
	const directory = mkdtempSync(join(tmpdir(), "w-compaction-loader-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const loader = new DefaultResourceLoader({
		cwd: directory, agentDir: directory, settingsManager: SettingsManager.inMemory(),
		noExtensions: true, noSkills: true, noThemes: true, noPromptTemplates: true, noContextFiles: true,
		additionalExtensionPaths: [fileURLToPath(new URL("../index.ts", import.meta.url))],
	});
	await loader.reload();
	assert.deepEqual(loader.getExtensions().errors, []);
	assert.equal(loader.getExtensions().extensions.length, 1);
});

test("Pi's session compaction persists native state that survives a disk resume", async t => {
	const directory = mkdtempSync(join(tmpdir(), "w-compaction-session-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const settingsManager = SettingsManager.inMemory({ compaction: { enabled: true, keepRecentTokens: 5, reserveTokens: 100 } });
	const loader = new DefaultResourceLoader({
		cwd: directory, agentDir: directory, settingsManager,
		noExtensions: true, noSkills: true, noThemes: true, noPromptTemplates: true, noContextFiles: true,
		additionalExtensionPaths: [fileURLToPath(new URL("../index.ts", import.meta.url))],
	});
	await loader.reload();
	const runtime = await ModelRuntime.create({ authPath: join(directory, "auth.json"), modelsPath: null, refreshOnCreate: false });
	await runtime.setRuntimeApiKey("openai", "test-key");
	const manager = SessionManager.create(directory, directory);
	manager.appendMessage(user("Old requirement 8675309"));
	manager.appendMessage({ role: "assistant", provider: "openai", api: "openai-responses", model: model.id, timestamp: Date.now(),
		content: [{ type: "text", text: "I will preserve that requirement." }], stopReason: "stop",
		usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
	manager.appendMessage(user("New request with enough text to cross the small retained-history budget."));
	const { session } = await createAgentSession({ cwd: directory, agentDir: directory, model: model as any, modelRuntime: runtime,
		sessionManager: manager, resourceLoader: loader, settingsManager, noTools: true });
	t.after(() => session.dispose());
	await session.bindExtensions({});
	mockFetch(t, async () => response());
	const result = await session.compact();
	assert.equal((result.details as any).kind, "w-compaction/v1");
	const resumed = SessionManager.open(manager.getSessionFile()!);
	assert.deepEqual(nativeEntries(resumed)[0].details.output, output);
	assert.match(JSON.stringify(restoreHistory(resumed.buildSessionProjection().messages, resumed)), /8675309/);
});

test("live Codex compaction replays through Pi and preserves the source requirement", { skip: !process.env.W_COMPACTION_LIVE, timeout: 180_000 }, async () => {
	const s = setup();
	const runtime = await ModelRuntime.create();
	s.ctx.modelRegistry = new ModelRegistry(runtime);
	s.ctx.model = s.ctx.modelRegistry.find("openai-codex", process.env.W_COMPACTION_MODEL ?? "gpt-6-astra");
	assert.ok(s.ctx.model, "live test model must exist");
	s.ctx.hasUI = false;
	const complete = s.ctx.modelRegistry.complete.bind(s.ctx.modelRegistry);
	const events: string[] = [];
	s.ctx.modelRegistry.complete = (model: any, context: any, options: any) => complete(model, context, { ...options,
		onProviderStreamEvent: (event: any, model: any) => {
			events.push(`${event.type}:${event.item?.type ?? ""}:${JSON.stringify(event.response?.output?.map((item: any) => Object.keys(item)))}`);
			return options.onProviderStreamEvent?.(event, model);
		},
	});
	const result = await s.handlers.get("session_before_compact")!(s.event, s.ctx);
	assert.ok(result?.compaction?.details?.output, `native compaction must succeed rather than fall back; events: ${events.join(", ")}`);
	save(s, result);
	let replayed = false;
	const answer = await s.ctx.modelRegistry.complete(s.ctx.model, { messages: [
		{ role: "system", content: "Answer briefly.", timestamp: Date.now() },
		...convertToLlm(s.session.buildSessionProjection().messages),
		user("What was the numeric sentinel in my old requirement? Reply with just that number."),
	] }, { signal: AbortSignal.timeout(90_000), maxTokens: 1000, transport: "sse", onPayload: (payload: unknown) => {
		const replaced = s.handlers.get("before_provider_request")!({ payload }, s.ctx);
		replayed = replaced.input.some((item: any) => item.type === "compaction");
		return replaced;
	} });
	assert.equal(replayed, true);
	assert.equal(answer.stopReason, "stop", answer.errorMessage);
	assert.match(JSON.stringify(answer.content), /8675309/);
});

test("fallback warnings go to stderr without a UI", async t => {
	const s = setup();
	s.ctx.hasUI = false;
	mockFetch(t, async () => new Response(null, { status: 404 }));
	let stderr = "";
	t.mock.method(process.stderr, "write", (text: string) => { stderr += text; return true; });
	await s.handlers.get("session_before_compact")!(s.event, s.ctx);
	assert.match(stderr, /w-compaction:.*HTTP 404; using fallback compaction \(Pi\)/);
});
