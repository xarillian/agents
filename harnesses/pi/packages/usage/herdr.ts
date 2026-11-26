import { execFile } from "node:child_process";
import type { Provider, UsageResult } from "./usage.ts";

const COOLDOWN_DRIFT_MS = 60_000;
const COOLDOWN_HEARTBEAT_MS = 300_000;

export interface CooldownLabelState {
	pool: string;
	checked: boolean;
	resetAt: number;
	clearCooldown: boolean;
}

export function cooldownState(
	provider: Provider | undefined,
	result: UsageResult | undefined,
	now = Date.now(),
): CooldownLabelState {
	if (provider !== "claude") {
		return { pool: provider ?? "", checked: false, resetAt: 0, clearCooldown: true };
	}
	if (!result || result.unavailable || !result.windows?.length) {
		return { pool: "claude", checked: false, resetAt: 0, clearCooldown: false };
	}
	const exhausted = result.windows
		.filter((window) => window.remaining <= 0 && window.resetAt !== undefined && window.resetAt > now)
		.map((window) => window.resetAt!);
	return {
		pool: "claude",
		checked: true,
		resetAt: exhausted.length > 0 ? Math.max(...exhausted) : 0,
		clearCooldown: false,
	};
}

export interface HerdrReporterOptions {
	terminalId?: string;
	runHc?: (args: string[]) => void;
	now?: () => number;
}

export function createHerdrCooldownReporter(options: HerdrReporterOptions = {}) {
	const terminalId = (options.terminalId ?? process.env.HC_TERMINAL_ID)?.trim();
	const runHc = options.runHc ?? defaultRunHc;
	const now = options.now ?? Date.now;
	let last: (CooldownLabelState & { at: number }) | undefined;

	return {
		report(provider: Provider | undefined, result: UsageResult | undefined) {
			if (!terminalId) return false;
			const stamp = now();
			const next = cooldownState(provider, result, stamp);
			if (!shouldPublish(last, next, stamp)) return false;
			const args = ["label", terminalId, `usage.pool=${next.pool}`];
			if (next.clearCooldown) {
				args.push("usage.cooldown=");
			} else if (next.checked) {
				args.push(`usage.cooldown=${next.resetAt > 0 ? String(next.resetAt) : ""}`);
				args.push(`usage.at=${String(result?.fetchedAt ?? stamp)}`);
			}
			last = { ...next, at: stamp };
			runHc(args);
			return true;
		},
	};
}

function shouldPublish(
	prev: (CooldownLabelState & { at: number }) | undefined,
	next: CooldownLabelState,
	now: number,
): boolean {
	if (!prev) return Boolean(next.pool || next.checked);
	if (prev.pool !== next.pool) return true;
	if (!next.checked) return false;
	if (!prev.checked) return true;
	if ((prev.resetAt > 0) !== (next.resetAt > 0)) return true;
	if (next.resetAt > 0 && Math.abs(next.resetAt - prev.resetAt) >= COOLDOWN_DRIFT_MS) return true;
	return now - prev.at >= COOLDOWN_HEARTBEAT_MS;
}

function defaultRunHc(args: string[]) {
	try {
		const child = execFile("hc", args, { timeout: 1_000 }, () => {});
		child.unref?.();
	} catch {
		// Ignore when hc is unavailable.
	}
}
