import type { SessionEntry } from "@earendil-works/pi-coding-agent";

const REPLIES_SEARCHED = 10;

/** The assistant's latest replies on the current branch, newest first, as the text they showed. */
export function recentReplies(branch: readonly SessionEntry[]): string[] {
	return branch
		.flatMap((entry) => (entry.type === "message" && entry.message.role === "assistant" ? [replyText(entry.message.content)] : []))
		.filter((text) => text.trim() !== "")
		.slice(-REPLIES_SEARCHED)
		.reverse();
}

function replyText(content: unknown): string {
	if (!Array.isArray(content)) return typeof content === "string" ? content : "";

	return content
		.flatMap((block) => (block && typeof block === "object" && block.type === "text" && typeof block.text === "string" ? [block.text] : []))
		.join("\n");
}
