const MIN_GAP_MS = 15_000;
const INTERVAL_MS = 60_000;
const RETRY_LADDER_MS = [120_000, 300_000];

export type FetchUsage = () => Promise<boolean>;

export interface Poller {
	start(): void;
	refresh(): void;
	request(): void;
	note(reachable: boolean): void;
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
		if (!running || exhausted()) return;
		timer = setTimeout(() => void fetchNow(), nextDelay());
		timer.unref?.();
	};

	const note = (reachable: boolean) => {
		lastAttempt = now();
		failures = reachable ? 0 : failures + 1;
		arm();
	};

	const fetchNow = async () => {
		if (!running || inFlight) return;
		inFlight = true;
		let reachable = false;
		try {
			reachable = await fetchUsage();
		} catch {
			reachable = false;
		} finally {
			inFlight = false;
		}
		note(reachable);
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
		note,
		stop() {
			running = false;
			clearTimeout(timer);
			timer = undefined;
		},
	};
}
