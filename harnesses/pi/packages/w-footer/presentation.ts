import { isAbsolute, relative, sep } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface FooterState {
	cwd: string;
	home?: string;
	branch?: string | null;
	sessionName?: string;
	model: string;
	provider?: string;
	thinking?: string;
	contextPercent: number | null;
	cacheHit?: number;
	cost: number;
	subscription: boolean;
	statuses: ReadonlyMap<string, string>;
}

type FooterTheme = Pick<Theme, "fg">;

export function renderFooter(state: FooterState, width: number, theme: FooterTheme): string[] {
	if (width <= 0) return [""];
	const figures = fittingFigures(state, width, theme);
	const place = fittingPlace(state, width - visibleWidth(figures) - 4, theme);
	const gap = " ".repeat(Math.max(4, width - visibleWidth(figures) - visibleWidth(place)));
	const lines = [truncateToWidth(place ? figures + gap + place : figures, width)];
	if (state.statuses.size) {
		const statuses = [...state.statuses].sort(([a], [b]) => a.localeCompare(b)).map(([, status]) => singleLine(status));
		lines.push(truncateToWidth(statuses.join("  "), width));
	}
	return lines;
}

function fittingFigures(state: FooterState, width: number, theme: FooterTheme): string {
	const percent = state.contextPercent;
	const tone = percent !== null && percent > 90 ? "error" : percent !== null && percent > 70 ? "warning" : "accent";
	const value = theme.fg(tone, percent === null ? "?" : `${Math.round(percent)}%`);
	const filled = percent === null ? 0 : Math.round(Math.max(0, Math.min(100, percent)) / 10);
	const meter = percent === null ? theme.fg("dim", "??????????") : theme.fg(tone, "▰".repeat(filled)) + theme.fg("dim", "▱".repeat(10 - filled));
	const cost = theme.fg("text", `$${state.cost.toFixed(2)}`) + (state.subscription ? theme.fg("muted", " (sub)") : "");
	const cache = state.cacheHit === undefined ? "" : theme.fg("muted", "◈ ") + theme.fg("accent", `${Math.round(state.cacheHit)}%`);
	const candidates = [
		[`${meter} ${value}`, cost, cache],
		[value, cost, cache],
		[value, cost],
		[value],
	].map((parts) => parts.filter(Boolean).join("  "));
	return candidates.find((line) => visibleWidth(line) <= width) ?? truncateToWidth(candidates.at(-1)!, width);
}

/** Where the session runs and on what model, in the room the figures leave; the location gives way first. */
function fittingPlace(state: FooterState, room: number, theme: FooterTheme): string {
	const muted = (text: string) => theme.fg("muted", text);
	const model = theme.fg("text", singleLine(state.model)) + (state.thinking ? muted(` · ${state.thinking}`) : "");
	const providerModel = state.provider ? muted(`${singleLine(state.provider)}/`) + model : model;
	const location = [homePath(state.cwd, state.home), state.branch, state.sessionName]
		.filter(Boolean).map((part) => singleLine(part!)).join(" · ");
	const right = visibleWidth(location) + 3 + visibleWidth(providerModel) <= room ? providerModel : model;
	if (visibleWidth(right) > room) return "";
	const locationWidth = room - visibleWidth(right) - 3;
	return locationWidth >= 12 ? muted(truncateToWidth(location, locationWidth) + " · ") + right : right;
}

export function formatTokens(count: number): string {
	if (count < 1000) return String(count);
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function homePath(cwd: string, home?: string): string {
	if (!home) return cwd;
	const suffix = relative(home, cwd);
	return suffix === "" ? "~" : suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix) ? `~${sep}${suffix}` : cwd;
}

function singleLine(value: string): string {
	return value.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}
