import assert from "node:assert/strict";
import test from "node:test";
import { describeHistory, KEPT_ENTRIES, withEntry, type Entry } from "../history.ts";

const usage = { input: 7400, output: 65, cacheRead: 57500, cacheWrite: 0, totalTokens: 64965, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

test("before any reading the history says there has been none", () => {
	assert.equal(describeHistory([]), "No readings yet this session.");
});

test("each reading shows when, why, what came of it, and what it cost", () => {
	const at = new Date(2026, 9, 3, 18, 42).getTime();
	assert.equal(describeHistory([{ at, trigger: "end of run", outcome: "none", ms: 4810, usage }]),
		"Recent readings:\n  18:42  end of run  none  (4.8s, 57.5k cached, 7.4k new, 65 out)");
});

test("a skip has no cost to show", () => {
	assert.match(describeHistory([{ at: 0, trigger: "turn 7", outcome: "skipped: a card is showing" }]), /turn 7 {6}skipped: a card is showing$/);
});

test("only the latest entries are kept, and fewer still are shown", () => {
	const entries = Array.from({ length: 30 }, (_, index) => index).reduce<Entry[]>(
		(kept, index) => withEntry(kept, { at: 0, trigger: `turn ${index}`, outcome: "none" }), []);
	assert.equal(entries.length, KEPT_ENTRIES);
	assert.equal(describeHistory(entries).split("\n").length, 1 + 8);
	assert.match(describeHistory(entries), /turn 29/);
});
