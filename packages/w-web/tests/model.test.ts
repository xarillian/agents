import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_WEB_MODEL, MODEL_ENTRY, WebModelSelection } from "../model.ts";

const luna = { ...DEFAULT_WEB_MODEL, api: "openai-codex-responses", baseUrl: "https://chatgpt.com" };
const astra = { ...luna, id: "gpt-6-astra" };

function fixture(t: any) {
	const root = mkdtempSync(join(tmpdir(), "w-web-model-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const path = join(root, "w-web.json");
	let branch: any[] = [];
	const ctx = {
		model: { provider: "unsupported-conversation-provider", id: "conversation-model" },
		modelRegistry: { find: (provider: string, id: string) => [luna, astra].find(model => model.provider === provider && model.id === id) },
		sessionManager: { getBranch: () => branch },
	} as any;
	return { path, ctx, selection: new WebModelSelection(path), branch: (entries: any[]) => { branch = entries; } };
}

function entry(id: string) { return { type: "custom", customType: MODEL_ENTRY, data: { provider: "openai-codex", id } }; }

test("web selection defaults to Luna regardless of the conversation model", t => {
	const { selection, ctx } = fixture(t);
	assert.equal(selection.resolve(ctx), luna);
	assert.equal(ctx.model.id, "conversation-model");
});

test("session overrides follow the active branch and the saved default survives reconstruction", t => {
	const f = fixture(t);
	f.selection.saveDefault(astra);
	assert.equal(new WebModelSelection(f.path).resolve(f.ctx), astra);
	f.branch([entry(luna.id)]);
	assert.equal(f.selection.resolve(f.ctx), luna);
	f.branch([entry(luna.id), entry(astra.id)]);
	assert.equal(f.selection.resolve(f.ctx), astra);
	f.branch([entry(luna.id)]);
	assert.equal(f.selection.resolve(f.ctx), luna);
	f.branch([]);
	assert.equal(f.selection.resolve(f.ctx), astra);
});

test("unavailable configured models and malformed settings fail without selecting a replacement", t => {
	const f = fixture(t);
	writeFileSync(f.path, JSON.stringify({ defaultModel: { provider: "openai-codex", id: "not-present" } }));
	assert.throws(() => f.selection.resolve(f.ctx), /not-present.*unavailable.*no other model/);
	writeFileSync(f.path, "broken json");
	assert.throws(() => f.selection.resolve(f.ctx), SyntaxError);
	assert.throws(() => f.selection.saveDefault(luna), SyntaxError);
	assert.equal(readFileSync(f.path, "utf8"), "broken json");
	f.branch([{ type: "custom", customType: MODEL_ENTRY, data: {} }]);
	assert.throws(() => f.selection.resolve(f.ctx), /Invalid web model reference/);
});

test("saving a default preserves other settings and does not persist a whole model definition", t => {
	const f = fixture(t);
	writeFileSync(f.path, JSON.stringify({ other: { keep: true } }));
	f.selection.saveDefault(astra);
	assert.deepEqual(JSON.parse(readFileSync(f.path, "utf8")), { other: { keep: true }, defaultModel: { provider: "openai-codex", id: "gpt-6-astra" } });
});

test("a saved Claude subscription selection is rejected before credential resolution", t => {
	const f = fixture(t);
	f.selection.saveDefault({ provider: "anthropic", id: "claude" });
	f.ctx.modelRegistry = {
		find: () => ({ provider: "anthropic", id: "claude", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" }),
		isUsingOAuth: () => true,
		getApiKeyAndHeaders: () => assert.fail("must not resolve subscription credentials"),
	};
	assert.throws(() => f.selection.resolve(f.ctx), /does not use Claude subscription credentials/);
});
