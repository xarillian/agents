import { homedir } from "node:os";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ContextUsage, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { renderFooter } from "./presentation.ts";
import { sessionUsage } from "./usage.ts";
import { cacheHistory, renderCacheHistory } from "./cache-history.ts";
import { FooterPopover, findBadge } from "./footer-popover.ts";
import { renderCard } from "./card.ts";
import { USAGE_REQUEST, USAGE_UPDATE, type UsageUpdate } from "../w-usage/footer.ts";
import { usageCardLines } from "../w-usage/presentation.ts";
import { providerForModel } from "../w-usage/usage.ts";

export default function (pi: ExtensionAPI) {
	let popover: FooterPopover | undefined;
	let usagePopover: FooterPopover | undefined;
	let accountUsage: UsageUpdate;
	pi.events.on(USAGE_UPDATE, (data) => { accountUsage = data as UsageUpdate; });
	pi.registerCommand("usage-popup", {
		description: "Toggle the active provider's usage card",
		handler: async (_args, ctx) => {
			if (ctx.mode === "tui") usagePopover?.toggle();
		},
	});
	pi.registerCommand("cache-history", {
		description: "Toggle the cache reuse graph for this conversation branch",
		handler: async (_args, ctx) => {
			if (ctx.mode === "tui") popover?.toggle();
		},
	});
	pi.on("session_shutdown", () => {
		popover?.dispose();
		popover = undefined;
		usagePopover?.dispose();
		usagePopover = undefined;
		accountUsage = undefined;
	});
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setFooter((tui, theme, footerData) => {
			let cachedKey = "";
			let cachedContextKey = "";
			let usage: ContextUsage | undefined;
			let totals = sessionUsage([]);
			let history: number[] = [];
			const graph = new FooterPopover(tui,
				(width, pinned) => renderCacheHistory({ history, totals }, width, pinned, theme),
				(lines) => findBadge(lines.slice(0, 1), /◈ \S+/));
			const limits = new FooterPopover(tui, (width, pinned) => {
				const result = accountUsage?.provider === providerForModel(ctx.model?.provider) ? accountUsage : undefined;
				const title = result ? `${result.name} usage` : "Usage";
				return renderCard([
					theme.fg("warning", title) + theme.fg("muted", pinned ? " · pinned" : ""),
					...(result ? usageCardLines(result) : ["Usage unavailable"]),
				], width, theme);
			}, (lines) => {
				const status = footerData.getExtensionStatuses().get("usage");
				if (!status) return undefined;
				const badge = findBadge(lines.slice(1), /[◆●◇] (?:claude|codex|openrouter)\b/);
				if (!badge) return undefined;
				const row = badge.row + 1;
				return { ...badge, row, end: Math.min(visibleWidth(lines[row]), badge.start + visibleWidth(stripTerminalSequences(status))) };
			});
			popover = graph;
			usagePopover = limits;
			pi.events.emit(USAGE_REQUEST, undefined);
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose() {
					unsubscribe();
					graph.dispose();
					limits.dispose();
					if (popover === graph) popover = undefined;
					if (usagePopover === limits) usagePopover = undefined;
				},
				invalidate() {},
				handleMouse: (event) => graph.handleMouse(event) ?? limits.handleMouse(event),
				render(width) {
					const session = ctx.sessionManager;
					const key = `${session.getSessionId()}:${session.getLeafId()}`;
					if (key !== cachedKey) {
						totals = sessionUsage(session.getEntries());
						history = cacheHistory(session.getBranch());
						cachedKey = key;
					}
					const model = ctx.model;
					const contextKey = `${key}:${model?.provider}/${model?.id}/${model?.contextWindow}`;
					if (contextKey !== cachedContextKey) {
						usage = ctx.getContextUsage();
						cachedContextKey = contextKey;
					}
					const lines = renderFooter({
						cost: totals.cost,
						cacheHit: history.at(-1),
						cwd: session.getCwd(),
						home: homedir(),
						branch: footerData.getGitBranch(),
						sessionName: session.getSessionName(),
						model: model?.id ?? "no-model",
						provider: footerData.getAvailableProviderCount() > 1 ? model?.provider : undefined,
						thinking: model?.reasoning ? pi.getThinkingLevel() : undefined,
						contextPercent: usage?.percent ?? null,
						subscription: !!model && (model.provider === "kimi-coding" || ctx.modelRegistry.isUsingOAuth(model)),
						statuses: footerData.getExtensionStatuses(),
					}, width, theme);
					graph.layout(lines, width);
					limits.layout(lines, width);
					return lines;
				},
			};
		});
	});
}
