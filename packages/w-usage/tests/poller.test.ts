import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createPoller } from "../poller.ts";

const MINUTE = 60_000;

/** Fake clock and fake timers together, so the gap and the cadence advance from one tick. */
function clock(t: TestContext) {
	t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
	return async (ms: number) => {
		t.mock.timers.tick(ms);
		// setImmediate stays real, so awaiting one lands after the fetch promises have settled.
		await new Promise((resolve) => setImmediate(resolve));
	};
}

function recorder() {
	const at: number[] = [];
	const state = { reachable: true };
	return {
		at,
		state,
		fetch: async () => {
			at.push(Date.now());
			return state.reachable;
		},
	};
}

test("polls once a minute for as long as the session lives", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);
	assert.deepEqual(usage.at, [0], "starting the session fetches immediately");

	await tick(MINUTE);
	await tick(MINUTE);
	assert.deepEqual(usage.at, [0, MINUTE, 2 * MINUTE]);
});

test("collapses a burst of turn ends into at most one fetch per gap", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);

	await tick(1_000);
	poller.request();
	await tick(13_000);
	poller.request();
	assert.deepEqual(usage.at, [0], "turn ends inside the gap are dropped");

	await tick(1_000);
	poller.request();
	await tick(0);
	assert.deepEqual(usage.at, [0, 15_000], "the first turn end past the gap fetches");
});

test("fetches immediately when the model changes, since a new provider makes the numbers wrong", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);

	await tick(1_000);
	poller.refresh();
	await tick(0);
	assert.deepEqual(usage.at, [0, 1_000], "a provider switch skips the gap");
});

test("walks the retry ladder while the provider stays unreachable", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	usage.state.reachable = false;
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);

	await tick(MINUTE);
	assert.deepEqual(usage.at, [0], "the first failure backs off past the steady minute");

	await tick(MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE], "the first retry waits two minutes");

	await tick(4 * MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE], "the second retry waits five");

	await tick(MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE, 7 * MINUTE]);
});

test("stops the clock once the ladder runs out, rather than poking a dead endpoint forever", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	usage.state.reachable = false;
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);
	await tick(2 * MINUTE);
	await tick(5 * MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE, 7 * MINUTE], "three attempts walk the whole ladder");

	await tick(60 * MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE, 7 * MINUTE], "an idle hour adds nothing");
});

test("a turn end revives a poller that gave up, which is how an expired token heals", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	usage.state.reachable = false;
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);
	await tick(2 * MINUTE);
	await tick(5 * MINUTE);
	await tick(60 * MINUTE);

	poller.request();
	await tick(0);
	assert.deepEqual(usage.at, [0, 2 * MINUTE, 7 * MINUTE, 67 * MINUTE], "working again retries");

	usage.state.reachable = true;
	await tick(5 * MINUTE);
	poller.request();
	await tick(0);
	assert.equal(usage.at.length, 5, "the next turn end past the gap lands, and this time it answers");

	await tick(MINUTE);
	assert.equal(usage.at.length, 6, "a success restarts the steady minute");
});

test("holds turn ends to the backoff too, so a tool loop cannot hammer a dead endpoint", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	usage.state.reachable = false;
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);

	await tick(30_000);
	poller.request();
	await tick(0);
	assert.deepEqual(usage.at, [0], "the gap widens to the backoff while failing");
});

test("returns to the steady cadence once the provider answers again", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	usage.state.reachable = false;
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);

	usage.state.reachable = true;
	await tick(2 * MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE], "the retry lands and succeeds");

	await tick(MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE, 3 * MINUTE], "success restores the minute");
});

test("never runs two fetches at once, so a slow request cannot stack", async (t) => {
	const tick = clock(t);
	const at: number[] = [];
	const poller = createPoller(() => {
		at.push(Date.now());
		return new Promise<boolean>(() => {});
	});

	poller.start();
	await tick(0);
	await tick(5 * MINUTE);
	poller.request();
	poller.refresh();
	await tick(0);

	assert.deepEqual(at, [0], "the in-flight request absorbs every later trigger");
});

test("stops fetching once the session shuts down", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);
	poller.stop();

	await tick(10 * MINUTE);
	poller.request();
	poller.refresh();
	await tick(0);

	assert.deepEqual(usage.at, [0], "shutdown ends the cadence and ignores stray events");
});

test("a fetch made elsewhere postpones the cadence, so a manual sweep is not doubled", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);
	await tick(30_000);

	poller.note(true);
	await tick(30_000);
	assert.deepEqual(usage.at, [0], "the minute now runs from the outside fetch, not the last poll");

	await tick(30_000);
	assert.deepEqual(usage.at, [0, 90_000]);
});

test("a successful sweep revives a poller that had given up", async (t) => {
	const tick = clock(t);
	const usage = recorder();
	usage.state.reachable = false;
	const poller = createPoller(usage.fetch);

	poller.start();
	await tick(0);
	await tick(2 * MINUTE);
	await tick(5 * MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE, 7 * MINUTE], "the ladder is spent");

	usage.state.reachable = true;
	poller.note(true);
	await tick(MINUTE);
	assert.deepEqual(usage.at, [0, 2 * MINUTE, 7 * MINUTE, 8 * MINUTE], "proof it works restarts the clock");
});
