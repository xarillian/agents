import { CustomEditor, type KeybindingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import { type EditorTheme, stripTerminalSequences, type TUI } from "@earendil-works/pi-tui";

const QUOTE_ROW = /^\s*>\s/;
const RESET = /\x1b\[0m/g;
const ITALIC_ON = "\x1b[3m";
const ITALIC_OFF = "\x1b[23m";
const BG_OFF = "\x1b[49m";

/**
 * pi's editor with quote lines tinted as blocks while they are written. The
 * editor offers no styling hook, so its drawn rows are restyled; a reset inside
 * a row (the cursor, other colours) is followed by the tint again.
 */
export class QuoteEditor extends CustomEditor {
	constructor(
		tui: TUI,
		editorTheme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly appTheme: () => Theme,
	) {
		super(tui, editorTheme, keybindings);
	}

	render(width: number): string[] {
		return super.render(width).map((row) => (QUOTE_ROW.test(stripTerminalSequences(row)) ? this.tint(row) : row));
	}

	private tint(row: string): string {
		const open = `${this.appTheme().bg("userMessageBg", "\0").split("\0")[0]}${ITALIC_ON}`;
		return `${open}${row.replace(RESET, `$&${open}`)}${ITALIC_OFF}${BG_OFF}`;
	}
}
