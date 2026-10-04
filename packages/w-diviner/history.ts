import type { Usage } from "@earendil-works/pi-ai";

/** One thing the diviner did or declined to do, kept so "is it working?" has an answer. */
export interface Entry {
	at: number;
	/** What prompted it: "turn 7" or "end of run". */
	trigger: string;
	outcome: string;
	ms?: number;
	usage?: Usage;
}

export const KEPT_ENTRIES = 20;
const SHOWN_ENTRIES = 8;

export const withEntry = (entries: Entry[], entry: Entry): Entry[] => [...entries, entry].slice(-KEPT_ENTRIES);

export function describeHistory(entries: Entry[]): string {
	if (entries.length === 0) return "No readings yet this session.";
	return ["Recent readings:", ...entries.slice(-SHOWN_ENTRIES).map(describeEntry)].join("\n");
}

function describeEntry({ at, trigger, outcome, ms, usage }: Entry): string {
	const cost = [ms === undefined ? "" : `${(ms / 1000).toFixed(1)}s`, usage ? tokens(usage) : ""].filter(Boolean).join(", ");
	return `  ${clock(at)}  ${trigger.padEnd(11)} ${outcome}${cost ? `  (${cost})` : ""}`;
}

const clock = (at: number) => new Date(at).toTimeString().slice(0, 5);

const tokens = ({ cacheRead, input, output }: Usage) => `${count(cacheRead)} cached, ${count(input)} new, ${count(output)} out`;

const count = (tokens: number) => tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;
