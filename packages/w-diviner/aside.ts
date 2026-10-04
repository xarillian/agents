import type { Api, Model, Usage } from "@earendil-works/pi-ai";
import { convertToLlm, type ExtensionContext } from "@earendil-works/pi-coding-agent";

/** No text when the model stopped early or was cancelled. */
export interface AsideReply { text?: string; usage: Usage }

/**
 * Replays the session exactly as the main agent sees it, then asks one more
 * question with tools switched off. When the main model answers, it shares the
 * session id so the provider can serve the replayed transcript from its cache.
 */
export async function askAside(ctx: ExtensionContext, model: Model<Api>, question: string, signal: AbortSignal): Promise<AsideReply> {
	const transcript = convertToLlm(ctx.sessionManager.buildSessionProjection().messages);
	const isMainModel = model.provider === ctx.model?.provider && model.id === ctx.model?.id;
	const reasoning = ctx.thinkingLevel === "off" ? undefined : ctx.thinkingLevel;

	const reply = await ctx.modelRegistry.streamSimple(model, {
		messages: [...transcript, { role: "user", content: [{ type: "text", text: question }], timestamp: Date.now() }],
	}, {
		signal,
		toolChoice: "none",
		...(reasoning && { reasoning }),
		...(isMainModel && { sessionId: ctx.sessionManager.getSessionId() }),
	}).result();

	if (reply.stopReason === "error") throw new Error(reply.errorMessage ?? `${model.provider}/${model.id} failed`);
	if (reply.stopReason !== "stop") return { usage: reply.usage };
	const text = reply.content.flatMap(part => part.type === "text" ? [part.text] : []).join("").trim();
	return { ...(text && { text }), usage: reply.usage };
}
