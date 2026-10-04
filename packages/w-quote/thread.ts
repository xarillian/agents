const QUOTE_MARK = /^\s*>\s?/;
const LABEL = " pi ";
const MARKDOWN_SPECIALS = /[\\`*_<>#|~]/g;

export type Part = { kind: "text" | "quote" | "comment"; lines: string[] };

/** How the drawn thread is coloured; plain strings when no theme is at hand. */
export type Paint = {
	border: (text: string) => string;
	label: (text: string) => string;
	quote: (text: string) => string;
	reply: (text: string) => string;
};

export const hasQuote = (text: string) => text.split("\n").some((line) => QUOTE_MARK.test(line));

/**
 * Reads a message as a thread: each quote with the paragraph written straight
 * under it as its reply. Anything else (an opening, a later paragraph, another
 * question) stays plain, since not every word in a message answers a quote.
 */
export function readThread(text: string): Part[] {
	const parts: Part[] = [];

	for (const line of text.split("\n")) {
		const current = parts.at(-1);
		if (QUOTE_MARK.test(line)) {
			if (current?.kind === "quote") current.lines.push(line.replace(QUOTE_MARK, ""));
			else parts.push({ kind: "quote", lines: [line.replace(QUOTE_MARK, "")] });
		} else if (!line.trim()) {
			if (current && current.kind !== "quote") current.lines.push(line);
		} else if (current?.kind === "quote") parts.push({ kind: "comment", lines: [line] });
		else if (current?.kind === "comment" && current.lines.at(-1)?.trim()) current.lines.push(line);
		else if (current?.kind === "text") current.lines.push(line);
		else parts.push({ kind: "text", lines: [line] });
	}

	return parts.map((part) => ({ ...part, lines: trimBlankEnds(part.lines) })).filter((part) => part.lines.length > 0);
}

/**
 * Redraws a message's quotes as cards labelled with who said them, each reply
 * hung beneath with an arrow, as Markdown that pi then renders. Card rows end
 * in hard breaks so Markdown keeps them as drawn.
 */
export function drawThread(markdown: string, width: number, paint: Paint): string {
	if (!hasQuote(markdown)) return markdown;

	return readThread(markdown)
		.map((part, index) => {
			const gap = index === 0 ? "" : part.kind === "comment" ? "\\\n" : "\n\n";
			const content = part.kind === "quote" ? card(part.lines, width, paint) : part.kind === "comment" ? reply(part.lines, paint) : part.lines.join("\n");
			return gap + content;
		})
		.join("");
}

function card(lines: string[], width: number, paint: Paint): string {
	const room = Math.max(8, width - 4);
	const rows = lines.flatMap((line) => wrap(line, room));
	const inner = Math.max(LABEL.length + 1, ...rows.map((row) => row.length));
	const top = `${paint.border("╭─")}${paint.label(LABEL)}${paint.border(`${"─".repeat(inner + 1 - LABEL.length)}╮`)}`;
	const body = rows.map((row) => `${paint.border("│")} ${paint.quote(escape(row.padEnd(inner)))} ${paint.border("│")}`);
	const bottom = paint.border(`╰${"─".repeat(inner + 2)}╯`);

	return [top, ...body, bottom].join("\\\n");
}

function reply(lines: string[], paint: Paint): string {
	return lines.map((line, index) => `\u00a0\u00a0${index === 0 ? paint.reply("↳") : "\u00a0"}\u00a0${line}`).join("\\\n");
}

function wrap(line: string, room: number): string[] {
	const rows: string[] = [];
	let row = "";

	for (const word of line.split(/\s+/).filter(Boolean)) {
		if (row && row.length + 1 + word.length > room) {
			rows.push(row);
			row = "";
		}
		row = row ? `${row} ${word}` : word;
		while (row.length > room) {
			rows.push(row.slice(0, room));
			row = row.slice(room);
		}
	}

	if (row) rows.push(row);
	return rows.length > 0 ? rows : [""];
}

/**
 * Escapes what Markdown would read as syntax, so quoted words show as they were
 * written. pi drops escaped brackets, so a link is broken with a zero-width
 * space between its brackets and parentheses instead.
 */
const escape = (text: string) => text.replace(MARKDOWN_SPECIALS, "\\$&").replace(/\]\(/g, "]\u200b(");

function trimBlankEnds(lines: string[]) {
	const first = lines.findIndex((line) => line.trim());
	const last = lines.findLastIndex((line) => line.trim());

	return first === -1 ? [] : lines.slice(first, last + 1);
}
