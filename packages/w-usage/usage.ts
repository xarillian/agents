import { normalize } from "./presentation.ts";

export const endpoints = {
	claude: "https://api.anthropic.com/api/oauth/usage",
	codex: "https://chatgpt.com/backend-api/wham/usage",
	openrouter: "https://openrouter.ai/api/v1/credits",
} as const;

export type Provider = keyof typeof endpoints;

export interface Credential {
	token?: string;
	accountId?: string;
}

export interface UsageWindow {
	label: string;
	remaining: number;
	resetAt?: number;
}

export type Credits =
	| { state: "off"; reason?: string }
	| { state: "unlimited" }
	| { state: "balance"; amount: number; currency: string; decimals: number };

export interface UsageData {
	windows?: UsageWindow[];
	credits?: Credits;
}

export interface UsageResult {
	provider: Provider;
	name: "Claude Code" | "Codex" | "OpenRouter";
	configured: boolean;
	fetchedAt: number;
	windows?: UsageWindow[];
	credits?: Credits;
	unavailable?: string;
}

export interface UsageSnapshot {
	results: UsageResult[];
}

export interface CredentialSources {
	readJson?: (path: string) => Promise<unknown>;
	homeDir?: string;
	agentDir?: string;
	env?: Record<string, string | undefined>;
	now?: () => number;
}

type FetchResponse = { ok: boolean; status: number; json(): Promise<unknown> };
export type Fetch = (url: string, init: RequestInit) => Promise<FetchResponse>;

export async function collectUsage(
	credentials: Partial<Record<Provider, Credential | undefined>>,
	fetcher: Fetch = fetch,
	now = Date.now(),
): Promise<UsageSnapshot> {
	const results = await Promise.all([
		collectProviderUsage("claude", credentials.claude, fetcher, now),
		collectProviderUsage("codex", credentials.codex, fetcher, now),
		collectProviderUsage("openrouter", credentials.openrouter, fetcher, now),
	]);
	return { results };
}

export async function collectProviderUsage(
	provider: Provider,
	credential: Credential | undefined,
	fetcher: Fetch = fetch,
	now = Date.now(),
): Promise<UsageResult> {
	const stamp = { provider, name: providerName(provider), fetchedAt: now };
	if (!credential?.token) return { ...stamp, configured: false, unavailable: "no credential" };
	if (provider === "codex" && !credential.accountId) return { ...stamp, configured: false, unavailable: "no account" };
	try {
		const response = await fetcher(endpoints[provider], {
			method: "GET",
			headers: requestHeaders(provider, credential),
			redirect: "error",
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) throw new Error("request failed");
		const data = normalize(provider, await response.json());
		return data
			? { ...stamp, configured: true, ...data }
			: { ...stamp, configured: true, unavailable: "unrecognized response" };
	} catch {
		return { ...stamp, configured: true, unavailable: "request failed" };
	}
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

export function providerForModel(provider: string | undefined): Provider | undefined {
	if (provider === "anthropic") return "claude";
	if (provider === "openai-codex") return "codex";
	if (provider === "openrouter") return "openrouter";
	return undefined;
}

function providerName(provider: Provider): UsageResult["name"] {
	return provider === "claude" ? "Claude Code" : provider === "codex" ? "Codex" : "OpenRouter";
}

export { discoverCredentials } from "./credentials.ts";
export {
	compactCountdown,
	formatStatus,
	normalize,
	plainStyle,
	providerIcon,
	remainingBar,
	usageLines,
	type UsageStyle,
} from "./presentation.ts";
