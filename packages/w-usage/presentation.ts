import type { Credits, Provider, UsageData, UsageResult, UsageSnapshot, UsageWindow } from "./usage.ts";

type RecordValue = Record<string, unknown>;
type SortableWindow = UsageWindow & { key: string; seconds: number };

const BAR_WIDTH = 10;

/** The two lanes every provider meters, named for what they mean rather than how long they run. */
const WINDOW_NAMES: Record<number, string> = {
	18_000: "session",
	604_800: "weekly",
};

const NUMBER_WORDS: Record<string, number> = {
	one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
	eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirty: 30,
};

const UNIT_SECONDS: Record<string, number> = {
	minute: 60, hour: 3_600, day: 86_400, week: 604_800, month: 2_592_000,
};

/** Presentation seams so the same lines render plain for `-p` and themed in the TUI. */
export interface UsageStyle {
	heading(text: string): string;
	provider(provider: Provider, text: string): string;
	bar(provider: Provider, filled: string, empty: string): string;
	dim(text: string): string;
	muted(text: string): string;
}

export const plainStyle: UsageStyle = {
	heading: (text) => text,
	provider: (_provider, text) => text,
	bar: (_provider, filled, empty) => `[${filled}${empty}]`,
	dim: (text) => text,
	muted: (text) => text,
};

export function normalize(provider: Provider, body: unknown): UsageData | undefined {
	if (provider === "openrouter") return normalizeOpenRouter(body);
	const data = record(body);
	if (provider === "claude") return present(collectWindows(data), spendCredits(record(data?.spend)));
	return present(collectWindows(record(data?.rate_limit)), codexCredits(record(data?.credits)));
}

function present(windows: UsageWindow[], credits: Credits | undefined): UsageData | undefined {
	if (!windows.length && credits === undefined) return undefined;
	return { ...(windows.length ? { windows } : {}), ...(credits === undefined ? {} : { credits }) };
}

/** Anthropic bills credits through `spend`; its own disclaimer calls these "usage credits". */
function spendCredits(spend: RecordValue | undefined): Credits | undefined {
	if (!spend) return undefined;
	if (spend.enabled === false) return { state: "off", ...reasonFor(spend.disabled_reason) };
	return minorUnits(record(spend.balance));
}

function codexCredits(credits: RecordValue | undefined): Credits | undefined {
	if (!credits) return undefined;
	if (credits.unlimited === true) return { state: "unlimited" };
	if (credits.has_credits === false) return { state: "off" };
	const balance = nonnegativeNumber(Number(string(credits.balance) ?? credits.balance));
	return balance === undefined ? undefined : usd(balance);
}

/** Anthropic quotes money as minor units plus the exponent that scales them, in the account's own currency. */
function minorUnits(money: RecordValue | undefined): Credits | undefined {
	const minor = nonnegativeNumber(money?.amount_minor);
	const decimals = number(money?.exponent) ?? 2;
	if (minor === undefined || !Number.isInteger(decimals) || decimals < 0 || decimals > 6) return undefined;
	return { state: "balance", amount: minor / 10 ** decimals, currency: string(money?.currency) ?? "USD", decimals };
}

function usd(amount: number): Credits {
	return { state: "balance", amount, currency: "USD", decimals: 2 };
}

function reasonFor(value: unknown): { reason?: string } {
	const reason = string(value)?.replace(/_/g, " ");
	return reason ? { reason } : {};
}

export function usageLines(snapshot: UsageSnapshot, style: UsageStyle = plainStyle, now = Date.now()): string[] {
	const visible = snapshot.results.filter((result) => result.configured);
	const width = labelWidth(visible);
	const heading = style.heading("Usage");
	const updated = style.dim(`updated ${freshness(snapshot.fetchedAt, now)}`);
	const lines = [heading.includes("\n") ? `${heading}\n${updated}` : `${heading} · ${updated}`];
	for (const result of visible) {
		lines.push("", style.provider(result.provider, `${providerIcon(result.provider)} ${result.name}`));
		lines.push(...resultLines(result, width, style, now));
	}
	return lines;
}

