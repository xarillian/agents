import "./host.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { View } from "../card.ts";
import { MemoryFile } from "../memory.ts";

const { Diviner } = await import("../diviner.ts");

const FINDING = "learn: The main agent skipped the flaky test instead of fixing it.\ntag: Heads up";
const READING = `${FINDING}\nexplain:\n**One test no longer runs**\n\nIt was marked skip.`;

interface Stage { replies: (string | Error)[]; questions: string[]; editor: string; notices: string[]; views: (View | undefined)[] }

function stage(replies: (string | Error)[]) {
	const directory = mkdtempSync(join(tmpdir(), "w-diviner-"));
	const memory = new MemoryFile(join(directory, "w-diviner.json"));
	const state: Stage = { replies, questions: [], editor: "", notices: [], views: [] };
	const model = { provider: "openai-codex", id: "gpt-6-astra" };
	const ctx = {
		model,
		thinkingLevel: "off",
		sessionManager: { buildSessionProjection: () => ({ messages: [] }), getBranch: () => [], getSessionId: () => "session" },
		modelRegistry: {
			streamSimple: (_model: unknown, context: { messages: { content: { text: string }[] }[] }) => {
				state.questions.push(context.messages.at(-1)!.content[0].text);
				const reply = state.replies.shift() ?? "learn: none";
				return { result: async () => reply instanceof Error
					? { stopReason: "error", errorMessage: reply.message, content: [], usage: USAGE }
					: { stopReason: "stop", content: [{ type: "text", text: reply }], usage: USAGE } };
			},
		},
		ui: {
			getEditorText: () => state.editor,
			setEditorText: (text: string) => { state.editor = text; },
			notify: (message: string) => { state.notices.push(message); },
		},
	};
	const diviner = new Diviner(ctx as any, memory, view => state.views.push(view));
	diviner.runStarted();
	return { diviner, memory, state, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

const USAGE = { input: 7400, output: 65, cacheRead: 57500, cacheWrite: 0, totalTokens: 64965, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

const settle = () => new Promise(resolve => setImmediate(resolve));

async function offerShown(replies: (string | Error)[] = [READING]) {
	const staged = stage(replies);
	staged.diviner.turnStarted(6);
	await settle();
	return staged;
}

test("a reading worth saying becomes an offer, and is remembered as offered", async () => {
	const { diviner, memory, cleanup } = await offerShown();
	try {
		assert.equal(diviner.visible?.kind, "offer");
		assert.equal(diviner.visible?.reading.tag, "Heads up");
		assert.deepEqual(memory.read().offered, ["The main agent skipped the flaky test instead of fixing it."]);
	} finally { cleanup(); }
});

test("the observer sees what was offered before, so it can avoid repeating itself", async () => {
	const { diviner, state, cleanup } = await offerShown();
	try {
		diviner.answer("dismiss");
		diviner.runStarted();
		diviner.turnStarted(6);
		await settle();
		assert.match(state.questions[1], /- The main agent skipped the flaky test instead of fixing it\./);
	} finally { cleanup(); }
});

test("one run gets at most one offer, even after it is dismissed", async () => {
	const { diviner, state, cleanup } = await offerShown();
	try {
		diviner.answer("dismiss");
		diviner.turnStarted(6);
		await settle();
		assert.equal(state.questions.length, 1);
	} finally { cleanup(); }
});

test("a reading already offered in an earlier session is not shown again", async () => {
	const { diviner, memory, state, cleanup } = stage([READING]);
	try {
		memory.update(current => ({ ...current, offered: ["the main agent skipped the flaky test instead of fixing it"] }));
		diviner.turnStarted(6);
		await settle();
		assert.equal(diviner.visible, undefined);
		assert.equal(state.views.length, 0);
	} finally { cleanup(); }
});

test("an offer typed past twice goes away and counts as ignored", async () => {
	const { diviner, memory, cleanup } = await offerShown();
	try {
		diviner.promptSubmitted();
		assert.equal(diviner.visible?.kind, "offer");
		diviner.promptSubmitted();
		assert.equal(diviner.visible, undefined);
		assert.equal(memory.read().ignoredInARow, 1);
	} finally { cleanup(); }
});

test("while readings are being skipped, a due reading asks nothing and uses up one skip", async () => {
	const { diviner, memory, state, cleanup } = stage([READING]);
	try {
		memory.update(current => ({ ...current, readingsToSkip: 2 }));
		diviner.turnStarted(6);
		await settle();
		assert.equal(state.questions.length, 0);
		assert.equal(memory.read().readingsToSkip, 1);
	} finally { cleanup(); }
});

test("learn more opens the explanation that came with the reading, without asking again", async () => {
	const { diviner, state, cleanup } = await offerShown();
	try {
		diviner.answer("learn");
		assert.equal(diviner.visible?.kind, "explained");
		assert.equal(diviner.visible?.reading.explanation, "**One test no longer runs**\n\nIt was marked skip.");
		assert.equal(state.questions.length, 1);
	} finally { cleanup(); }
});

test("a finding that comes without an explanation is never offered", async () => {
	const { diviner, cleanup } = await offerShown([FINDING]);
	try {
		assert.equal(diviner.visible, undefined);
		assert.equal(diviner.history.at(-1)?.outcome, "unreadable reply");
	} finally { cleanup(); }
});

test("knowing it already keeps the reading out of every later offer", async () => {
	const { diviner, memory, cleanup } = await offerShown();
	try {
		diviner.answer("knew");
		assert.equal(diviner.visible, undefined);
		assert.deepEqual(memory.read().known, ["The main agent skipped the flaky test instead of fixing it."]);
	} finally { cleanup(); }
});

test("chatting about it drafts a quoted note into an empty editor", async () => {
	const { diviner, state, cleanup } = await offerShown([READING]);
	try {
		diviner.answer("learn");
		diviner.answer("discuss");
		assert.equal(state.editor, [
			"Here is a note offered by a side agent:",
			"> Heads up · The main agent skipped the flaky test instead of fixing it.",
			"> **One test no longer runs**",
			">",
			"> It was marked skip.",
			"",
		].join("\n"));
		assert.equal(diviner.visible, undefined);
	} finally { cleanup(); }
});

test("chatting about it never overwrites a half-written prompt", async () => {
	const { diviner, state, cleanup } = await offerShown([READING]);
	try {
		diviner.answer("learn");
		state.editor = "my own words";
		diviner.answer("discuss");
		assert.equal(state.editor, "my own words");
		assert.equal(diviner.visible?.kind, "explained");
	} finally { cleanup(); }
});

test("disabling takes a second press, then stays off across sessions", async () => {
	const { diviner, memory, cleanup } = await offerShown();
	try {
		diviner.answer("disable");
		assert.equal(diviner.visible?.kind === "offer" && diviner.visible.disableArmed, true);
		assert.equal(memory.read().enabled, true);
		diviner.answer("disable");
		assert.equal(diviner.visible, undefined);
		assert.equal(memory.read().enabled, false);
	} finally { cleanup(); }
});

test("a failing model is reported once, not at every reading", async () => {
	const { diviner, state, cleanup } = stage([new Error("quota exceeded"), new Error("quota exceeded")]);
	try {
		diviner.turnStarted(6);
		await settle();
		diviner.runStarted();
		diviner.turnStarted(6);
		await settle();
		assert.equal(state.questions.length, 2);
		assert.deepEqual(state.notices, ["diviner: quota exceeded"]);
	} finally { cleanup(); }
});

const finishRun = (diviner: { turnEnded(usedTools: boolean): void; runSettled(): void }, toolTurns: number) => {
	for (let turn = 0; turn < toolTurns; turn++) diviner.turnEnded(true);
	diviner.turnEnded(false);
	diviner.runSettled();
};

test("readings come every sixth turn after the first, and not between", async () => {
	const { diviner, state, cleanup } = stage([]);
	try {
		for (const index of [0, 1, 5, 7]) diviner.turnStarted(index);
		await settle();
		assert.equal(state.questions.length, 0);
		diviner.turnStarted(12);
		await settle();
		assert.equal(state.questions.length, 1);
	} finally { cleanup(); }
});

test("a run that used tools four times gets one more reading when it settles", async () => {
	const { diviner, state, cleanup } = stage([READING]);
	try {
		finishRun(diviner, 4);
		await settle();
		assert.equal(state.questions.length, 1);
		assert.equal(diviner.visible?.kind, "offer");
	} finally { cleanup(); }
});

test("a run with only three tool turns settles without a reading", async () => {
	const { diviner, state, cleanup } = stage([READING]);
	try {
		finishRun(diviner, 3);
		await settle();
		assert.equal(state.questions.length, 0);
	} finally { cleanup(); }
});

test("tool turns are counted afresh for each run", async () => {
	const { diviner, state, cleanup } = stage([]);
	try {
		finishRun(diviner, 2);
		diviner.runStarted();
		finishRun(diviner, 2);
		await settle();
		assert.equal(state.questions.length, 0);
	} finally { cleanup(); }
});

test("the end-of-run reading replaces a mid-run reading still running, since it sees more", async () => {
	const { diviner, state, cleanup } = stage(["learn: none", READING]);
	try {
		diviner.turnStarted(6);
		finishRun(diviner, 4);
		await settle();
		assert.equal(state.questions.length, 2);
		assert.equal(diviner.visible?.kind, "offer");
		assert.deepEqual(diviner.history.map(({ trigger, outcome }) => `${trigger}: ${outcome}`), [
			"turn 7: cancelled",
			"end of run: offered: The main agent skipped the flaky test instead of fixing it.",
		]);
	} finally { cleanup(); }
});

test("a reading that finds nothing still leaves its trigger, outcome, and cost in the history", async () => {
	const { diviner, cleanup } = stage(["learn: none"]);
	try {
		diviner.turnStarted(6);
		await settle();
		const [entry] = diviner.history;
		assert.equal(entry.trigger, "turn 7");
		assert.equal(entry.outcome, "none");
		assert.equal(entry.usage?.cacheRead, 57500);
		assert.equal(typeof entry.ms, "number");
	} finally { cleanup(); }
});

test("a reading skipped because a card is up says so in the history", async () => {
	const { diviner, state, cleanup } = await offerShown();
	try {
		diviner.runStarted();
		diviner.turnStarted(6);
		assert.equal(state.questions.length, 1);
		assert.equal(diviner.history.at(-1)?.outcome, "skipped: a card is showing");
	} finally { cleanup(); }
});
