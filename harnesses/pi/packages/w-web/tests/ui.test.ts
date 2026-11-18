import { piRoot } from "./host.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import type { SourceCard } from "../contracts.ts";
import { DEFAULT_WEB_MODEL, MODEL_ENTRY, WebModelSelection } from "../model.ts";

const { KeybindingsManager } = await import(pathToFileURL(join(piRoot, "dist/core/keybindings.js")).href);
const { initTheme, ToolExecutionComponent } = await import("@earendil-works/pi-coding-agent");
const { setKeybindings, visibleWidth } = await import("@earendil-works/pi-tui");
const { sourceTextMetrics, webRenderers } = await import("../render.ts");
const { registerWebModelCommand } = await import("../model-picker.ts");
const { default: install } = await import("../index.ts");
initTheme("dark", false);
const keys = KeybindingsManager.create("/nonexistent-w-web-test");
setKeybindings(keys);
const plain = (lines: string[]) => lines.join("\n").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
const card: SourceCard = {
	source: { id: "s_123", title: "A source title", url: "https://example.com/docs" }, kind: "passage",
	lines: Array.from({ length: 12 }, (_, line) => ({ line: line + 10, text: `Original passage ${line} with 猫 and é.` })),
	cached: true, notice: "[wordlim: 200]", continuation: "Continue: web_read({source:\"s_123\",line:22,column:0})",
};
const result = {
	isError: false,
	content: [{ type: "text" as const, text: "Model-facing wrapper and bounded source evidence." }],
	details: { model: DEFAULT_WEB_MODEL, provider: "openai-codex", sources: [card.source], cards: [card] },
};

function toolComponent(current = () => DEFAULT_WEB_MODEL) {
	const tool = { name: "web_read", ...webRenderers("Fetch", current) };
	return new ToolExecutionComponent("web_read", "call", { source: "s_123" }, {}, tool as any, { requestRender() {} } as any, tmpdir());
}

test("source byte counts exclude line labels and UTF-8 bytes are not mistaken for token counts", () => {
	const metrics = sourceTextMetrics({ ...card, lines: [{ line: 100000, column: 999, text: "猫😀é" }, { text: "abcd" }] });
	assert.equal(metrics.bytes, 15);
	assert.equal(metrics.tokens, 3);
});

test("native tool expansion reveals source lines and preserves the recorded model after selection changes", () => {
	let model = DEFAULT_WEB_MODEL;
	const component = toolComponent(() => model);
	assert.match(plain(component.render(100)), /Fetch\(s_123\).*gpt-6-luna/s);
	component.updateResult(result);
	let text = plain(component.render(100));
	assert.match(text, /Fetch\(https:\/\/example.com\/docs\)/);
	assert.match(text, /┌ A source title/);
	assert.match(text, /returned text · ~\d+ tokens · cached/);
	assert.match(text, /Original passage 0/);
	assert.doesNotMatch(text, /Original passage 11|Model-facing wrapper/);

	component.setExpanded(true);
	text = plain(component.render(100));
	assert.match(text, /21 │ Original passage 11/);
	assert.match(text, /wordlim: 200/);
	assert.match(text, /Continue: web_read/);
	model = { ...DEFAULT_WEB_MODEL, id: "gpt-6-astra" };
	component.invalidate();
	assert.match(plain(component.render(100)), /gpt-6-luna/);
	assert.doesNotMatch(plain(component.render(100)), /gpt-6-astra/);

	component.handleMouse({ type: "click", button: "left", x: 4, y: 5, width: 100, height: component.render(100).length } as any);
	assert.doesNotMatch(plain(component.render(100)), /Original passage 11/);
});

test("cards stay within narrow terminal widths through expansion, resizing and theme changes", () => {
	const component = toolComponent();
	component.updateResult(result);
	for (const expanded of [false, true]) {
		component.setExpanded(expanded);
		for (const width of [1, 2, 4, 9, 24, 40, 80, 120]) {
			for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width, `width ${width}: ${JSON.stringify(line)}`);
		}
	}
	const dark = component.render(80);
	initTheme("light", false);
	component.invalidate();
	assert.notDeepEqual(component.render(80), dark);
	initTheme("dark", false);
});

test("pending, failed and historical results remain visible without invented source cards", () => {
	const component = toolComponent();
	component.updateResult({ isError: false, content: [], details: { ...result.details, cards: [], sources: [] } }, true);
	assert.match(plain(component.render(80)), /Retrieving/);
	component.updateResult({ content: [{ type: "text", text: "Provider request cancelled" }], details: result.details, isError: true });
	assert.match(plain(component.render(80)), /Provider request cancelled/);
	assert.doesNotMatch(plain(component.render(80)), /Original passage/);
	component.updateResult({ isError: false, content: [{ type: "text", text: "Legacy source excerpt" }], details: undefined });
	assert.match(plain(component.render(80)), /Legacy source excerpt/);
	assert.match(plain(component.render(80)), /web model not recorded/);
});

