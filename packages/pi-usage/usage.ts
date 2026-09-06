import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
export const endpoints = {
	claude: "https://api.anthropic.com/api/oauth/usage",
	codex: "https://chatgpt.com/backend-api/wham/usage",
	openrouter: "https://openrouter.ai/api/v1/credits",
} as const;
export type Provider = keyof typeof endpoints;
export interface Credential { token?: string; accountId?: string }
export interface UsageResult { provider: Provider; name: "Claude Code" | "Codex" | "OpenRouter"; text: string; status: string }
export interface UsagePresentation { text: string; status: string }
export interface CredentialSources {
	readJson?: (path: string) => Promise<unknown>; homeDir?: string; agentDir?: string;
	env?: Record<string, string | undefined>; now?: () => number;
}
type FetchResponse = { ok: boolean; status: number; json(): Promise<unknown> };
type Fetch = (url: string, init: RequestInit) => Promise<FetchResponse>;
type RecordValue = Record<string, unknown>;
type UsageWindow = { label: string; remaining: number; resetAt?: number };
export async function discoverCredentials(sources: CredentialSources = {}): Promise<Record<Provider, Credential | undefined>> {
	const home = sources.homeDir ?? homedir();
	const configuredAgentDir = process.env.PI_CODING_AGENT_DIR;
	const agentDir = expandHome(
		sources.agentDir ?? (configuredAgentDir?.trim() ? configuredAgentDir : join(home, ".pi", "agent")),
		home,
	);
	const readJson = sources.readJson ?? readJsonFile;
	const timestamp = (sources.now ?? Date.now)();
	const [claudeData, codexData, piData] = await Promise.all([
		safeReadJson(readJson, join(home, ".claude", ".credentials.json")),
		safeReadJson(readJson, join(home, ".codex", "auth.json")),
		safeReadJson(readJson, join(agentDir, "auth.json")),
	]);
	return {
		claude: runtimeCredential(piData, "anthropic", timestamp, true) ?? claudeLocalCredential(claudeData, timestamp),
		codex: runtimeCredential(piData, "openai-codex", timestamp, true) ?? codexLocalCredential(codexData),
		openrouter:
			runtimeCredential(piData, "openrouter", timestamp) ?? tokenCredential((sources.env ?? process.env).OPENROUTER_API_KEY),
	};
}
export async function collectUsage(
	credentials: Partial<Record<Provider, Credential | undefined>>,
	fetcher: Fetch = fetch,
	now = Date.now(),
): Promise<UsageResult[]> {
	return Promise.all([
		collectProviderUsage("claude", credentials.claude, fetcher, now),
		collectProviderUsage("codex", credentials.codex, fetcher, now),
		collectProviderUsage("openrouter", credentials.openrouter, fetcher, now),
	]);
}
export async function collectProviderUsage(
	provider: Provider,
	credential: Credential | undefined,
	fetcher: Fetch = fetch,
	now = Date.now(),
): Promise<UsageResult> {
	const name = providerName(provider);
	if (!credential?.token) return unavailable(provider, name, "no credential");
	if (provider === "codex" && !credential.accountId) return unavailable(provider, name, "no account");
	try {
		const response = await fetcher(endpoints[provider], {
			method: "GET",
			headers: requestHeaders(provider, credential),
			redirect: "error",
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) throw new Error("request failed");
		const presentation = normalize(provider, await response.json(), now);
		return presentation
			? { provider, name, ...presentation }
			: unavailable(provider, name, "unrecognized response");
	} catch {
		return unavailable(provider, name, "request failed");
	}
}
export function formatUsage(results: UsageResult[]): string {
	return ["Usage", ...results.map((result) => `${providerIcon(result.provider)} ${result.name}: ${result.text}`)].join("\n");
}
export function providerForModel(provider: string | undefined): Provider | undefined {
	if (provider === "anthropic") return "claude";
	if (provider === "openai-codex") return "codex";
	if (provider === "openrouter") return "openrouter";
	return undefined;
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
export function requestHeaders(provider: Provider, credential: Credential): HeadersInit {
	const authorization = `Bearer ${credential.token}`;
	if (provider === "claude") {
		return { Authorization: authorization, Accept: "application/json", "anthropic-beta": "oauth-2025-04-20" };
	}
	if (provider === "codex") {
		return { Authorization: authorization, Accept: "application/json", "chatgpt-account-id": credential.accountId!, originator: "pi" };
	}
	return { Authorization: authorization, Accept: "application/json" };
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
function durationLabel(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3_153_600_000) return "window";
	if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
	if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
	if (seconds % 60 === 0) return `${seconds / 60}m`;
	return "window";
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
function providerName(provider: Provider): UsageResult["name"] {
	return provider === "claude" ? "Claude Code" : provider === "codex" ? "Codex" : "OpenRouter";
}
function unavailable(provider: Provider, name: UsageResult["name"], reason: string): UsageResult {
	return { provider, name, text: `unavailable (${reason})`, status: "unavailable" };
}
function money(value: number): string {
	return `$${value.toFixed(2)}`;
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
function string(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function tokenCredential(value: unknown): Credential | undefined {
	const token = string(value);
	return token ? { token } : undefined;
}
function claudeLocalCredential(body: unknown, now: number): Credential | undefined {
	const oauth = record(record(body)?.claudeAiOauth);
	return oauth && fresh(oauth.expiresAt, now, true) ? tokenCredential(oauth.accessToken) : undefined;
}
function codexLocalCredential(body: unknown): Credential | undefined {
	const tokens = record(record(body)?.tokens);
	const credential = tokenCredential(tokens?.access_token);
	if (!credential) return undefined;
	const accountId = string(tokens?.account_id) ?? accountIdFromToken(credential.token!);
	if (accountId) credential.accountId = accountId;
	return credential;
}
function runtimeCredential(body: unknown, provider: string, now: number, oauthOnly = false): Credential | undefined {
	const stored = record(record(body)?.[provider]);
	if (!stored) return undefined;
	const isOAuth = stored.type === "oauth";
	if (oauthOnly && !isOAuth) return undefined;
	const credential = tokenCredential(isOAuth ? stored.access : stored.type === "api_key" ? stored.key : undefined);
	if (!credential || (isOAuth && !fresh(stored.expires, now))) return undefined;
	const accountId = string(stored.accountId) ?? accountIdFromToken(credential.token!);
	if (accountId) credential.accountId = accountId;
	return credential;
}
function fresh(value: unknown, now: number, optional = false): boolean {
	if (value === undefined) return optional;
	return typeof value === "number" && Number.isFinite(value) && value > now;
}
function accountIdFromToken(token: string): string | undefined {
	try {
		const payload = token.split(".")[1];
		if (!payload) return undefined;
		const data = record(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
		return string(record(data?.["https://api.openai.com/auth"])?.chatgpt_account_id);
	} catch {
		return undefined;
	}
}
async function readJsonFile(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return undefined;
	}
}
async function safeReadJson(readJson: (path: string) => Promise<unknown>, path: string): Promise<unknown> {
	try {
		return await readJson(path);
	} catch {
		return undefined;
	}
}
function expandHome(path: string, home: string): string {
	return path === "~" ? home : path.startsWith("~/") ? join(home, path.slice(2)) : path;
}
function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
