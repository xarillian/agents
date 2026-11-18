import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function renderCard(body: string[], width: number, theme: Pick<Theme, "fg">): string[] {
	const bodyWidth = Math.max(0, width - 4);
	const rule = theme.fg("border", "─".repeat(Math.max(0, width - 2)));
	const lines = [theme.fg("border", "╭") + rule + theme.fg("border", "╮")];
	for (const line of body) {
		const clipped = truncateToWidth(line, bodyWidth);
		lines.push(theme.fg("border", "│ ") + clipped + " ".repeat(Math.max(0, bodyWidth - visibleWidth(clipped))) + theme.fg("border", " │"));
	}
	lines.push(theme.fg("border", "╰") + rule + theme.fg("border", "╯"));
	return lines.map((line) => truncateToWidth(line, width));
}
