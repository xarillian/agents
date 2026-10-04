import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webModel, publicUrl, type WebProvider } from "../contracts.ts";
import { SourceStore, readPage, findPassages } from "../store.ts";
import { WebTools } from "../web.ts";

function store(t: any, session = "session") {
	const directory = mkdtempSync(join(tmpdir(), "w-web-test-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	return { root: directory, value: new SourceStore(directory, session) };
}

function provider(name: WebProvider["name"] = "anthropic"): WebProvider {
	return {
		name,
		async search() { return { value: [{ url: "https://example.com/docs", title: "Docs", snippet: "Result excerpt" }] }; },
		async read() { return { value: { lines: { 0: "Intro", 1: "An API caveat", 2: "Conclusion" }, totalLines: 3 } }; },
	};
}

test("search references survive reconstruction and cached reads need no provider call", async t => {
	const cache = store(t);
	const backend = provider();
	let reads = 0;
	const read = backend.read;
	backend.read = async (...args) => { reads++; return read(...args); };
	const first = new WebTools(backend, cache.value);
	const results = await first.search("documentation");
	const id = results.details.sources[0].id;
	const page = await first.read(id);
	assert.match(page.content[0].text, /L1: An API caveat/);
	assert.equal(reads, 1);
	assert.equal(page.details.cards[0].cached, false);
	assert.deepEqual(page.details.cards[0].lines.map(line => line.text), ["Intro", "An API caveat", "Conclusion"]);

	const resumed = new WebTools(backend, new SourceStore(cache.root, "session"));
	const found = await resumed.find(id, "api");
	assert.match(found.content[0].text, /1 matches shown/);
	assert.match(found.content[0].text, /L1: An API caveat/);
	assert.equal(reads, 1);
	assert.equal(found.details.cards[0].cached, true);
	assert.deepEqual(Object.keys(found.details.sources[0]).sort(), ["id", "title", "url"]);
	assert.throws(() => new SourceStore(cache.root, "other-session").source(id), /Unknown source/);
});

test("switching providers keeps source URLs but never reuses the other provider's page", async t => {
	const cache = store(t);
	const claude = new WebTools(provider(), cache.value);
	const page = await claude.read("https://example.com/docs");
	const id = page.details.sources[0].id;
	const codex = provider("openai-codex");
	codex.read = async url => {
		assert.equal(url, "https://example.com/docs");
		return { value: { lines: { 0: "Codex's own retrieval" }, totalLines: 1 } };
	};
	const changed = await new WebTools(codex, cache.value).read(id);
	assert.match(changed.content[0].text, /Codex's own retrieval/);
	assert.doesNotMatch(changed.content[0].text, /API caveat/);
});

test("long lines can be read to completion without silently losing characters", () => {
	const text = "x".repeat(18000);
	const page = { lines: { 0: text }, totalLines: 1 };
	let next: { line: number; column: number } | undefined = { line: 0, column: 0 };
	let reconstructed = "";
	while (next) {
		const result = readPage(page, next.line, next.column);
		assert.ok(result.text.length <= 6000);
		reconstructed += result.text.replace(/^L0(?::\d+)?: /, "");
		next = result.next;
	}
	assert.equal(reconstructed, text);
});

test("a missing cached range fetches the requested line rather than claiming the page ended", async t => {
	const cache = store(t);
	const backend = provider("openai-codex");
	backend.read = async (_url, line) => ({ value: { lines: { [line]: `Passage ${line}` }, totalLines: 100 } });
	const web = new WebTools(backend, cache.value);
	const first = await web.read("https://example.com/docs", 0);
	assert.match(first.content[0].text, /line:1/);
	const later = await web.read(first.details.sources[0].id, 70);
	assert.match(later.content[0].text, /L70: Passage 70/);
	assert.equal(later.details.cards[0].cached, false);
	assert.deepEqual(later.details.cards[0].lines, [{ line: 70, column: 0, text: "Passage 70" }]);
});

test("find is literal, bounded, and points to later matches", () => {
	const page = { lines: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i, `prefix ${i} use a.b here`])), totalLines: 30 };
	const found = findPassages(page, "A.B");
	assert.equal(found.count, 8);
	assert.equal(found.nextLine, 8);
	assert.equal(findPassages(page, "a.*").count, 0);
	assert.ok(found.text.length < 6000);
});

test("unsupported providers and alternate endpoints fail instead of borrowing another login", () => {
	assert.throws(() => webModel({ provider: "openrouter" } as any), /never substituted/);
	assert.throws(() => webModel({ provider: "anthropic", api: "anthropic-messages", baseUrl: "https://example.com" } as any), /native anthropic/);
	assert.equal(webModel({ provider: "anthropic", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" } as any).provider, "anthropic");
});

test("local addresses, credentials, and non-web URLs never reach a provider", () => {
	for (const url of ["http://localhost", "http://127.0.0.1", "http://[::1]", "https://host.local", "file:///etc/passwd", "https://u:p@example.com", "https://example.com:444"]) {
		assert.throws(() => publicUrl(url));
	}
	assert.equal(publicUrl("https://example.com/docs#anchor"), "https://example.com/docs");
});