function pickerFixture(t: any) {
	const root = mkdtempSync(join(tmpdir(), "w-web-picker-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const selection = new WebModelSelection(join(root, "w-web.json"));
	const luna = { ...DEFAULT_WEB_MODEL, api: "openai-codex-responses", baseUrl: "https://chatgpt.com", name: "GPT-6 Luna" };
	const astra = { ...luna, id: "gpt-6-astra", name: "GPT-6 Astra" };
	const models = [luna, astra, { ...luna, provider: "unsupported" }, { ...luna, provider: "anthropic", id: "claude", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" }];
	const branch: any[] = [];
	let command: any;
	let input = "\r";
	let rendered = "";
	const notices: string[] = [];
	const ctx = {
		mode: "tui", model: astra, scopedModels: [],
		sessionManager: { getBranch: () => branch },
		modelRegistry: {
			getAvailable: () => models,
			find: (provider: string, id: string) => models.find(model => model.provider === provider && model.id === id),
			isUsingOAuth: () => true,
			getError: () => undefined,
			refresh: async () => ({ errors: new Map() }),
		},
		ui: {
			notify: (text: string) => notices.push(text),
			custom: (factory: any) => new Promise(resolve => {
				const theme = { fg: (_token: string, text: string) => text, bold: (text: string) => text };
				const component = factory({ requestRender() {} }, theme, keys, (value: unknown) => { component.dispose(); resolve(value); });
				component.focused = true;
				assert.equal(component.focused, true);
				rendered = plain(component.render(100));
				component.handleInput(input);
			}),
		},
	} as any;
	registerWebModelCommand({
		registerCommand: (name: string, value: any) => { assert.equal(name, "web-model"); command = value; },
		appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", customType, data }),
	} as any, selection);
	return { ctx, selection, branch, notices, rendered: () => rendered, run: async (query = "", key = "\r") => { input = key; await command.handler(query, ctx); } };
}

test("the host picker filters unsupported auth, searches, cancels and saves only the web default", async t => {
	const f = pickerFixture(t);
	await f.run("astra", "\u001b");
	assert.equal(f.branch.length, 0);
	assert.equal(f.selection.defaultModel().id, "gpt-6-luna");
	assert.match(f.rendered(), /Web model/);
	assert.match(f.rendered(), /gpt-6-astra/);
	assert.doesNotMatch(f.rendered(), /\[unsupported\]|\[anthropic\]/);
	await f.run("astra");
	assert.equal(f.selection.selected(f.ctx).id, "gpt-6-astra");
	assert.equal(f.selection.defaultModel().id, "gpt-6-luna");
	await f.run("astra", "\u0013");
	assert.equal(f.selection.defaultModel().id, "gpt-6-astra");
	assert.equal(f.ctx.model.id, "gpt-6-astra");
	assert.ok(f.notices.some(text => text.includes("saved default")));
	await f.run("luna");
	assert.equal(f.selection.selected(f.ctx).id, "gpt-6-luna");
	assert.equal(f.ctx.model.id, "gpt-6-astra");
});

test("the extension resolves the independent web model and streams its identity before retrieval", async t => {
	const f = pickerFixture(t);
	const previous = process.env.PI_CODING_AGENT_DIR;
	const root = mkdtempSync(join(tmpdir(), "w-web-extension-"));
	process.env.PI_CODING_AGENT_DIR = root;
	t.after(() => { if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; rmSync(root, { recursive: true, force: true }); });
	const tools: any[] = [];
	install({ registerTool: (tool: any) => tools.push(tool), registerCommand() {}, on() {} } as any);
	f.ctx.sessionManager.getSessionId = () => "test";
	f.ctx.model = { provider: "unsupported", id: "conversation" };
	f.ctx.modelRegistry.getApiKeyAndHeaders = async (model: any) => { assert.equal(model.id, "gpt-6-luna"); return { ok: false, error: "No fixture credentials" }; };
	const updates: any[] = [];
	const failed = await tools[0].execute("call", { query: "fixture" }, undefined, (result: any) => updates.push(result), f.ctx);
	assert.equal(updates[0].details.model.id, "gpt-6-luna");
	assert.equal(failed.isError, true);
	assert.equal(failed.details.model.id, "gpt-6-luna");
	assert.match(failed.content[0].text, /needs a Codex login/);
	assert.equal(f.ctx.model.id, "conversation");
	f.branch.push({ type: "custom", customType: MODEL_ENTRY, data: { provider: "unsupported", id: "gpt-6-luna" } });
	const unsupported = await tools[0].execute("call", { query: "fixture" }, undefined, undefined, f.ctx);
	assert.equal(unsupported.isError, true);
	assert.match(unsupported.content[0].text, /never substituted/);
});
