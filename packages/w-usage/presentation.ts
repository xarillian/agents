import type { Provider, UsagePresentation, UsageResult } from "./usage.ts";

type RecordValue = Record<string, unknown>;
type UsageWindow = { label: string; remaining: number; resetAt?: number };

export function formatUsage(results: UsageResult[]): string {
	return ["Usage", ...results.map((result) => `${providerIcon(result.provider)} ${result.name}: ${result.text}`)].join("\n");
}

export function formatStatus(provider: Provider, result: UsageResult): string {
	return `${providerIcon(provider)} ${provider} ${result.status}`;
}

export function providerIcon(provider: Provider): "◆" | "●" | "◇" {
	if (provider === "claude") return "◆";
	if (provider === "codex") return "●";
	return "◇";
}

export function remainingBar(remaining: number, provider: Provider = "codex", width = 10): string {
	const safeWidth = Number.isInteger(width) && width > 0 && width <= 100 ? width : 10;
	const filled = Math.round((clamp(remaining, 0, 100) / 100) * safeWidth);
	const [full, empty] = provider === "claude" ? ["◆", "◇"] : ["█", "░"];
	return `[${full.repeat(filled)}${empty.repeat(safeWidth - filled)}]`;
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

export function normalize(provider: Provider, body: unknown, now = Date.now()): UsagePresentation | undefined {
	if (provider === "claude") return normalizeClaude(body, now);
	if (provider === "codex") return normalizeCodex(body, now);
	return normalizeOpenRouter(body);
}

function normalizeClaude(body: unknown, now: number): UsagePresentation | undefined {
	const data = record(body);
	return windowsPresentation("claude", [
		usageWindow("5h", data?.five_hour),
		usageWindow("7d", data?.seven_day),
		usageWindow("7d Opus", data?.seven_day_opus),
	], now);
}

function normalizeCodex(body: unknown, now: number): UsagePresentation | undefined {
	const rateLimit = record(record(body)?.rate_limit);
	return windowsPresentation("codex", [
		usageWindow("primary", rateLimit?.primary_window, true),
		usageWindow("secondary", rateLimit?.secondary_window, true),
	], now);
}

function normalizeOpenRouter(body: unknown): UsagePresentation | undefined {
	const data = record(record(body)?.data) ?? record(body);
	const credits = nonnegativeNumber(data?.total_credits);
	const usage = nonnegativeNumber(data?.total_usage);
	if (credits === undefined || usage === undefined) return undefined;
	const remaining = Math.max(0, credits - usage);
	return { text: `${money(remaining)} remaining`, status: `${money(remaining)} left` };
}

function windowsPresentation(provider: Provider, values: Array<UsageWindow | undefined>, now: number): UsagePresentation | undefined {
	const windows = values.filter((value): value is UsageWindow => Boolean(value));
	if (!windows.length) return undefined;
	return {
		text: windows.map((window) => formatWindow(provider, window, now)).join(" · "),
		status: windows.map((window) => formatWindowStatus(window, now)).join(" "),
	};
}

function usageWindow(label: string, value: unknown, deriveLabel = false): UsageWindow | undefined {
	const window = record(value);
	const utilization = number(window?.utilization) ?? number(window?.used_percent);
	if (utilization === undefined) return undefined;
	const duration = number(window?.limit_window_seconds);
	return {
		label: deriveLabel && duration !== undefined ? durationLabel(duration) : label,
		remaining: Math.round(100 - clamp(utilization, 0, 100)),
		resetAt: timestamp(window?.resets_at) ?? timestamp(window?.reset_at),
	};
}

function formatWindow(provider: Provider, window: UsageWindow, now: number): string {
	const countdown = compactCountdown(window.resetAt, now);
	const reset = countdown ? ` · resets${countdown === "now" ? " now" : ` in ${countdown}`}` : "";
	return `${window.label} ${remainingBar(window.remaining, provider)} ${window.remaining}% remaining${reset}`;
}

function formatWindowStatus(window: UsageWindow, now: number): string {
	const countdown = compactCountdown(window.resetAt, now);
	return `${window.remaining}%${countdown ? ` ↻ ${countdown}` : ""}`;
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

function durationLabel(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3_153_600_000) return "window";
	if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
	if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
	if (seconds % 60 === 0) return `${seconds / 60}m`;
	return "window";
}

function money(value: number): string {
	return `$${value.toFixed(2)}`;
}
