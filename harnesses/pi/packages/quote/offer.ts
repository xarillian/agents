import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, type TuiMouseEvent, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { firstLine } from "./quote.ts";

const QUOTE_LABEL = "[ Quote ]";
const DISMISS_LABEL = "✕";

type Columns = { start: number; end: number };

/**
 * The line above the editor offering the current highlight. It shows only
 * while something is highlighted, and never offers the same text twice once
 * it has been quoted or dismissed. It acts on the press, since the press may
 * clear the highlight and take the offer with it before the release.
 */
export class QuoteOffer implements Component {
	private highlight: string | undefined;
	private settled: string | undefined;
	private quoteColumns: Columns = { start: 0, end: 0 };
	private dismissColumns: Columns = { start: 0, end: 0 };

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly onQuote: (selection: string) => void,
	) {}

	offer(selection: string | undefined): void {
		const next = selection && selection !== this.settled ? selection : undefined;
		if (next === this.highlight) return;

		this.highlight = next;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		if (this.highlight === undefined) return [];

		const mark = `${this.theme.fg("warning", "❝")} `;
		const buttons = `  ${this.theme.fg("accent", QUOTE_LABEL)}  ${this.theme.fg("dim", DISMISS_LABEL)}`;
		const room = Math.max(1, width - visibleWidth(mark) - visibleWidth(buttons));
		const text = truncateToWidth(firstLine(this.highlight), room);

		const quoteStart = visibleWidth(mark) + visibleWidth(text) + 2;
		this.quoteColumns = { start: quoteStart, end: quoteStart + QUOTE_LABEL.length };
		this.dismissColumns = { start: this.quoteColumns.end + 2, end: this.quoteColumns.end + 2 + visibleWidth(DISMISS_LABEL) };

		return [truncateToWidth(`${mark}${text}${buttons}`, width)];
	}

	handleMouse(event: TuiMouseEvent) {
		if (this.highlight === undefined || event.button !== "left") return undefined;

		const target = within(event.x, this.quoteColumns) ? "quote" : within(event.x, this.dismissColumns) ? "dismiss" : undefined;
		if (!target) return undefined;
		if (event.type !== "press") return { handled: true };

		if (target === "quote") this.onQuote(this.highlight);
		this.settled = this.highlight;
		this.offer(undefined);
		return { handled: true };
	}

	invalidate(): void {}
}

const within = (x: number, { start, end }: Columns) => x >= start && x < end;
