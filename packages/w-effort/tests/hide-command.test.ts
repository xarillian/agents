import assert from "node:assert/strict";
import test from "node:test";
import { withoutCommand } from "../hide-command.ts";

const suggestions = (prefix: string, values: string[]) => ({
	prefix,
	items: values.map((value) => ({ value, label: value })),
});

test("a hidden command disappears from command-name completions", () => {
	const filtered = withoutCommand(suggestions("/th", ["thinking", "themes"]), "thinking");

	assert.deepEqual(filtered?.items.map((item) => item.value), ["themes"]);
});

test("hiding the only match leaves no completions at all", () => {
	assert.equal(withoutCommand(suggestions("/thinking", ["thinking"]), "thinking"), null);
});

test("arguments and paths keep every completion, even one named like the hidden command", () => {
	const argument = suggestions("/effort thi", ["thinking"]);
	const path = suggestions("/home/me/thi", ["thinking"]);

	assert.deepEqual(withoutCommand(argument, "thinking"), argument);
	assert.deepEqual(withoutCommand(path, "thinking"), path);
});
