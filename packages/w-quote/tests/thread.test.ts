import assert from "node:assert/strict";
import test from "node:test";
import { drawThread, readThread } from "../thread.ts";

const plain = (text: string) => text;
const PAINT = { border: plain, label: plain, quote: plain, reply: plain };

test("a message without quotes is left as written", () => {
	assert.equal(drawThread("just a thought", 60, PAINT), "just a thought");
});

test("a quote becomes a card labelled pi, its reply directly beneath with an arrow", () => {
	assert.equal(
		drawThread("> drop it\n\nok", 60, PAINT),
		["╭─ pi ────╮", "│ drop it │", "╰─────────╯", "\u00a0\u00a0↳\u00a0ok"].join("\\\n"),
	);
});

test("multiline replies are inset two columns with continuation lines aligned to the text", () => {
	const drawn = drawThread("> hello\n\nfirst line\nsecond line", 60, PAINT);
	assert.ok(drawn.endsWith("╯\\\n\u00a0\u00a0↳\u00a0first line\\\n\u00a0\u00a0\u00a0\u00a0second line"));
});

test("separate paragraphs and later quote cards keep their spacing", () => {
	const drawn = drawThread("> one\n\nreply\n\nAnother thought\n\n> two\n\nnext reply", 60, PAINT);
	assert.ok(drawn.includes("\u00a0\u00a0↳\u00a0reply\n\nAnother thought\n\n╭"));
	assert.ok(drawn.endsWith("╯\\\n\u00a0\u00a0↳\u00a0next reply"));
});

test("a long quote wraps inside its card, every row as wide as the others and none wider than the space", () => {
	const rows = drawThread("> source has three producers and zero consumers", 24, PAINT).split("\\\n");

	assert.ok(rows.length > 3);
	assert.ok(rows.every((row) => row.length === rows[0]!.length && row.length <= 24));
});

test("quoted words that look like Markdown are escaped so they show as written", () => {
	assert.match(drawThread("> a *b* `c`", 40, PAINT), /a \\\*b\\\* \\`c\\`/);
});

test("only the paragraph under a quote is its reply; later paragraphs stand alone", () => {
	assert.deepEqual(readThread("> one\n\new, drop it\n\nAnother Q: logs?"), [
		{ kind: "quote", lines: ["one"] },
		{ kind: "comment", lines: ["ew, drop it"] },
		{ kind: "text", lines: ["Another Q: logs?"] },
	]);
});
