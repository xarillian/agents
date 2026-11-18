import type { SessionEntry, Theme } from "@earendil-works/pi-coding-agent";
import { mixColors } from "@earendil-works/pi-tui";
import { renderCard } from "./card.ts";
import { formatTokens } from "./presentation.ts";

export type CacheGraphTheme = Pick<Theme, "fg" | "style"> & {
	colors: Pick<Theme["colors"], "accent" | "dim">;
};

export interface TokenTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** What the cache card shows: reuse per request, and the session's token totals beneath it. */
export interface CacheCard {
	history: readonly number[];
	totals: TokenTotals;
}

export function cacheHistory(entries: readonly SessionEntry[]): number[] {
	const samples: number[] = [];
	for (const entry of entries) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const { input, cacheRead, cacheWrite } = entry.message.usage;
		const prompt = input + cacheRead + cacheWrite;
		if (prompt > 0) samples.push(cacheRead / prompt * 100);
	}
	return samples.slice(-64);
}

export function renderCacheHistory({ history, totals }: CacheCard, width: number, pinned: boolean, theme: CacheGraphTheme): string[] {
	const bodyWidth = Math.max(0, width - 4);
	const plotWidth = Math.max(0, bodyWidth - 6);
	const samples = history.slice(-Math.max(1, plotWidth));
	const body = [theme.fg("accent", "Cache reuse") + theme.fg("muted", pinned ? " · pinned" : "")];
	if (!samples.length) {
		body.push("No history yet.");
	} else {
		const blocks = " ▁▂▃▄▅▆▇█";
		const shades = [theme.colors.accent, mixColors(theme.colors.accent, theme.colors.dim, 0.15)];
		for (let row = 3; row >= 0; row--) {
			const axis = row === 3 ? "100% │" : row === 0 ? "  0% │" : "     │";
			const bars = samples.map((percent, index) => {
				const height = Math.round(Math.max(0, Math.min(100, percent)) / 100 * 32);
				const bar = height === 0 && row === 0 ? "·" : blocks[Math.max(0, Math.min(8, height - row * 8))];
				return theme.style(bar, { fg: shades[index % 2] });
			}).join("");
			body.push(theme.fg("muted", axis) + bars);
		}
		body.push(`${samples.at(-1)!.toFixed(1)}% latest · ${samples.length} ${samples.length === 1 ? "request" : "requests"}`);
	}
	body.push(tokenLine(totals, theme));
	return renderCard(body, width, theme);
}

function tokenLine({ input, output, cacheRead, cacheWrite }: TokenTotals, theme: CacheGraphTheme): string {
	const muted = (text: string) => theme.fg("muted", text);
	return [
		`${muted("↑")}${formatTokens(input)}${muted(" in")}`,
		`${muted("↓")}${formatTokens(output)}${muted(" out")}`,
		`${formatTokens(cacheRead)}${muted(" read")}`,
		`${formatTokens(cacheWrite)}${muted(" stored")}`,
	].join("  ");
}
