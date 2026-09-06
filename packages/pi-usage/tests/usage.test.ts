import assert from "node:assert/strict";
import test from "node:test";
import {
	collectUsage,
	compactCountdown,
	discoverCredentials,
	endpoints,
	formatStatus,
	formatUsage,
	normalize,
	providerForModel,
	remainingBar,
} from "../usage.ts";

function response(body: unknown, ok = true, status = 200) {
	return { ok, status, json: async () => body };
}

test("renders fixed-width remaining bars and compact quota status", () => {
	const now = Date.UTC(2026, 0, 2, 1, 34, 5);
	assert.equal(remainingBar(0), "[░░░░░░░░░░]");
	assert.equal(remainingBar(51), "[█████░░░░░]");
	assert.equal(remainingBar(100), "[██████████]");
	assert.equal(remainingBar(60, "claude"), "[◆◆◆◆◆◆◇◇◇◇]");

	const presentation = normalize("codex", {
		rate_limit: {
			primary_window: { used_percent: 49, limit_window_seconds: 18_000, reset_at: now + 90 * 60_000 },
			secondary_window: { used_percent: 23, limit_window_seconds: 7 * 86_400, reset_at: now + (6 * 24 + 7) * 3_600_000 },
		},
	}, now);
	assert.deepEqual(presentation, {
		text: "5h [█████░░░░░] 51% remaining · resets in 1h30m · 7d [████████░░] 77% remaining · resets in 6d7h",
		status: "51% ↻ 1h30m 77% ↻ 6d7h",
	});
	assert.equal(
		formatStatus("codex", { provider: "codex", name: "Codex", text: presentation!.text, status: presentation!.status }),
		"● codex 51% ↻ 1h30m 77% ↻ 6d7h",
	);
});

test("shows OpenRouter account credits remaining without inventing quota semantics", () => {
	assert.deepEqual(normalize("openrouter", { data: { total_credits: 14.6, total_usage: 1.2 } }), {
		text: "$13.40 remaining",
		status: "$13.40 left",
	});
	assert.deepEqual(normalize("openrouter", { data: { total_credits: 1, total_usage: 2 } }), {
		text: "$0.00 remaining",
		status: "$0.00 left",
	});
	assert.equal(normalize("openrouter", { data: { total_credits: 4.6 } }), undefined);
});

test("formats reset countdowns and maps active providers safely", () => {
	const now = Date.UTC(2026, 0, 2, 1, 34, 5);
	assert.equal(compactCountdown(now - 1, now), "now");
	assert.equal(compactCountdown("not-a-date", now), undefined);
	assert.equal(compactCountdown(now + 100 * 86_400_000, now), "100d");
	assert.equal(compactCountdown(now + 90 * 60_000, now), "1h30m");
	assert.equal(providerForModel("anthropic"), "claude");
	assert.equal(providerForModel("openai-codex"), "codex");
	assert.equal(providerForModel("openrouter"), "openrouter");
	assert.equal(providerForModel("other"), undefined);
});

