import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { recentReplies } from "../replies.ts";

const message = (role: "user" | "assistant", text: string) =>
	({ type: "message", message: { role, content: [{ type: "text", text }] } }) as unknown as SessionEntry;

test("the assistant's replies come back newest first, the person's own words left out", () => {
	const branch = [message("user", "hi"), message("assistant", "first reply"), message("user", "more"), message("assistant", "second reply")];

	assert.deepEqual(recentReplies(branch), ["second reply", "first reply"]);
});

test("a reply's text blocks are joined, and a reply with no text is skipped", () => {
	const toolOnly = { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "bash" }] } } as unknown as SessionEntry;
	const twoBlocks = { type: "message", message: { role: "assistant", content: [{ type: "text", text: "one" }, { type: "text", text: "two" }] } } as unknown as SessionEntry;

	assert.deepEqual(recentReplies([twoBlocks, toolOnly]), ["one\ntwo"]);
});

test("only the latest ten replies are searched", () => {
	const branch = Array.from({ length: 12 }, (_, at) => message("assistant", `reply ${at}`));

	assert.deepEqual(recentReplies(branch).at(-1), "reply 2");
});
