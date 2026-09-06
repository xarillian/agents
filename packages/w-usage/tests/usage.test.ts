import assert from "node:assert/strict";
import test from "node:test";
import {
	type UsageSnapshot,
	collectUsage,
	compactCountdown,
	discoverCredentials,
	endpoints,
	formatStatus,
	normalize,
	plainStyle,
	providerForModel,
	remainingBar,
	usageLines,
} from "../usage.ts";

function response(body: unknown, ok = true, status = 200) {
	return { ok, status, json: async () => body };
}

/** Local time, because the screen prints reset clocks in the reader's timezone. */
const AFTERNOON = new Date(2026, 8, 5, 15, 0, 0).getTime();

function screen(): UsageSnapshot {
	const inTwoAndAHalfDays = AFTERNOON + (2 * 24 + 15) * 3_600_000;
	return {
		fetchedAt: AFTERNOON,
		results: [
			{
				provider: "claude",
				name: "Claude Code",
				configured: true,
				windows: [
					{ label: "session (5h)", remaining: 87, resetAt: AFTERNOON + 56 * 60_000 },
					{ label: "weekly (7d)", remaining: 81, resetAt: inTwoAndAHalfDays },
					{ label: "weekly opus (7d)", remaining: 62, resetAt: inTwoAndAHalfDays },
				],
			},
			{ provider: "codex", name: "Codex", configured: false, unavailable: "no credential" },
			{ provider: "openrouter", name: "OpenRouter", configured: true, credits: { state: "balance", amount: 10, currency: "USD", decimals: 2 } },
		],
	};
}

test("renders fixed-width remaining bars", () => {
	assert.equal(remainingBar(0), "[░░░░░░░░░░]");
	assert.equal(remainingBar(51), "[█████░░░░░]");
	assert.equal(remainingBar(100), "[██████████]");
	assert.equal(remainingBar(60, "claude"), "[◆◆◆◆◆◆◇◇◇◇]");
});

test("puts freshness below a multiline title", () => {
	const style = { ...plainStyle, heading: () => "USAGE\nUSAGE" };
	assert.equal(usageLines(screen(), style, AFTERNOON)[0], "USAGE\nUSAGE\nupdated just now");
});

test("aligns every window into one column and drops providers you have no credential for", () => {
	assert.deepEqual(usageLines(screen(), plainStyle, AFTERNOON), [
		"Usage · updated just now",
		"",
		"◆ Claude Code",
		"session (5h)     [◆◆◆◆◆◆◆◆◆◇]  87% remaining · resets in 56m (3:56 pm)",
		"weekly (7d)      [◆◆◆◆◆◆◆◆◇◇]  81% remaining · resets in 2d15h (08/09 6:00 am)",
		"weekly opus (7d) [◆◆◆◆◆◆◇◇◇◇]  62% remaining · resets in 2d15h (08/09 6:00 am)",
		"",
		"◇ OpenRouter",
		"",
		"Usage credits: $10.00 remaining",
	]);
});

test("ages its own timestamp as the entry scrolls back, rather than freezing at fetch time", () => {
	const lines = usageLines(screen(), plainStyle, AFTERNOON + 12 * 60_000);
	assert.equal(lines[0], "Usage · updated 12m ago");
	assert.match(lines[3]!, /resets in 44m \(3:56 pm\)/);
});

test("keeps a provider you configured but could not reach, so the failure stays visible", () => {
	const snapshot: UsageSnapshot = {
		fetchedAt: AFTERNOON,
		results: [{ provider: "codex", name: "Codex", configured: true, unavailable: "request failed" }],
	};
	assert.deepEqual(usageLines(snapshot, plainStyle, AFTERNOON), [
		"Usage · updated just now",
		"",
		"● Codex",
		"unavailable (request failed)",
	]);
});

test("discovers any window that names its own span, so a renamed key cannot silently drop a bar", () => {
	const data = normalize("claude", {
		seven_day_opus: { utilization: 38 },
		five_hour: { utilization: 13 },
		seven_day: { utilization: 19 },
		thirty_day_experimental: { utilization: 5 },
		account_uuid: "not-a-window",
	});
	assert.deepEqual(data, {
		windows: [
			{ label: "session (5h)", remaining: 87, resetAt: undefined },
			{ label: "weekly (7d)", remaining: 81, resetAt: undefined },
			{ label: "weekly opus (7d)", remaining: 62, resetAt: undefined },
			{ label: "30d experimental", remaining: 95, resetAt: undefined },
		],
	});
});