export function formatStatus(provider: Provider, result: UsageResult, now = Date.now()): string {
	return `${providerIcon(provider)} ${provider} ${statusText(result, now)}`;
}

export function providerIcon(provider: Provider): "◆" | "●" | "◇" {
	if (provider === "claude") return "◆";
	if (provider === "codex") return "●";
	return "◇";
}

export function remainingBar(remaining: number, provider: Provider = "codex", width = BAR_WIDTH): string {
	const { filled, empty } = barParts(remaining, provider, width);
	return `[${filled}${empty}]`;
}

export function compactCountdown(value: unknown, now = Date.now()): string | undefined {
	const resetAt = timestamp(value);
	if (resetAt === undefined || !Number.isFinite(now)) return undefined;
	const seconds = Math.ceil((resetAt - now) / 1000);
	if (seconds <= 0) return "now";
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	if (days > 99) return `${days}d`;
	if (days) return hours ? `${days}d${hours}h` : `${days}d`;
	if (hours) return minutes ? `${hours}h${minutes}m` : `${hours}h`;
	return `${Math.max(1, minutes)}m`;
}

function resultLines(result: UsageResult, width: number, style: UsageStyle, now: number): string[] {
	if (result.unavailable) return [style.dim(`unavailable (${result.unavailable})`)];
	const lines = (result.windows ?? []).map((window) => windowLine(result.provider, window, width, style, now));
	if (result.credits !== undefined) lines.push("", `Usage credits: ${creditsText(result.credits)}`);
	return lines;
}

function windowLine(provider: Provider, window: UsageWindow, width: number, style: UsageStyle, now: number): string {
	const { filled, empty } = barParts(window.remaining, provider);
	const percent = `${window.remaining}%`.padStart(4);
	const reset = resetClause(window.resetAt, now);
	const bar = style.bar(provider, filled, empty);
	return `${window.label.padEnd(width)} ${bar} ${percent} remaining${reset ? `${style.muted(" · ")}${reset}` : ""}`;
}

function resetClause(resetAt: number | undefined, now: number): string {
	const countdown = compactCountdown(resetAt, now);
	if (!countdown) return "";
	if (countdown === "now") return "resets now";
	return `resets in ${countdown} (${absoluteReset(resetAt!, now)})`;
}

/** Same-day resets read better as a bare clock time; anything further needs the date to be actionable. */
function absoluteReset(resetAt: number, now: number): string {
	const date = new Date(resetAt);
	const hour = date.getHours();
	const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${pad2(date.getMinutes())} ${hour < 12 ? "am" : "pm"}`;
	if (resetAt - now < 86_400_000) return clock;
	return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)} ${clock}`;
}

function freshness(fetchedAt: number, now: number): string {
	const seconds = Math.max(0, Math.round((now - fetchedAt) / 1000));
	if (seconds < 45) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}

function labelWidth(results: UsageResult[]): number {
	const labels = results.flatMap((result) => result.windows?.map((window) => window.label) ?? []);
	return labels.reduce((widest, label) => Math.max(widest, label.length), 0);
}

function creditsText(credits: Credits): string {
	if (credits.state === "off") return credits.reason ? `Off (${credits.reason})` : "Off";
	if (credits.state === "unlimited") return "Unlimited";
	return `${money(credits)} remaining`;
}

function statusText(result: UsageResult, now: number): string {
	if (result.unavailable) return "unavailable";
	if (!result.windows?.length && result.credits !== undefined) {
		const credits = result.credits;
		if (credits.state === "off") return "credits off";
		if (credits.state === "unlimited") return "unlimited";
		return `${money(credits)} left`;
	}
	return (result.windows ?? [])
		.map((window) => {
			const countdown = compactCountdown(window.resetAt, now);
			return `${window.remaining}%${countdown ? ` ↻ ${countdown}` : ""}`;
		})
		.join(" ");
}

/**
 * Enumerates whatever windows the payload carries rather than naming them, so a provider
 * renaming a quota key drops a bar loudly at review time instead of silently at runtime.
 */
