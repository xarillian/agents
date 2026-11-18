import assert from "node:assert/strict";
import test from "node:test";
import { normalize, usageCardLines } from "../presentation.ts";
import type { UsageResult } from "../usage.ts";

const now = Date.UTC(2026, 9, 3, 12);
const result: UsageResult = { provider: "claude", name: "Claude Code", configured: true, fetchedAt: now };

test("the usage card keeps normalized window order, qualifiers, and reset countdowns", () => {
	const data = normalize("claude", {
		seven_day_sonnet: { utilization: 40, resets_at: now + 86_400_000 },
		five_hour: { utilization: 100, resets_at: now - 1_000 },
		seven_day: { utilization: 20 },
	});
	assert.deepEqual(usageCardLines({ ...result, ...data }, now), [
		"session (5h)        0% left ↻ now",
		"weekly (7d)         80% left",
		"weekly sonnet (7d)  60% left ↻ 1d",
	]);
});

test("credit-only accounts show their balance without inventing rate limits", () => {
	const data = normalize("openrouter", { data: { total_credits: 5, total_usage: 1.25 } });
	assert.deepEqual(usageCardLines({ ...result, ...data }, now), ["Usage credits: $3.75 remaining"]);
});

test("an unavailable result hides old limits rather than presenting them as current", () => {
	assert.deepEqual(usageCardLines({ ...result, windows: [{ label: "session", remaining: 73 }], unavailable: "request failed" }, now), [
		"Unavailable (request failed)",
	]);
});
