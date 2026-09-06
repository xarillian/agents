import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Component, Text } from "@earendil-works/pi-tui";
import { createUsageStore } from "./store.ts";
import {
	type Provider,
	type UsageSnapshot,
	type UsageStyle,
	formatStatus,
	plainStyle,
	providerForModel,
	usageLines,
} from "./usage.ts";

type UsageEntry = { snapshot?: UsageSnapshot; message?: string };
type Theme = ExtensionContext["ui"]["theme"];

const providerColor = (provider: Provider) =>
	provider === "claude" ? "warning" : provider === "codex" ? "accent" : "success";

const USAGE_TITLE = [
	"██╗   ██╗███████╗ █████╗  ██████╗ ███████╗",
	"██║   ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝",
	"██║   ██║███████╗███████║██║  ███╗█████╗  ",
	"██║   ██║╚════██║██╔══██║██║   ██║██╔══╝  ",
	"╚██████╔╝███████║██║  ██║╚██████╔╝███████╗",
	" ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝",
];

const themeStyle = (theme: Theme): UsageStyle => ({
	heading: () => USAGE_TITLE.map((line) => theme.fg("accent", theme.bold(line))).join("\n"),
	provider: (provider, text) => theme.fg(providerColor(provider), theme.bold(text)),
	bar: (provider, filled, empty) =>
		theme.fg("muted", "[") + theme.fg(providerColor(provider), filled) + theme.fg("dim", empty) + theme.fg("muted", "]"),
	dim: (text) => theme.fg("dim", text),
	muted: (text) => theme.fg("muted", text),
});

const framed = (body: Component, theme: Theme): Component => ({
	render(width) {
		const rule = theme.fg("dim", "─".repeat(Math.max(0, width)));
		return [rule, ...body.render(width), rule];
	},
	invalidate() {
		body.invalidate();
	},
});

export default function (pi: ExtensionAPI) {
	let session: ExtensionContext | undefined;
	const store = createUsageStore(() => providerForModel(session?.model?.provider));

	pi.registerEntryRenderer<UsageEntry>("usage", (entry, _options, theme) => {
		const snapshot = entry.data?.snapshot;
		if (!snapshot) return new Text(entry.data?.message ?? "Usage unavailable", 1, 0);
		const body = new Text(usageLines(snapshot, themeStyle(theme)).join("\n"), 1, 0);
		return framed(body, theme);
	});

	const setStatus = (ctx: ExtensionContext, provider: Provider, text: string) => {
		ctx.ui.setStatus("usage", ctx.ui.theme.fg(providerColor(provider), text));
	};

	const paint = () => {
		const ctx = session;
		if (!ctx?.hasUI) return;
		const provider = providerForModel(ctx.model?.provider);
		const result = provider && store.result(provider);
		if (!provider || !result) {
			ctx.ui.setStatus("usage", undefined);
			return;
		}
		setStatus(ctx, provider, formatStatus(provider, result));
	};

	store.subscribe(paint);

	pi.on("session_start", (_event, ctx) => {
		session = ctx;
		paint();
		if (ctx.hasUI) store.start();
	});
	pi.on("model_select", () => {
		paint();
		store.refresh();
	});
	pi.on("turn_end", () => store.request());
	pi.on("session_shutdown", (_event, ctx) => {
		store.stop();
		session = undefined;
		ctx.ui.setStatus("usage", undefined);
	});

	pi.registerCommand("usage", {
		description: "Show Claude Code, Codex, and OpenRouter usage.",
		handler: async (args, ctx) => {
			if (args.trim()) {
				const message = "Usage: /usage takes no arguments";
				pi.appendEntry<UsageEntry>("usage", { message });
				if (ctx.mode === "print") process.stderr.write(`${message}\n`);
				return;
			}
			const snapshot = await store.refreshAll();
			pi.appendEntry<UsageEntry>("usage", { snapshot });
			if (ctx.mode === "print") process.stderr.write(`${usageLines(snapshot, plainStyle).join("\n")}\n`);
		},
	});
}
