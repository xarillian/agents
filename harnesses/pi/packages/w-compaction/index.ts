import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext, SessionBeforeCompactEvent } from "@earendil-works/pi-coding-agent";
import { compact, convertToLlm } from "@earendil-works/pi-coding-agent";
import { loadConverters } from "./pi.ts";
import { nativeEntries, portablePreparation, replaceNativeMarkers, restoreHistory, sourcePrefix, type NativeDetails, type NativeEntry } from "./history.ts";
import { endpoint, requestCompaction, supportsNative, type InputItem } from "./openai.ts";

function notify(ctx: ExtensionContext, message: string): void {
	if (ctx.hasUI) ctx.ui.notify(`w-compaction: ${message}`, "warning");
	else process.stderr.write(`w-compaction: ${message}\n`);
}

function compatible(entry: NativeEntry, ctx: ExtensionContext): boolean {
	const model = ctx.model;
	return supportsNative(model) && entry.details.provider === model!.provider && entry.details.api === model!.api
		&& entry.details.model === model!.id && entry.details.baseUrl === model!.baseUrl;
}

export default function (pi: ExtensionAPI) {
	let restoredFor: string | undefined;
	pi.on("session_start", () => { restoredFor = undefined; });

	pi.on("session_before_tree", (event, ctx) => {
		const ids = new Set(nativeEntries(ctx.sessionManager).map(entry => entry.id));
		const entries = event.preparation.entriesToSummarize;
		// Branch summaries already include the source entries; opaque markers add no information.
		for (let i = entries.length - 1; i >= 0; i--) if (ids.has(entries[i].id)) entries.splice(i, 1);
	});

	pi.on("session_before_compact", async (event, ctx) => {
		if (event.signal.aborted) return { cancel: true };
		const previous = nativeEntries(ctx.sessionManager).find(entry => entry.summary === event.preparation.previousSummary);
		if (!supportsNative(ctx.model)) {
			if (previous || ctx.model?.provider === "openai" || ctx.model?.provider === "openai-codex") {
				notify(ctx, "native compaction is unavailable for this model/API; using fallback compaction (Pi).");
				return fallback(event, ctx, Boolean(previous));
			}
			return;
		}
		try {
			const model = ctx.model!;
			endpoint(model);
			const sourceLeafId = ctx.sessionManager.getLeafId();
			if (!sourceLeafId) throw new Error("the session has no source history");
			let messages = sourcePrefix(ctx.sessionManager, sourceLeafId, event.preparation.firstKeptEntryId);
			const entries = nativeEntries(ctx.sessionManager);
			if (entries.some(entry => !compatible(entry, ctx))) messages = restoreHistory(messages, ctx.sessionManager);
			const { convertResponsesMessages, createGrammarToolInputProperties, getDeclaredTools } = await loadConverters();
			event.signal.throwIfAborted();
			const transcript = { messages: convertToLlm(messages) };
			const compat = model.compat ?? {};
			const input = convertResponsesMessages(model, transcript, new Set(["openai", "openai-codex"]), {
				includeSystemPrompt: false,
				grammarToolInputProperties: createGrammarToolInputProperties(getDeclaredTools(transcript.messages), compat.supportsOpenAIGrammarTools ?? false),
				supportsMidConvoSystemMessages: compat.supportsMidConvoSystemMessages ?? false,
				supportsAdditionalTools: compat.supportsAdditionalTools ?? false,
				supportsToolSearch: compat.supportsToolSearch ?? false,
				toolOptions: { strict: null, supportsStrictMode: compat.supportsStrictMode ?? true, supportsOpenAIGrammarTools: compat.supportsOpenAIGrammarTools ?? false },
			}) as InputItem[];
			const instructions = [ctx.getSystemPrompt(), event.customInstructions].filter(Boolean).join("\n\n");
			const result = await requestCompaction(ctx, replaceNativeMarkers(input, entries.filter(entry => compatible(entry, ctx))), instructions, event.signal);
			event.signal.throwIfAborted();
			const fileOps = portablePreparation(event.preparation, ctx.sessionManager).fileOps;
			const details: NativeDetails = {
				kind: "w-compaction/v1", provider: model.provider, api: model.api, model: model.id, baseUrl: model.baseUrl,
				sourceLeafId, output: result.output,
				readFiles: [...fileOps.read], modifiedFiles: [...new Set([...fileOps.written, ...fileOps.edited])],
			};
			return { compaction: {
				summary: `OpenAI native compaction [w-compaction:${randomUUID()}]. Load w-compaction to replay this history.`,
				firstKeptEntryId: event.preparation.firstKeptEntryId,
				tokensBefore: event.preparation.tokensBefore,
				usage: result.usage, details,
			} };
		} catch (error) {
			if (event.signal.aborted) return { cancel: true };
			const reason = error instanceof Error ? error.message : "native compaction failed";
			notify(ctx, `${reason}; using fallback compaction (Pi).`);
			return fallback(event, ctx, Boolean(previous));
		}
	});

	pi.on("context", (event, ctx) => {
		const entries = nativeEntries(ctx.sessionManager);
		const incompatible = entries.filter(entry => !compatible(entry, ctx));
		if (!event.messages.some(message => message.role === "compactionSummary" && incompatible.some(entry => entry.summary === message.summary))) return;
		const key = `${ctx.sessionManager.getSessionId()}:${ctx.model?.provider}:${ctx.model?.id}`;
		if (restoredFor !== key) {
			notify(ctx, "native state cannot be replayed on this model; restoring source history. Further compaction uses this model's supported strategy.");
			restoredFor = key;
		}
		try { return { messages: restoreHistory(event.messages, ctx.sessionManager) }; }
		catch (error) {
			ctx.abort();
			throw error;
		}
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!supportsNative(ctx.model)) return;
		const payload = event.payload as { input?: InputItem[] };
		if (!Array.isArray(payload?.input)) return;
		return { ...payload, input: replaceNativeMarkers(payload.input, nativeEntries(ctx.sessionManager).filter(entry => compatible(entry, ctx))) };
	});
}

async function fallback(event: SessionBeforeCompactEvent, ctx: ExtensionContext, hasNativeHistory: boolean) {
	if (!hasNativeHistory) return;
	if (!ctx.model) return { cancel: true };
	try {
		return { compaction: await compact(
			portablePreparation(event.preparation, ctx.sessionManager), ctx.model, undefined, undefined,
			event.customInstructions, event.signal, ctx.thinkingLevel,
			(model, context, options) => ctx.modelRegistry.streamSimple(model, context, options),
		) };
	} catch {
		// A failed handler falls through to Pi; it must never summarize an opaque-state marker.
		if (!event.signal.aborted) notify(ctx, "fallback compaction failed; leaving the existing history intact. Try /compact again.");
		return { cancel: true };
	}
}
