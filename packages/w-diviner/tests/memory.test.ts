import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { answered, FRESH, ignored, isFamiliar, MemoryFile, offered, understood, type Memory } from "../memory.ts";

const ignoredTimes = (times: number) => Array.from({ length: times }).reduce<Memory>(ignored, FRESH);

test("the first two ignored cards cost nothing, then each one doubles the readings skipped, up to sixteen", () => {
	assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(times => ignoredTimes(times).readingsToSkip), [0, 0, 1, 2, 4, 8, 16, 16, 16]);
});

test("answering any card forgives every ignored one before it", () => {
	assert.deepEqual(answered(ignoredTimes(5)), FRESH);
});

test("a reading offered or understood before is familiar, whatever its case or full stop", () => {
	assert.equal(isFamiliar(offered(FRESH, "The cache is shared."), "the cache is shared"), true);
	assert.equal(isFamiliar(understood(FRESH, "Tests skip CI."), "TESTS SKIP CI."), true);
	assert.equal(isFamiliar(FRESH, "Anything at all."), false);
});

test("understanding the same reading twice remembers it once", () => {
	assert.deepEqual(understood(understood(FRESH, "One thing."), "one thing").known, ["One thing."]);
});

test("only the latest fifty offered readings are kept", () => {
	const memory = Array.from({ length: 60 }, (_, index) => `Reading ${index}.`).reduce(offered, FRESH);
	assert.equal(memory.offered.length, 50);
	assert.equal(memory.offered[0], "Reading 10.");
});

test("memory survives a round trip through its file, and a missing file means a fresh start", () => {
	const directory = mkdtempSync(join(tmpdir(), "w-diviner-"));
	try {
		const file = new MemoryFile(join(directory, "nested", "w-diviner.json"));
		assert.deepEqual(file.read(), FRESH);
		file.update(memory => ({ ...offered(memory, "Seen once."), defaultModel: { provider: "openai-codex", id: "gpt-6-luna" } }));
		assert.deepEqual(new MemoryFile(join(directory, "nested", "w-diviner.json")).read(), {
			...FRESH, offered: ["Seen once."], defaultModel: { provider: "openai-codex", id: "gpt-6-luna" },
		});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("hand-edited memory keeps what it can use and drops what it cannot", () => {
	const directory = mkdtempSync(join(tmpdir(), "w-diviner-"));
	try {
		const path = join(directory, "w-diviner.json");
		writeFileSync(path, JSON.stringify({ enabled: false, offered: ["Kept.", 3], readingsToSkip: -2, defaultModel: { provider: "" } }));
		assert.deepEqual(new MemoryFile(path).read(), { ...FRESH, enabled: false, offered: ["Kept."] });
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
