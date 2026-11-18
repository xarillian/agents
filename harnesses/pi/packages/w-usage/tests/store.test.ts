import assert from "node:assert/strict";
import test from "node:test";
import { createUsageStore } from "../store.ts";
import { type Provider, endpoints } from "../usage.ts";

const AFTERNOON = new Date(2026, 8, 5, 15, 0, 0).getTime();

const ALL_CREDENTIALS = {
	claude: { token: "claude" },
	codex: { token: "codex", accountId: "account" },
	openrouter: { token: "openrouter" },
};

function providers() {
	const requested: string[] = [];
	const remaining = { claude: 40, codex: 10 };
	return {
		requested,
		remaining,
		fetcher: async (url: string) => {
			requested.push(url);
			if (url === endpoints.claude) return body({ five_hour: { utilization: remaining.claude } });
			if (url === endpoints.codex) return body({ rate_limit: { primary: { used_percent: remaining.codex, limit_window_seconds: 18_000 } } });
			return body({ data: { total_credits: 5, total_usage: 1 } });
		},
	};
}

function body(value: unknown) {
	return { ok: true, status: 200, json: async () => value };
}

function storeFor(active: Provider | undefined, clock: { value: number }, fetcher: ReturnType<typeof providers>["fetcher"]) {
	return createUsageStore(() => active, {
		fetcher,
		discover: async () => ALL_CREDENTIALS,
		now: () => clock.value,
	});
}

test("one sweep feeds every reader, so the screen and the bar cannot disagree", async () => {
	const clock = { value: AFTERNOON };
	const upstream = providers();
	const store = storeFor("claude", clock, upstream.fetcher);

	const snapshot = await store.refreshAll();

	assert.deepEqual(
		snapshot.results.map((result) => result.provider),
		["claude", "codex", "openrouter"],
		"the screen reads every provider in a settled order",
	);
	assert.equal(store.result("claude")?.windows?.[0]?.remaining, 60, "the bar reads the very same result");
	assert.deepEqual(store.snapshot(), snapshot);
});

test("a poll refreshes only the provider you are talking to, leaving the rest as the sweep left them", async () => {
	const clock = { value: AFTERNOON };
	const upstream = providers();
	const store = storeFor("claude", clock, upstream.fetcher);

	await store.refreshAll();
	upstream.requested.length = 0;

	clock.value = AFTERNOON + 60_000;
	upstream.remaining.claude = 55;
	store.start();
	await new Promise((resolve) => setImmediate(resolve));

	assert.deepEqual(upstream.requested, [endpoints.claude], "only the active provider costs a request");
	assert.equal(store.result("claude")?.fetchedAt, AFTERNOON + 60_000, "the active provider moves on");
	assert.equal(store.result("openrouter")?.fetchedAt, AFTERNOON, "the others keep the age they were fetched at");
	store.stop();
});

test("keeps the newer result when a sweep and a poll land out of order", async () => {
	const clock = { value: AFTERNOON };
	const upstream = providers();
	const store = storeFor("claude", clock, upstream.fetcher);

	clock.value = AFTERNOON + 60_000;
	upstream.remaining.claude = 55;
	await store.refreshAll();

	clock.value = AFTERNOON;
	upstream.remaining.claude = 40;
	await store.refreshAll();

	assert.equal(store.result("claude")?.windows?.[0]?.remaining, 45, "the late arrival does not overwrite fresher numbers");
	assert.equal(store.result("claude")?.fetchedAt, AFTERNOON + 60_000);
});

test("tells subscribers when a result changes, and stops once they let go", async () => {
	const clock = { value: AFTERNOON };
	const upstream = providers();
	const store = storeFor("claude", clock, upstream.fetcher);

	let announcements = 0;
	const unsubscribe = store.subscribe(() => announcements++);

	await store.refreshAll();
	assert.equal(announcements, 1, "a sweep announces once, not once per provider");

	unsubscribe();
	clock.value = AFTERNOON + 60_000;
	await store.refreshAll();
	assert.equal(announcements, 1, "an unsubscribed reader hears nothing further");
});

test("says nothing about a provider it has never reached", async () => {
	const clock = { value: AFTERNOON };
	const upstream = providers();
	const store = storeFor(undefined, clock, upstream.fetcher);

	assert.deepEqual(store.snapshot().results, []);
	assert.equal(store.result("claude"), undefined);
	assert.deepEqual(upstream.requested, [], "an idle store asks nobody anything");
});
