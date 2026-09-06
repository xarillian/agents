import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	type Provider,
	type UsageSnapshot,
	type UsageStyle,
	collectProviderUsage,
	collectUsage,
	discoverCredentials,
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

export default function (pi: ExtensionAPI) {
	let refreshVersion = 0;

	// Rendered on every repaint so countdowns and freshness stay honest as the entry scrolls back.
	pi.registerEntryRenderer<UsageEntry>("usage", (entry, _options, theme) => {
		const snapshot = entry.data?.snapshot;
		const body = snapshot
			? usageLines(snapshot, themeStyle(theme)).join("\n")
			: (entry.data?.message ?? "Usage unavailable");
		return new Text(body, 1, 0);
	});

	const setStatus = (ctx: ExtensionContext, provider: Provider, text: string) => {
		ctx.ui.setStatus("usage", ctx.ui.theme.fg(providerColor(provider), text));
	};

	const clearStatus = (ctx: ExtensionContext) => {
		refreshVersion++;
		ctx.ui.setStatus("usage", undefined);
	};

	const refreshStatus = async (ctx: ExtensionContext) => {
		const version = ++refreshVersion;
		const provider = providerForModel(ctx.model?.provider);
		if (!provider) {
			ctx.ui.setStatus("usage", undefined);
			return;
		}
		try {
			const credentials = await discoverCredentials();
			const result = await collectProviderUsage(provider, credentials[provider]);
			if (version === refreshVersion && provider === providerForModel(ctx.model?.provider)) {
				setStatus(ctx, provider, formatStatus(provider, result));
			}
		} catch {
			if (version === refreshVersion && provider === providerForModel(ctx.model?.provider)) {
				setStatus(ctx, provider, `${provider} unavailable`);
			}
		}
	};

	pi.on("session_start", (_event, ctx) => void refreshStatus(ctx));
	pi.on("model_select", (_event, ctx) => void refreshStatus(ctx));
	pi.on("agent_settled", (_event, ctx) => void refreshStatus(ctx));
	pi.on("session_shutdown", (_event, ctx) => clearStatus(ctx));

	pi.registerCommand("usage", {
		description: "Show Claude Code, Codex, and OpenRouter usage.",
		handler: async (args, ctx) => {
			if (args.trim()) {
				const message = "Usage: /usage takes no arguments";
				pi.appendEntry<UsageEntry>("usage", { message });
				if (ctx.mode === "print") process.stderr.write(`${message}\n`);
				return;
			}
			const version = ++refreshVersion;
			let snapshot: UsageSnapshot;
			try {
				snapshot = await collectUsage(await discoverCredentials());
			} catch {
				snapshot = await collectUsage({});
			}
			pi.appendEntry<UsageEntry>("usage", { snapshot });
			if (ctx.mode === "print") process.stderr.write(`${usageLines(snapshot, plainStyle).join("\n")}\n`);
			const provider = providerForModel(ctx.model?.provider);
			const result = provider && snapshot.results.find((candidate) => candidate.provider === provider);
			if (version === refreshVersion && provider && result) setStatus(ctx, provider, formatStatus(provider, result));
			if (!provider) ctx.ui.setStatus("usage", undefined);
		},
	});
}
