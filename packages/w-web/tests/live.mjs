import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const piRoot = process.env.PI_PACKAGE_ROOT ?? resolve(dirname(process.execPath), "../lib/node_modules/@earendil-works/pi-coding-agent");
const { DefaultResourceLoader, ModelRuntime, ModelRegistry, SettingsManager, SessionManager } = await import(pathToFileURL(join(piRoot, "dist/index.js")).href);
const provider = process.argv[2] ?? "openai-codex";
if (!["openai-codex", "anthropic"].includes(provider)) throw new Error("Pass openai-codex or anthropic.");
const runtime = await ModelRuntime.create();
const models = runtime.getAvailableSnapshot().filter(model => model.provider === provider);
const requestedModel = process.env.W_WEB_TEST_MODEL ?? (provider === "anthropic" ? "claude-haiku-4-5" : "gpt-6-luna");
const model = models.find(model => model.id === requestedModel);
if (!model) throw new Error(requestedModel ? `Model ${provider}/${requestedModel} is not available in Pi.` : provider === "anthropic" ? "Anthropic live verification requires explicit API-key access, not a Claude subscription." : "Live verification needs /login openai-codex in Pi.");
const root = mkdtempSync(join(tmpdir(), "w-web-live-"));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = root;
try {
	writeFileSync(join(root, "w-web.json"), JSON.stringify({ defaultModel: { provider, id: model.id } }));
	const loader = new DefaultResourceLoader({
		cwd: root, agentDir: root, settingsManager: SettingsManager.inMemory({ packages: [] }),
		noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
		additionalExtensionPaths: [fileURLToPath(new URL("../index.ts", import.meta.url))],
	});
	await loader.reload();
	const loaded = loader.getExtensions();
	assert.deepEqual(loaded.errors, []);
	const tools = loaded.extensions.flatMap(extension => [...extension.tools.values()].map(tool => tool.definition));
	assert.deepEqual(tools.map(tool => tool.name), ["web_search", "web_read", "web_find"]);
	const ctx = { model: { ...model, provider: "unrelated-conversation-provider" }, modelRegistry: new ModelRegistry(runtime), sessionManager: SessionManager.inMemory(root) };
	async function run(name, args) {
		const result = await tools.find(tool => tool.name === name).execute(crypto.randomUUID(), args, AbortSignal.timeout(90_000), undefined, ctx);
		assert.notEqual(result.isError, true, result.content[0].text);
		assert.equal(result.details.provider, provider);
		assert.deepEqual(result.details.model, { provider, id: model.id });
		assert.ok(Array.isArray(result.details.cards));
		assert.ok(result.content[0].text.length < 10_000);
		console.log(`PASS ${provider}/${model.id} ${name}: ${result.content[0].text.length} characters`);
		return result;
	}
	const search = await run("web_search", { query: "site:nodejs.org/api/globals.html AbortSignal.any" });
	assert.ok(search.details.sources.length > 0);
	const found = await run("web_find", { source: "https://nodejs.org/api/globals.html", pattern: "AbortSignal.any" });
	const line = found.content[0].text.match(/^L(\d+).*AbortSignal\.any/m)?.[1];
	assert.ok(line, "The native source should contain the documented API.");
	const page = await run("web_read", { source: found.details.sources[0].id, line: Number(line), limit: 8 });
	assert.match(page.content[0].text, /AbortSignal\.any/);
	const continuation = page.content[0].text.match(/Continue: web_read\(\{source:"([^"]+)",line:(\d+),column:(\d+)\}\)/);
	assert.ok(continuation, "The document should have a readable continuation.");
	const next = await run("web_read", { source: continuation[1], line: Number(continuation[2]), column: Number(continuation[3]), limit: 8 });
	assert.equal(next.details.sources[0].id, page.details.sources[0].id);
	assert.ok(next.content[0].text.includes(`L${continuation[2]}${Number(continuation[3]) ? `:${continuation[3]}` : ""}: `));

	if (provider === "openai-codex") {
		const reddit = await run("web_read", { source: "https://www.reddit.com/r/vibecoding/comments/1srmzph/using_claude_max_plan_on_pi_the_only_thing_that/", limit: 40 });
		assert.match(reddit.content[0].text, /Using Claude Max Plan on Pi/);
		const passage = await run("web_find", { source: reddit.details.sources[0].id, pattern: "extra usage" });
		assert.match(passage.content[0].text, /L\d+.*extra usage/i);
	}

	const searchTool = tools.find(tool => tool.name === "web_search");
	ctx.sessionManager.appendCustomEntry("w-web:model", { provider: "unsupported", id: model.id });
	const unsupported = await searchTool.execute(crypto.randomUUID(), { query: "must not leave the process" }, undefined, undefined, {
		...ctx, modelRegistry: { find: () => ({ ...model, provider: "unsupported" }) },
	});
	assert.equal(unsupported.isError, true);
	assert.match(unsupported.content[0].text, /never substituted/);
	ctx.sessionManager.appendCustomEntry("w-web:model", { provider: "anthropic", id: "claude-fixture" });
	const subscription = await searchTool.execute(crypto.randomUUID(), { query: "must not leave the process" }, undefined, undefined, {
		...ctx,
		modelRegistry: {
			find: () => ({ ...model, provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" }),
			isUsingOAuth: () => true,
		},
	});
	assert.equal(subscription.isError, true);
	assert.match(subscription.content[0].text, /does not use Claude subscription credentials/);
	console.log("PASS extension guards: unsupported providers and simulated Claude subscription auth fail before retrieval");
} finally {
	rmSync(root, { recursive: true, force: true });
	if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
}