test("starts all provider requests concurrently and keeps successes after a failure", async () => {
	let active = 0;
	let maximumActive = 0;
	const results = await collectUsage(
		{
			claude: { token: "claude" },
			codex: { token: "codex", accountId: "account" },
			openrouter: { token: "openrouter" },
		},
		async (url) => {
			active++;
			maximumActive = Math.max(maximumActive, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active--;
			if (url === endpoints.codex) throw new Error("offline");
			if (url === endpoints.claude) return response({ five_hour: { utilization: 40 } });
			return response({ data: { total_credits: 2, total_usage: 2 } });
		},
	);

	assert.equal(maximumActive, 3);
	assert.equal(
		formatUsage(results),
		"Usage\n◆ Claude Code: 5h [◆◆◆◆◆◆◇◇◇◇] 60% remaining\n● Codex: unavailable (request failed)\n◇ OpenRouter: $0.00 remaining",
	);
});

test("reports each missing credential without making a request", async () => {
	let requests = 0;
	const results = await collectUsage({}, async () => {
		requests++;
		return response({});
	});

	assert.equal(requests, 0);
	assert.equal(
		formatUsage(results),
		"Usage\n◆ Claude Code: unavailable (no credential)\n● Codex: unavailable (no credential)\n◇ OpenRouter: unavailable (no credential)",
	);
});

test("treats unreadable credential files as absent", async () => {
	assert.deepEqual(
		await discoverCredentials({
			homeDir: "/home/test",
			agentDir: "/home/test/pi",
			env: {},
			readJson: async () => {
				throw new Error("permission denied");
			},
		}),
		{ claude: undefined, codex: undefined, openrouter: undefined },
	);
});

test("uses fresh Pi OAuth credentials without writing auth files", async () => {
	const now = 1_700_000_000_000;
	const paths: string[] = [];
	const credentials = await discoverCredentials({
		homeDir: "/home/test",
		agentDir: "/home/test/pi",
		now: () => now,
		env: { OPENROUTER_API_KEY: "environment-key" },
		readJson: async (path) => {
			paths.push(path);
			return {
				"/home/test/.claude/.credentials.json": { claudeAiOauth: { accessToken: "local-claude", expiresAt: now + 1000 } },
				"/home/test/.codex/auth.json": { tokens: { access_token: "local-codex", account_id: "local-account" } },
				"/home/test/pi/auth.json": {
					anthropic: { type: "oauth", access: "runtime-claude", refresh: "unused", expires: now + 1000 },
					"openai-codex": { type: "oauth", access: "runtime-codex", refresh: "unused", expires: now + 1000, accountId: "runtime-account" },
					openrouter: { type: "api_key", key: "runtime-openrouter" },
				},
			}[path];
		},
	});

	assert.deepEqual(paths.sort(), ["/home/test/.claude/.credentials.json", "/home/test/.codex/auth.json", "/home/test/pi/auth.json"]);
	assert.deepEqual(credentials, {
		claude: { token: "runtime-claude" },
		codex: { token: "runtime-codex", accountId: "runtime-account" },
		openrouter: { token: "runtime-openrouter" },
	});
});

test("falls back from expired Pi OAuth to local credentials and environment", async () => {
	const now = 1_700_000_000_000;
	const credentials = await discoverCredentials({
		homeDir: "/home/test",
		agentDir: "/home/test/pi",
		now: () => now,
		env: { OPENROUTER_API_KEY: "environment-key" },
		readJson: async (path) => {
			if (path.endsWith(".claude/.credentials.json")) return { claudeAiOauth: { accessToken: "local-claude", expiresAt: now + 1000 } };
			if (path.endsWith(".codex/auth.json")) return { tokens: { access_token: "local-codex", account_id: "local-account" } };
			return {
				anthropic: { type: "oauth", access: "expired-claude", refresh: "unused", expires: now - 1 },
				"openai-codex": { type: "oauth", access: "expired-codex", refresh: "unused", expires: now - 1 },
			};
		},
	});

	assert.deepEqual(credentials, {
		claude: { token: "local-claude" },
		codex: { token: "local-codex", accountId: "local-account" },
		openrouter: { token: "environment-key" },
	});
});

test("uses only exact official endpoints, GET, auth headers, redirects blocked, and finite signals", async () => {
	const requests: Array<{ url: string; init: RequestInit }> = [];
	await collectUsage(
		{
			claude: { token: "claude-token" },
			codex: { token: "codex-token", accountId: "account-id" },
			openrouter: { token: "openrouter-token" },
		},
		async (url, init) => {
			requests.push({ url, init });
			return response({ data: { total_credits: 0, total_usage: 0 } });
		},
	);

	assert.deepEqual(requests.map(({ url }) => url), [endpoints.claude, endpoints.codex, endpoints.openrouter]);
	for (const { init } of requests) {
		assert.equal(init.method, "GET");
		assert.equal(init.redirect, "error");
		assert.ok(init.signal instanceof AbortSignal);
		assert.equal((init.signal as AbortSignal).aborted, false);
	}

	const claudeHeaders = new Headers(requests[0]!.init.headers);
	assert.equal(claudeHeaders.get("authorization"), "Bearer claude-token");
	assert.equal(claudeHeaders.get("accept"), "application/json");
	assert.equal(claudeHeaders.get("anthropic-beta"), "oauth-2025-04-20");
	const codexHeaders = new Headers(requests[1]!.init.headers);
	assert.equal(codexHeaders.get("authorization"), "Bearer codex-token");
	assert.equal(codexHeaders.get("chatgpt-account-id"), "account-id");
	assert.equal(codexHeaders.get("originator"), "pi");
	assert.equal(new Headers(requests[2]!.init.headers).get("authorization"), "Bearer openrouter-token");
});
