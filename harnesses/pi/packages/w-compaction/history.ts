import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { CompactionEntry, CompactionPreparation, ReadonlySessionManager } from "@earendil-works/pi-coding-agent";
import { buildSessionProjection, convertToLlm } from "@earendil-works/pi-coding-agent";
import type { InputItem } from "./openai.ts";

export type NativeDetails = {
	kind: "w-compaction/v1";
	provider: string;
	model: string;
	api: string;
	baseUrl: string;
	sourceLeafId: string;
	output: InputItem[];
	readFiles: string[];
	modifiedFiles: string[];
};
export type NativeEntry = CompactionEntry<NativeDetails>;

export function nativeEntries(session: ReadonlySessionManager): NativeEntry[] {
	return session.getBranch().filter((entry): entry is NativeEntry => entry.type === "compaction"
		&& (entry.details as NativeDetails | undefined)?.kind === "w-compaction/v1");
}

export function sourcePrefix(session: ReadonlySessionManager, sourceLeafId: string, firstKeptEntryId: string): AgentMessage[] {
	const projection = buildSessionProjection(session.getBranch(sourceLeafId));
	const cut = projection.entries.findIndex(entry => entry.sourceEntry.id === firstKeptEntryId);
	if (cut < 0) throw new Error("Cannot locate the native compaction's retained boundary");
	return projection.entries.slice(0, cut).flatMap(entry => entry.messages);
}

export function restoreHistory(messages: AgentMessage[], session: ReadonlySessionManager, seen = new Set<string>()): AgentMessage[] {
	const entries = nativeEntries(session);
	return messages.flatMap(message => {
		if (message.role !== "compactionSummary") return [message];
		const entry = entries.find(entry => entry.summary === message.summary);
		if (!entry) return [message];
		if (seen.has(entry.id)) throw new Error("Native compaction history contains a cycle");
		return restoreHistory(sourcePrefix(session, entry.details.sourceLeafId, entry.firstKeptEntryId), session, new Set([...seen, entry.id]));
	});
}

export function portablePreparation(preparation: CompactionPreparation, session: ReadonlySessionManager): CompactionPreparation {
	const previous = nativeEntries(session).find(entry => entry.summary === preparation.previousSummary);
	if (!previous) return preparation;
	const messages = restoreHistory(sourcePrefix(session, previous.details.sourceLeafId, previous.firstKeptEntryId), session);
	return {
		...preparation,
		previousSummary: undefined,
		messagesToSummarize: [...messages.filter(message => message.role !== "system"), ...preparation.messagesToSummarize],
		fileOps: {
			read: new Set([...previous.details.readFiles, ...preparation.fileOps.read]),
			written: new Set([...previous.details.modifiedFiles, ...preparation.fileOps.written]),
			edited: new Set(preparation.fileOps.edited),
		},
	};
}

export function replaceNativeMarkers(input: InputItem[], entries: NativeEntry[]): InputItem[] {
	const replacements = new Map(entries.map(entry => {
		const [message] = convertToLlm([{ role: "compactionSummary", summary: entry.summary, tokensBefore: entry.tokensBefore, timestamp: 0 }]);
		const content = (message as { content: { text: string }[] }).content[0].text;
		return [content, entry.details.output];
	}));
	return input.flatMap(item => {
		if (item.role !== "user") return [item];
		const content = item.content;
		const text = typeof content === "string" ? content
			: Array.isArray(content) && content.length === 1 && content[0]?.type === "input_text" ? content[0].text : undefined;
		return replacements.get(text) ?? [item];
	});
}
