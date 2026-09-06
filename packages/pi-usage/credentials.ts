import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Credential, CredentialSources, Provider } from "./usage.ts";

type RecordValue = Record<string, unknown>;

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

function record(value: unknown): RecordValue | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : undefined;
}

function string(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
