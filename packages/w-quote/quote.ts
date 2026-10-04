/** What to append so the quote is its own paragraph after the draft, with a blank line left beneath for the reply. */
export function appendQuote(draft: string, selection: string): string {
	const lead = !draft.trim() ? "" : draft.endsWith("\n\n") ? "" : draft.endsWith("\n") ? "\n" : "\n\n";

	return `${lead}${quoteBlock(selection)}\n\n`;
}

export function firstLine(selection: string): string {
	const lines = selection.trim().split("\n");
	return lines.length > 1 ? `${lines[0]} …` : (lines[0] ?? "");
}

/** Every line of the selection is quoted, blank ones too, so a multi-paragraph quote stays one block. */
const quoteBlock = (selection: string) =>
	selection
		.trim()
		.split("\n")
		.map((line) => (line.trim() ? `> ${line.trimEnd()}` : ">"))
		.join("\n");
