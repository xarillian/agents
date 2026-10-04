import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectDirs, readPrompts, searchPrompts } from "../history.ts";

type Entry = { role: string; content: unknown; at: string };

async function sessionsRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), "w-history-"));
}

async function writeSession(dir: string, name: string, entries: Entry[], tail = ""): Promise<void> {
	await mkdir(dir, { recursive: true });
	const header = JSON.stringify({ type: "session", version: 3, id: name, timestamp: entries[0]?.at, cwd: "/project" });
	const lines = entries.map(({ role, content, at }) => JSON.stringify({ type: "message", id: at, timestamp: at, message: { role, content } }));
	await writeFile(join(dir, `${name}.jsonl`), [header, ...lines].join("\n") + "\n" + tail);
}

test("prompts come back newest first, and a prompt sent twice appears once at its latest time", async () => {
	const project = join(await sessionsRoot(), "--project--");
	await writeSession(project, "monday", [
		{ role: "user", content: "fix the build", at: "2026-10-01T09:00:00Z" },
		{ role: "user", content: "write the changelog", at: "2026-10-01T10:00:00Z" },
	]);
	await writeSession(project, "friday", [{ role: "user", content: "fix the build", at: "2026-10-05T09:00:00Z" }]);

	const prompts = await readPrompts([project]);

	assert.deepEqual(
		prompts.map((prompt) => [prompt.text, new Date(prompt.timestamp).toISOString()]),
		[
			["fix the build", "2026-10-05T09:00:00.000Z"],
			["write the changelog", "2026-10-01T10:00:00.000Z"],
		],
	);
});

test("only what the user typed counts: replies, tool results, images, and blank prompts are left out", async () => {
	const project = join(await sessionsRoot(), "--project--");
	await writeSession(project, "session", [
		{ role: "user", content: [{ type: "text", text: "describe this" }, { type: "image", data: "…" }], at: "2026-10-01T09:00:00Z" },
		{ role: "assistant", content: [{ type: "text", text: "a cat" }], at: "2026-10-01T09:00:01Z" },
		{ role: "toolResult", content: [{ type: "text", text: "ls output" }], at: "2026-10-01T09:00:02Z" },
		{ role: "user", content: "   ", at: "2026-10-01T09:00:03Z" },
	]);

	const prompts = await readPrompts([project]);

	assert.deepEqual(prompts.map((prompt) => prompt.text), ["describe this"]);
});

test("a half-written prompt at the end of a live session is skipped, not fatal", async () => {
	const project = join(await sessionsRoot(), "--project--");
	await writeSession(project, "live", [{ role: "user", content: "first", at: "2026-10-01T09:00:00Z" }], '{"type":"message","message":{"role":"user","content":"sec');

	const prompts = await readPrompts([project]);

	assert.deepEqual(prompts.map((prompt) => prompt.text), ["first"]);
});

test("a project without a session folder has no history yet rather than an error", async () => {
	const prompts = await readPrompts([join(await sessionsRoot(), "--never-used--")]);

	assert.deepEqual(prompts, []);
});

test("every project folder under the sessions root is searched everywhere", async () => {
	const root = await sessionsRoot();
	await writeSession(join(root, "--alpha--"), "a", [{ role: "user", content: "alpha prompt", at: "2026-10-01T09:00:00Z" }]);
	await writeSession(join(root, "--beta--"), "b", [{ role: "user", content: "beta prompt", at: "2026-10-02T09:00:00Z" }]);

	const prompts = await readPrompts(await projectDirs(root));

	assert.deepEqual(prompts.map((prompt) => prompt.text), ["beta prompt", "alpha prompt"]);
});

test("search finds the query anywhere in a prompt, ignoring case, and keeps newest first", () => {
	const prompts = [
		{ text: "Refactor the Footer", timestamp: 3 },
		{ text: "add tests", timestamp: 2 },
		{ text: "footer padding is off", timestamp: 1 },
	];

	assert.deepEqual(searchPrompts(prompts, "footer").map((prompt) => prompt.text), ["Refactor the Footer", "footer padding is off"]);
	assert.equal(searchPrompts(prompts, "").length, 3);
});
