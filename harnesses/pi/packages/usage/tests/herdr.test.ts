import assert from "node:assert/strict";
import { test } from "node:test";
import { cooldownState, createHerdrCooldownReporter } from "../herdr.ts";
import type { UsageResult } from "../usage.ts";

const NOW = 1_795_728_000_000;

const claudeResult = (windows: UsageResult["windows"], fetchedAt = NOW): UsageResult => ({
	provider: "claude",
	name: "Claude Code",
	configured: true,
	fetchedAt,
	windows,
});

test("reports the latest exhausted reset timestamp for Claude windows", () => {
	const state = cooldownState(
		"claude",
		claudeResult([
			{ label: "session (5h)", remaining: 0, resetAt: NOW + 3_600_000 },
			{ label: "weekly (7d)", remaining: 0, resetAt: NOW + 86_400_000 },
		]),
		NOW,
	);
	assert.deepEqual(state, {
		pool: "claude",
		checked: true,
		resetAt: NOW + 86_400_000,
		clearCooldown: false,
	});
});

test("publishes cooldown labels on transitions and clears them when switching providers", () => {
	const calls: string[][] = [];
	let clock = NOW;
	const reporter = createHerdrCooldownReporter({
		terminalId: "t7",
		runHc: (args) => calls.push(args),
		now: () => clock,
	});

	const exhausted = claudeResult([{ label: "session (5h)", remaining: 0, resetAt: NOW + 7_200_000 }], NOW);
	assert.equal(reporter.report("claude", exhausted), true);
	assert.deepEqual(calls.at(-1), [
		"label",
		"t7",
		"usage.pool=claude",
		`usage.cooldown=${NOW + 7_200_000}`,
		`usage.at=${NOW}`,
	]);

	// Unchanged poll shortly after does not re-run hc.
	clock = NOW + 10_000;
	assert.equal(reporter.report("claude", exhausted), false);
	assert.equal(calls.length, 1);

	// Switching to OpenRouter clears the terminal's cooldown without overwriting Claude's pool timestamp.
	clock = NOW + 20_000;
	assert.equal(reporter.report("openrouter", undefined), true);
	assert.deepEqual(calls.at(-1), ["label", "t7", "usage.pool=openrouter", "usage.cooldown="]);
});

test("does not publish when HC_TERMINAL_ID is absent", () => {
	const calls: string[][] = [];
	const reporter = createHerdrCooldownReporter({ terminalId: "", runHc: (args) => calls.push(args) });
	assert.equal(reporter.report("claude", claudeResult([{ label: "session (5h)", remaining: 0, resetAt: NOW + 60_000 }])), false);
	assert.equal(calls.length, 0);
});
