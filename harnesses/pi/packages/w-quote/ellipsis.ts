const ELLIPSIS = "…";
const ENDS_SENTENCE = /[.!?:;]["')\]]*$/;
const OPENS_LINE = /^\s*(?:[-*+]|\d{1,2}[.)]|#{1,6}|>)?\s*$/;

/**
 * Marks where a highlight was cut from a longer sentence. The highlight alone
 * cannot say, since a sentence may open on a lowercase name, so the text is
 * found in the replies it came from and judged by what stands around it. Text
 * found in none of them (tool output, code) is quoted exactly as highlighted.
 */
export function withEllipses(selection: string, replies: string[]): string {
	const quote = selection.trim();
	const cut = replies.map((reply) => around(reply, flatten(quote))).find((context) => context !== undefined);
	if (!cut) return quote;

	return `${cut.isCutBefore ? ELLIPSIS : ""}${quote}${cut.isCutAfter ? ELLIPSIS : ""}`;
}

function around(reply: string, quote: string) {
	const lines = plain(reply);
	const at = lines.replace(/\n/g, " ").indexOf(quote);
	if (at === -1) return undefined;

	const before = lines.slice(lines.lastIndexOf("\n", at - 1) + 1, at);
	const after = lines.slice(at + quote.length);

	return {
		isCutBefore: !OPENS_LINE.test(before) && !/[.!?:;]["')\]]*\s+$/.test(before),
		isCutAfter: !ENDS_SENTENCE.test(quote) && after !== "" && !/^\s*(\n|$)|^[.!?:;]/.test(after),
	};
}

/** Wrapped rows come back joined into lines, so whitespace is compared loosely. */
const flatten = (text: string) => text.replace(/\s+/g, " ").trim();

/** A reply as it reads on screen, line breaks kept so the start of a line can be told apart. */
const plain = (reply: string) =>
	reply
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/\*\*|__|[*`]/g, "")
		.replace(/[ \t]+/g, " ")
		.replace(/ ?\n ?/g, "\n");