test("ignores unnamed buckets and the extra-usage block, which only look like windows", () => {
	assert.deepEqual(
		normalize("claude", {
			five_hour: { utilization: 13 },
			nimbus_quill: { utilization: 0, limit_dollars: 20, remaining_dollars: 20, resets_at: 1 },
			extra_usage: { utilization: 0, is_enabled: true, used_credits: 0, monthly_limit: 50 },
			tangelo: { utilization: 0 },
		}),
		{ windows: [{ label: "session (5h)", remaining: 87, resetAt: undefined }] },
	);
});

test("scales Anthropic's minor units by their exponent and keeps the account's own currency", () => {
	assert.deepEqual(
		normalize("claude", { spend: { enabled: true, balance: { amount_minor: 14_000, currency: "CAD", exponent: 2 } } }),
		{ credits: { state: "balance", amount: 140, currency: "CAD", decimals: 2 } },
	);
	assert.deepEqual(
		normalize("claude", { spend: { enabled: true, balance: { amount_minor: 9_500, currency: "JPY", exponent: 0 } } }),
		{ credits: { state: "balance", amount: 9_500, currency: "JPY", decimals: 0 } },
	);
});

test("says why usage credits are off, rather than leaving a bare switch", () => {
	assert.deepEqual(
		normalize("claude", { spend: { enabled: false, balance: null, disabled_reason: "out_of_credits" } }),
		{ credits: { state: "off", reason: "out of credits" } },
	);
	assert.deepEqual(normalize("claude", { spend: { enabled: false, balance: null } }), { credits: { state: "off" } });
	assert.deepEqual(normalize("codex", { credits: { has_credits: false, balance: "0" } }), { credits: { state: "off" } });
	assert.deepEqual(normalize("codex", { credits: { unlimited: true } }), { credits: { state: "unlimited" } });
	assert.deepEqual(
		normalize("codex", { credits: { has_credits: true, balance: "7.25" } }),
		{ credits: { state: "balance", amount: 7.25, currency: "USD", decimals: 2 } },
	);
});

test("labels Codex windows by their declared duration, since the keys carry none", () => {
	const now = Date.UTC(2026, 0, 2, 1, 34, 5);
	const data = normalize("codex", {
		rate_limit: {
			secondary_window: { used_percent: 23, limit_window_seconds: 7 * 86_400, reset_at: now + (6 * 24 + 7) * 3_600_000 },
			primary_window: { used_percent: 49, limit_window_seconds: 18_000, reset_at: now + 90 * 60_000 },
		},
	});
	assert.deepEqual(data, {
		windows: [
			{ label: "session (5h)", remaining: 51, resetAt: now + 90 * 60_000 },
			{ label: "weekly (7d)", remaining: 77, resetAt: now + (6 * 24 + 7) * 3_600_000 },
		],
	});
	assert.equal(
		formatStatus("codex", { provider: "codex", name: "Codex", configured: true, ...data! }, now),
		"● codex 51% ↻ 1h30m 77% ↻ 6d7h",
	);
});

test("shows OpenRouter account credits remaining without inventing quota semantics", () => {
	const balance = (amount: number) => ({ state: "balance", amount, currency: "USD", decimals: 2 });
	assert.deepEqual(normalize("openrouter", { data: { total_credits: 14.6, total_usage: 1.2 } }), { credits: balance(13.4) });
	assert.deepEqual(normalize("openrouter", { data: { total_credits: 1, total_usage: 2 } }), { credits: balance(0) });
	assert.equal(normalize("openrouter", { data: { total_credits: 4.6 } }), undefined);
	assert.equal(
		formatStatus("openrouter", { provider: "openrouter", name: "OpenRouter", configured: true, credits: balance(13.4) }),
		"◇ openrouter $13.40 left",
	);
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
	const snapshot = await collectUsage(
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
		AFTERNOON,
	);

	assert.equal(maximumActive, 3);
	assert.deepEqual(snapshot.results, [
		{ provider: "claude", name: "Claude Code", configured: true, windows: [{ label: "session (5h)", remaining: 60, resetAt: undefined }] },
		{ provider: "codex", name: "Codex", configured: true, unavailable: "request failed" },
		{ provider: "openrouter", name: "OpenRouter", configured: true, credits: { state: "balance", amount: 0, currency: "USD", decimals: 2 } },
	]);
	assert.equal(snapshot.fetchedAt, AFTERNOON);
});

test("reports each missing credential without making a request, and shows an empty screen", async () => {
	let requests = 0;
	const snapshot = await collectUsage({}, async () => {
		requests++;
		return response({});
	}, AFTERNOON);

	assert.equal(requests, 0);
	assert.deepEqual(
		snapshot.results.map((result) => [result.provider, result.configured, result.unavailable]),
		[
			["claude", false, "no credential"],
			["codex", false, "no credential"],
			["openrouter", false, "no credential"],
		],
	);
	assert.deepEqual(usageLines(snapshot, plainStyle, AFTERNOON), ["Usage · updated just now"]);
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
