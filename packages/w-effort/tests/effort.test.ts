import assert from "node:assert/strict";
import test from "node:test";
import { completeEffortLevel, readEffortRequest } from "../effort.ts";

const CODEX_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

test("an argument the model accepts becomes the level to apply", () => {
	assert.deepEqual(readEffortRequest(" XHigh ", CODEX_LEVELS), { kind: "level", level: "xhigh" });
});

test("an argument the model does not accept is reported rather than clamped", () => {
	assert.deepEqual(readEffortRequest("minimal", CODEX_LEVELS), { kind: "unsupported", requested: "minimal" });
});

test("no argument leaves the level unspecified, so the caller can ask", () => {
	assert.deepEqual(readEffortRequest("   ", CODEX_LEVELS), { kind: "unspecified" });
});

test("completion offers only the accepted levels that continue what was typed", () => {
	assert.deepEqual(completeEffortLevel("x", CODEX_LEVELS), [{ value: "xhigh", label: "xhigh" }]);
	assert.equal(completeEffortLevel("off", CODEX_LEVELS), null);
});
