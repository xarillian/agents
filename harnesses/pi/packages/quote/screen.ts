import { stripTerminalSequences } from "@earendil-works/pi-tui";

/** Rows of the screen run together as one text, since a highlight may wrap across them. */
export function isOnScreen(text: string, screenLines: readonly string[]): boolean {
	const screen = flatten(screenLines.map(stripTerminalSequences).join(" "));
	return screen.includes(flatten(text));
}

const flatten = (text: string) => text.replace(/\s+/g, " ").trim();
