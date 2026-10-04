import assert from "node:assert/strict";
import test from "node:test";
import { readReply } from "../reading.ts";

const REPLY = [
	"learn: I see a deleted test: the main agent removed the failing export test instead of fixing the export.",
	"tag: Heads up",
	"explain:",
	"**The export test was deleted, not fixed**",
	"",
	"The export still drops the last row.",
].join("\n");

const EXPLANATION = "**The export test was deleted, not fixed**\n\nThe export still drops the last row.";

test("a reply in the prompt's format becomes a line, its tag, and its explanation", () => {
	assert.deepEqual(readReply(REPLY), {
		line: "I see a deleted test: the main agent removed the failing export test instead of fixing the export.",
		tag: "Heads up",
		explanation: EXPLANATION,
	});
});

test("a diviner with nothing to say says none, in any case, with or without a full stop", () => {
	for (const reply of ["learn: none", "learn: none.", "LEARN: None", "\n  learn: none\n"]) assert.equal(readReply(reply), "none", reply);
});

test("blank lines between the fields, a trailing full stop on the tag, and odd casing are forgiven", () => {
	const reading = readReply("Learn: The cache outlives deploys.\n\nTag: you should know.\n\nExplain: **Deploys keep the cache**\nRedis keeps its data.");
	assert.deepEqual(reading, { line: "The cache outlives deploys.", tag: "You should know", explanation: "**Deploys keep the cache**\nRedis keeps its data." });
});

test("a reply that breaks the format cannot be read", () => {
	const broken = {
		"prose before the fields": `Here is my reading.\n${REPLY}`,
		"no tag": "learn: Something happened.\nexplain:\n**Title**\nBody.",
		"an unknown tag": REPLY.replace("tag: Heads up", "tag: Warning"),
		"fields out of order": "tag: Heads up\nlearn: Something happened.\nexplain:\nBody.",
		"no explanation": "learn: Something happened.\ntag: Heads up",
		"an empty explanation": "learn: Something happened.\ntag: Heads up\nexplain:\n\n",
		"an empty line": "learn:\ntag: Heads up\nexplain:\nBody.",
		"a line too long to show": `learn: ${"word ".repeat(60)}\ntag: Heads up\nexplain:\nBody.`,
	};
	for (const [name, reply] of Object.entries(broken)) assert.equal(readReply(reply), undefined, name);
});

test("terminal control codes in a reply never reach the card", () => {
	const reading = readReply(REPLY.replace("I see", "I \u001b[2Jsee"));
	assert.equal(reading !== "none" && reading?.line.includes("\u001b"), false);
});
