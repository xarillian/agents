import { createPoller } from "./poller.ts";
import {
	type Credential,
	type Fetch,
	type Provider,
	type UsageResult,
	type UsageSnapshot,
	collectProviderUsage,
	collectUsage,
	discoverCredentials,
} from "./usage.ts";

const ORDER: Provider[] = ["claude", "codex", "openrouter"];

type Credentials = Partial<Record<Provider, Credential | undefined>>;

export interface UsageStore {
	snapshot(): UsageSnapshot;
	result(provider: Provider): UsageResult | undefined;
	subscribe(listener: () => void): () => void;
	refreshAll(): Promise<UsageSnapshot>;
	start(): void;
	refresh(): void;
	request(): void;
	stop(): void;
}

export interface UsageSources {
	fetcher?: Fetch;
	discover?: () => Promise<Credentials>;
	now?: () => number;
}

export function createUsageStore(activeProvider: () => Provider | undefined, sources: UsageSources = {}): UsageStore {
	const fetcher = sources.fetcher ?? fetch;
	const discover = sources.discover ?? discoverCredentials;
	const now = sources.now ?? Date.now;
	const results = new Map<Provider, UsageResult>();
	const listeners = new Set<() => void>();
	const poller = createPoller(() => refreshActive(), now);

	const remember = (incoming: UsageResult[]) => {
		let changed = false;
		for (const result of incoming) {
			if ((results.get(result.provider)?.fetchedAt ?? Number.NEGATIVE_INFINITY) > result.fetchedAt) continue;
			results.set(result.provider, result);
			changed = true;
		}
		if (changed) for (const listener of listeners) listener();
	};

	const credentials = async (): Promise<Credentials> => {
		try {
			return await discover();
		} catch {
			return {};
		}
	};

	const refreshActive = async (): Promise<boolean> => {
		const provider = activeProvider();
		if (!provider) return true;
		const result = await collectProviderUsage(provider, (await credentials())[provider], fetcher, now());
		remember([result]);
		return !result.unavailable;
	};

	const snapshot = (): UsageSnapshot => ({
		results: ORDER.map((provider) => results.get(provider)).filter((result) => result !== undefined),
	});

	return {
		snapshot,
		result: (provider) => results.get(provider),
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async refreshAll() {
			const swept = await collectUsage(await credentials(), fetcher, now());
			remember(swept.results);
			const provider = activeProvider();
			poller.note(provider ? !results.get(provider)?.unavailable : true);
			return snapshot();
		},
		start: poller.start,
		refresh: poller.refresh,
		request: poller.request,
		stop: poller.stop,
	};
}