function collectWindows(root: RecordValue | undefined): UsageWindow[] {
	if (!root) return [];
	const windows: SortableWindow[] = [];
	for (const [key, value] of Object.entries(root)) {
		const window = record(value);
		const utilization = number(window?.utilization) ?? number(window?.used_percent);
		if (!window || utilization === undefined) continue;
		// A quota window states how long it runs. Anything else carrying `utilization` is a
		// different kind of object (Anthropic's `extra_usage`) or an unnamed bucket we cannot label.
		const duration = number(window.limit_window_seconds) ?? parseWindowKey(key).seconds;
		if (duration === undefined) continue;
		windows.push({
			key,
			label: windowLabel(key, duration),
			remaining: Math.round(100 - clamp(utilization, 0, 100)),
			resetAt: timestamp(window.resets_at) ?? timestamp(window.reset_at),
			seconds: duration,
		});
	}
	return windows
		.sort((a, b) => a.seconds - b.seconds || a.key.localeCompare(b.key))
		.map(({ key: _key, seconds: _seconds, ...window }) => window);
}

function windowLabel(key: string, duration: number): string {
	const parsed = parseWindowKey(key);
	const label = durationLabel(duration);
	if (label === "window") return parsed.qualifier ?? key;
	// Only a key that spelled out its own duration can also be carrying a model qualifier.
	const qualifier = parsed.seconds === undefined ? undefined : parsed.qualifier;
	const name = WINDOW_NAMES[duration];
	if (!name) return qualifier ? `${label} ${qualifier}` : label;
	return `${qualifier ? `${name} ${qualifier}` : name} (${label})`;
}

/** `seven_day_fable` carries both its duration and the model it meters; `primary_window` carries neither. */
function parseWindowKey(key: string): { seconds?: number; qualifier?: string } {
	const parts = key.split("_");
	const count = NUMBER_WORDS[parts[0] ?? ""];
	const unit = UNIT_SECONDS[(parts[1] ?? "").replace(/s$/, "")];
	if (count === undefined || unit === undefined) return { qualifier: key.replace(/_/g, " ") };
	const qualifier = parts.slice(2).join(" ");
	return { seconds: count * unit, qualifier: qualifier || undefined };
}

function durationLabel(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3_153_600_000) return "window";
	if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
	if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
	if (seconds % 60 === 0) return `${seconds / 60}m`;
	return "window";
}

function barParts(remaining: number, provider: Provider, width = BAR_WIDTH): { filled: string; empty: string } {
	const safeWidth = Number.isInteger(width) && width > 0 && width <= 100 ? width : BAR_WIDTH;
	const count = Math.round((clamp(remaining, 0, 100) / 100) * safeWidth);
	const [full, empty] = provider === "claude" ? ["◆", "◇"] : ["█", "░"];
	return { filled: full.repeat(count), empty: empty.repeat(safeWidth - count) };
}

function normalizeOpenRouter(body: unknown): UsageData | undefined {
	const data = record(record(body)?.data) ?? record(body);
	const credits = nonnegativeNumber(data?.total_credits);
	const usage = nonnegativeNumber(data?.total_usage);
	if (credits === undefined || usage === undefined) return undefined;
	return { credits: usd(Math.max(0, credits - usage)) };
}

function money({ amount, currency, decimals }: Extract<Credits, { state: "balance" }>): string {
	const value = `$${amount.toFixed(decimals)}`;
	return currency === "USD" ? value : `${value} ${currency}`;
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function record(value: unknown): RecordValue | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : undefined;
}

function number(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function string(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonnegativeNumber(value: unknown): number | undefined {
	const parsed = number(value);
	return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function timestamp(value: unknown): number | undefined {
	let result: number;
	if (typeof value === "number") result = value < 1_000_000_000_000 ? value * 1000 : value;
	else if (typeof value === "string" && value.trim()) {
		const numeric = Number(value);
		result = Number.isFinite(numeric) ? (numeric < 1_000_000_000_000 ? numeric * 1000 : numeric) : Date.parse(value);
	} else return undefined;
	return Number.isFinite(result) && result > 0 && result <= 8_640_000_000_000_000 ? result : undefined;
}
