import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export type EffortRequest =
	| { kind: "unspecified" }
	| { kind: "level"; level: ThinkingLevel }
	| { kind: "unsupported"; requested: string };

export function readEffortRequest(args: string, accepted: readonly ThinkingLevel[]): EffortRequest {
	const requested = args.trim().toLowerCase();
	if (!requested) return { kind: "unspecified" };

	const level = accepted.find((candidate) => candidate === requested);
	return level ? { kind: "level", level } : { kind: "unsupported", requested };
}

export function completeEffortLevel(prefix: string, accepted: readonly ThinkingLevel[]) {
	const typed = prefix.trim().toLowerCase();
	const matches = accepted.filter((level) => level.startsWith(typed));
	return matches.length > 0 ? matches.map((level) => ({ value: level, label: level })) : null;
}
