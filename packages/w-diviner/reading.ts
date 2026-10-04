export type Tag = "You should know" | "Heads up";

export interface Reading {
	line: string;
	tag: Tag;
	/** Shown on "Learn more"; a reading without one is never offered. */
	explanation: string;
}

const TAGS: Tag[] = ["Heads up", "You should know"];
const MAX_LINE = 240;

/**
 * Reads a reply in the prompt's format: "learn:", "tag:", and "explain:" on
 * their own lines, in that order. "none" when the diviner saw nothing;
 * undefined when the reply breaks the format.
 */
export function readReply(reply: string): Reading | "none" | undefined {
	const lines = withoutControlCodes(reply).split("\n");
	let next = 0;
	const field = (name: string) => {
		while (next < lines.length && lines[next].trim() === "") next++;
		return lines[next++]?.trim().match(new RegExp(`^${name}:\\s*(.*)$`, "i"))?.[1].trim();
	};

	const line = field("learn");
	if (line === undefined) return undefined;
	if (/^none\.?$/i.test(line)) return "none";
	const tagged = field("tag")?.replace(/\.$/, "").toLowerCase();
	const tag = TAGS.find(name => name.toLowerCase() === tagged);
	const opening = field("explain");
	const explanation = opening === undefined ? "" : [opening, ...lines.slice(next)].join("\n").trim();

	if (line === "" || line.length > MAX_LINE || !tag || explanation === "") return undefined;
	return { line, tag, explanation };
}

/** The reply can echo transcript text, so terminal control codes are dropped before they reach the card. */
const withoutControlCodes = (text: string) => text.replace(/[^\P{Cc}\n\t]/gu, "");
