import { estimateTokens, formatSize, keyHint, type Theme, type ToolRenderers } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { cleanText, type SourceCard, type WebDetails } from "./contracts.ts";
import type { ModelReference } from "./model.ts";

type Action = "Search" | "Fetch" | "Find";
interface RenderState { model?: ModelReference; source?: string; resultSeen?: boolean }

export function webRenderers(action: Action, currentModel: () => ModelReference | undefined): ToolRenderers {
	return {
		renderShell: "self",
		renderCall(input, theme, context) {
			const args = input as { query?: string; source?: string; pattern?: string };
			const state = context.state as RenderState;
			return {
				render(width) {
					if (width < 1) return [];
					const value = action === "Search" ? JSON.stringify(args.query ?? "") : state.source ?? args.source ?? "";
					const pattern = action === "Find" ? `, ${JSON.stringify(args.pattern ?? "")}` : "";
					const title = theme.fg("toolTitle", theme.bold(`${action}(${singleLine(value)}${singleLine(pattern)})`));
					const model = state.resultSeen ? state.model : currentModel();
					const identity = theme.fg("muted", model ? `${model.provider}/${model.id}` : "web model not recorded");
					const joined = `${title} · ${identity}`;
					return visibleWidth(joined) <= width ? [joined] : [truncateToWidth(title, width), ...wrapTextWithAnsi(identity, width)];
				},
				invalidate() {},
			};
		},
		renderResult(result, { expanded, isPartial }, theme, context) {
			const details = result.details as WebDetails | undefined;
			const state = context.state as RenderState;
			state.resultSeen = true;
			state.model = details?.model;
			state.source = details?.sources?.[0]?.url;
			return {
				render(width) {
					if (width < 1) return [];
					if (isPartial && !details?.cards?.length) return [truncateToWidth(theme.fg("muted", "Retrieving…"), width)];
					const cards = details?.cards ?? [];
					if (context.isError || cards.length === 0) {
						const text = result.content.filter(block => block.type === "text").map(block => cleanText(block.text)).join("\n");
						const lines = wrapTextWithAnsi(theme.fg(context.isError ? "error" : "toolOutput", text), width);
						const shown = expanded ? lines : [...lines.slice(0, 6), ...(lines.length > 6 ? [keyHint("app.tools.expand", "to expand")] : [])];
						if (details?.usage) shown.push(inferenceUsage(details, theme));
						return shown.map(line => truncateToWidth(line, width));
					}
					const visible = expanded ? cards : cards.slice(0, 3);
					const lines = visible.flatMap((card, index) => [...(index ? [""] : []), ...renderCard(card, width, expanded, theme)]);
					if (cards.length > visible.length) lines.push(theme.fg("muted", `+${cards.length - visible.length} sources`));
					if (details?.usage) lines.push(inferenceUsage(details, theme));
					lines.push(keyHint("app.tools.expand", expanded ? "to collapse" : "to expand") + theme.fg("muted", " · click in fullscreen"));
					return lines.map(line => truncateToWidth(line, width));
				},
				invalidate() {},
			};
		},
	};
}

export function sourceTextMetrics(card: SourceCard) {
	const text = card.lines.map(line => line.text).join("\n");
	return {
		bytes: Buffer.byteLength(text, "utf8"),
		tokens: estimateTokens({ role: "user", content: text, timestamp: 0 }),
	};
}

function renderCard(card: SourceCard, width: number, expanded: boolean, theme: Theme): string[] {
	const { bytes, tokens } = sourceTextMetrics(card);
	const title = card.source.title === card.source.url ? new URL(card.source.url).hostname : singleLine(card.source.title);
	const status = card.kind === "snippet" ? " · snippet" : card.cached ? " · cached" : "";
	const metrics = `${formatSize(bytes)} returned text · ~${tokens} tokens${status}`;
	const indent = width > 4 ? "│ " : "";
	const bodyWidth = Math.max(1, width - visibleWidth(indent));
	const body = card.lines.flatMap(line => {
		const number = expanded && line.line !== undefined ? `${line.line}${line.column ? `:${line.column}` : ""} │ ` : "";
		return wrapTextWithAnsi(`${number}${cleanText(line.text).replace(/\t/g, "    ").replace(/\r/g, "")}`, bodyWidth);
	});
	const shown = expanded ? body : body.slice(0, 3);
	const url = theme.fg("accent", card.source.url);
	const lines = [
		theme.fg("muted", `┌ ${title}`),
		...(expanded ? wrapTextWithAnsi(url, bodyWidth) : [truncateToWidth(url, bodyWidth)]).map(line => theme.fg("borderMuted", indent) + line),
		...wrapTextWithAnsi(theme.fg("muted", metrics), bodyWidth).map(line => theme.fg("borderMuted", indent) + line),
		...shown.map(line => theme.fg("borderMuted", indent) + theme.fg("toolOutput", line)),
	];
	if (!body.length) lines.push(theme.fg("muted", `${indent}No source text in this result.`));
	if (shown.length < body.length) lines.push(theme.fg("muted", `${indent}+${body.length - shown.length} lines`));
	if (expanded) {
		for (const note of [card.notice, card.continuation]) {
			if (note) lines.push(...wrapTextWithAnsi(cleanText(note), bodyWidth).map(line => theme.fg("muted", `${indent}${line}`)));
		}
	}
	lines.push(theme.fg("borderMuted", "└"));
	return lines.map(line => truncateToWidth(line, width));
}

function inferenceUsage(details: WebDetails, theme: Theme) {
	const usage = details.usage!;
	return theme.fg("muted", `Inference: ${usage.input} in · ${usage.output} out · ${usage.cacheRead} cache read · ${usage.cacheWrite} cache write`);
}

function singleLine(text: string) { return cleanText(text).replace(/\s+/g, " "); }
