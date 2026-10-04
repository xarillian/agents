import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type Focusable, Input, matchesKey, SelectList, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import { type Prompt, searchPrompts } from "./history.ts";

export type Scope = "project" | "everywhere";
export type HistoryChoice = { action: "run" | "edit"; prompt: string };

const VISIBLE_PROMPTS = 10;
const SCOPE_LABELS: Record<Scope, string> = { project: "this project", everywhere: "everywhere" };

/** Esc keeps the selected prompt rather than discarding it, as in Claude Code; Ctrl+C is the way out. */
export class HistorySearch implements Component, Focusable {
	private readonly query = new Input();
	private readonly border: DynamicBorder;
	private scope: Scope = "project";
	private prompts: Prompt[] | undefined;
	private failure: string | undefined;
	private matches: Prompt[] = [];
	private list: SelectList;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly load: (scope: Scope) => Promise<Prompt[]>,
		private readonly done: (choice: HistoryChoice | undefined) => void,
	) {
		this.border = new DynamicBorder((text) => theme.fg("accent", text));
		this.list = this.listOf([]);
		void this.loadScope();
	}

	get focused(): boolean {
		return this.query.focused;
	}

	set focused(focused: boolean) {
		this.query.focused = focused;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "enter")) return this.choose("run");
		if (matchesKey(data, "tab") || matchesKey(data, "escape")) return this.choose("edit");
		if (matchesKey(data, "ctrl+c")) return this.done(undefined);
		if (matchesKey(data, "ctrl+s")) return this.switchScope();
		if (matchesKey(data, "ctrl+r")) return this.selectOlder();
		if (matchesKey(data, "up") || matchesKey(data, "down")) return this.moveSelection(data);

		const before = this.query.getValue();
		this.query.handleInput(data);
		if (this.query.getValue() !== before) this.refilter();
		this.tui.requestRender();
	}

	render(width: number): string[] {
		return [
			...this.border.render(width),
			this.header(width),
			...this.query.render(width),
			...this.results(width),
			truncateToWidth(this.theme.fg("dim", "enter run · tab edit · ctrl+r older · ctrl+s scope · ctrl+c cancel"), width),
			...this.border.render(width),
		];
	}

	invalidate(): void {
		this.list.invalidate();
	}

	private header(width: number): string {
		const other = this.scope === "project" ? "everywhere" : "project";
		const title = `${this.theme.bold("Search prompts")} ${this.theme.fg("muted", `· ${SCOPE_LABELS[this.scope]}`)}`;
		return truncateToWidth(`${title}  ${this.theme.fg("dim", `ctrl+s ${SCOPE_LABELS[other]}`)}`, width);
	}

	private results(width: number): string[] {
		if (this.failure) return [this.theme.fg("error", `  Couldn't read prompt history: ${this.failure}`)];
		if (!this.prompts) return [this.theme.fg("muted", "  Searching prompts…")];
		if (this.matches.length === 0) return [this.theme.fg("warning", this.prompts.length ? "  No matching prompts" : "  No history yet")];
		return this.list.render(width);
	}

	private choose(action: HistoryChoice["action"]): void {
		const selected = this.list.getSelectedItem();
		this.done(selected ? { action, prompt: this.matches[Number(selected.value)].text } : undefined);
	}

	private async switchScope(): Promise<void> {
		this.scope = this.scope === "project" ? "everywhere" : "project";
		await this.loadScope();
	}

	private async loadScope(): Promise<void> {
		const scope = this.scope;
		this.prompts = undefined;
		this.failure = undefined;
		this.tui.requestRender();

		try {
			const prompts = await this.load(scope);
			if (scope !== this.scope) return;
			this.prompts = prompts;
			this.refilter();
		} catch (error) {
			if (scope !== this.scope) return;
			this.failure = error instanceof Error ? error.message : String(error);
		}
		this.tui.requestRender();
	}

	private refilter(): void {
		this.matches = searchPrompts(this.prompts ?? [], this.query.getValue());
		this.list = this.listOf(this.matches);
	}

	private selectOlder(): void {
		const selected = this.list.getSelectedItem();
		this.list.setSelectedIndex(selected ? Number(selected.value) + 1 : 0);
		this.tui.requestRender();
	}

	private moveSelection(data: string): void {
		this.list.handleInput(data);
		this.tui.requestRender();
	}

	private listOf(prompts: Prompt[]): SelectList {
		const items = prompts.map((prompt, index) => ({
			value: String(index),
			label: `${age(prompt.timestamp).padStart(3)}  ${prompt.text.replace(/\s+/g, " ")}`,
		}));
		return new SelectList(items, VISIBLE_PROMPTS, {
			selectedPrefix: (text) => this.theme.fg("accent", text),
			selectedText: (text) => this.theme.fg("accent", text),
			description: (text) => this.theme.fg("dim", text),
			scrollInfo: (text) => this.theme.fg("dim", text),
			noMatch: (text) => this.theme.fg("warning", text),
		});
	}
}

function age(timestamp: number): string {
	const minutes = Math.floor((Date.now() - timestamp) / 60_000);
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
	return `${Math.floor(minutes / (60 * 24))}d`;
}
