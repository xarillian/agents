import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Markdown, type Component, type TUI, type TuiMouseEvent, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Reading } from "./reading.ts";

export type View =
	| { kind: "offer"; reading: Reading; promptsSurvived: number; disableArmed: boolean }
	| { kind: "explained"; reading: Reading };

export type Answer = "learn" | "knew" | "disable" | "dismiss" | "understood" | "discuss";

interface Button { key: string; label: string; answer: Answer; quiet?: boolean }

export function buttonsOf(view: View): Button[] {
	switch (view.kind) {
		case "offer": return [
			{ key: "1", label: "Learn more", answer: "learn" },
			{ key: "2", label: "Knew this already", answer: "knew" },
			{ key: "4", label: view.disableArmed ? "Press again to disable" : "Disable", answer: "disable", quiet: true },
			{ key: "0", label: "Dismiss", answer: "dismiss" },
		];
		case "explained": return [
			{ key: "1", label: "Understood", answer: "understood" },
			{ key: "2", label: "Chat in main session", answer: "discuss" },
			{ key: "0", label: "Dismiss", answer: "dismiss" },
		];
	}
}

const STAR = "\u2726";
const INSET = "  ";
const GAP = "   ";

interface Hit { row: number; start: number; end: number; answer: Answer }

/** The reading above the editor. It shows nothing until the diviner has something to say. */
export class DivinerCard implements Component {
	private view: View | undefined;
	private explanation: Markdown | undefined;
	private hits: Hit[] = [];
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly onAnswer: (answer: Answer) => void;

	constructor(tui: TUI, theme: Theme, onAnswer: (answer: Answer) => void) {
		this.tui = tui;
		this.theme = theme;
		this.onAnswer = onAnswer;
	}

	show(view: View | undefined): void {
		this.view = view;
		this.explanation = view?.kind === "explained" ? new Markdown(view.reading.explanation, INSET.length, 0, getMarkdownTheme()) : undefined;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		this.hits = [];
		const view = this.view;
		if (!view) return [];
		const { tag, line } = view.reading;
		const heading = wrapTextWithAnsi(this.starred(`${this.theme.fg("muted", `${tag} \u00B7`)} ${line}`), width);
		const body = this.explanation ? ["", ...this.explanation.render(width)] : [];
		const above = ["", ...heading, ...body];
		return [...above, ...this.buttonRows(buttonsOf(view), width, above.length)];
	}

	handleMouse(event: TuiMouseEvent) {
		if (event.button !== "left") return undefined;
		const hit = this.hits.find(({ row, start, end }) => event.y === row && event.x >= start && event.x < end);
		if (!hit) return undefined;
		if (event.type === "press") this.onAnswer(hit.answer);
		return { handled: true };
	}

	invalidate(): void {
		this.explanation?.invalidate();
	}

	private starred(text: string): string {
		return `${this.theme.fg("accent", STAR)} ${text}`;
	}

	/** Lays the buttons out left to right, starting a new row when the next one would not fit. */
	private buttonRows(buttons: Button[], width: number, firstRow: number): string[] {
		const rows: string[] = [];
		let row = INSET;
		for (const button of buttons) {
			const label = `${this.theme.fg("accent", button.key)} ${this.theme.fg(button.quiet ? "dim" : "text", button.label)}`;
			if (row !== INSET && visibleWidth(`${row}${GAP}${label}`) > width) {
				rows.push(row);
				row = INSET;
			}
			if (row !== INSET) row += GAP;
			const start = visibleWidth(row);
			row += label;
			this.hits.push({ row: firstRow + rows.length, start, end: visibleWidth(row), answer: button.answer });
		}
		return [...rows, row].map(text => truncateToWidth(text, width));
	}
}
