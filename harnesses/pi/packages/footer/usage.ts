import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export function sessionUsage(entries: readonly SessionEntry[]) {
	const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	for (const entry of entries) {
		const usage = entry.type === "message"
			? (entry.message.role === "assistant" || entry.message.role === "toolResult" ? entry.message.usage : undefined)
			: (entry.type === "usage" || entry.type === "compaction" || entry.type === "branch_summary" ? entry.usage : undefined);
		if (!usage) continue;
		totals.input += usage.input;
		totals.output += usage.output;
		totals.cacheRead += usage.cacheRead;
		totals.cacheWrite += usage.cacheWrite;
		totals.cost += usage.cost.total;
	}
	return totals;
}
