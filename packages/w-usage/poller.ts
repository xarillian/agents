/**
 * Usage only moves when the model answers, so turn ends drive the refreshes. The clock covers
 * what a turn cannot see: subagents run in their own processes and spend the same quota.
 */

/** Turn ends arrive in bursts during a tool loop. The closest two fetches may ever sit. */
const MIN_GAP_MS = 15_000;

/** Steady cadence for as long as a session is alive. */
const INTERVAL_MS = 60_000;

/** Consecutive failures walk this ladder, and walking off its end stops the clock entirely. */
const RETRY_LADDER_MS = [120_000, 300_000];

/** Answers whether the fetch produced usable numbers; a false answer walks the retry ladder. */
export type FetchUsage = () => Promise<boolean>;

export interface Poller {
	/** Begin the cadence, opening with an immediate fetch. */
	start(): void;
	/** Fetch now whatever the gap, for when the displayed provider itself has changed. */
	refresh(): void;
	/** Fetch only once the gap since the last attempt has elapsed. */
	request(): void;
	/** Idempotent, so a shutdown racing an in-flight fetch stays quiet. */
	stop(): void;
}

export function createPoller(fetchUsage: FetchUsage, now: () => number = Date.now): Poller {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running = false;
	let inFlight = false;
	let failures = 0;
	let lastAttempt = Number.NEGATIVE_INFINITY;

	const retryDelay = () => RETRY_LADDER_MS[Math.min(failures, RETRY_LADDER_MS.length) - 1]!;
	const nextDelay = () => (failures ? retryDelay() : INTERVAL_MS);
	const gap = () => (failures ? retryDelay() : MIN_GAP_MS);
	const exhausted = () => failures > RETRY_LADDER_MS.length;

	const arm = () => {
		clearTimeout(timer);
		timer = undefined;
		// Once the ladder runs out the clock gives up: an idle session learns nothing by poking a
		// dead endpoint. A turn or a model change revives us, which is how an expired token heals.
		if (!running || exhausted()) return;
		timer = setTimeout(() => void fetchNow(), nextDelay());
		// A pending poll must never be the reason pi refuses to exit.
		timer.unref?.();
	};

	const fetchNow = async () => {
		if (!running || inFlight) return;
		inFlight = true;
		lastAttempt = now();
		try {
			failures = (await fetchUsage()) ? 0 : failures + 1;
		} catch {
			failures++;
		} finally {
			inFlight = false;
			arm();
		}
	};

	return {
		start() {
			if (running) return;
			running = true;
			void fetchNow();
		},
		refresh() {
			void fetchNow();
		},
		request() {
			if (now() - lastAttempt < gap()) return;
			void fetchNow();
		},
		stop() {
			running = false;
			clearTimeout(timer);
			timer = undefined;
		},
	};
}
