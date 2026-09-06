import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { collectProviderUsage, collectUsage, discoverCredentials, formatStatus, formatUsage, providerForModel } from "../usage.ts";
type UsageEntry = { text: string };
export default function (pi: ExtensionAPI) {
	let refreshVersion = 0;
	pi.registerEntryRenderer<UsageEntry>("usage", (entry, _options, theme) => {
		const text = (entry.data?.text ?? "Usage unavailable")
			.replaceAll("◆ Claude Code", theme.fg("warning", theme.bold("◆ Claude Code")))
			.replaceAll("● Codex", theme.fg("accent", theme.bold("● Codex")))
			.replaceAll("◇ OpenRouter", theme.fg("success", theme.bold("◇ OpenRouter")))
			.replace(/\[([◆]*)([◇]*)\]/g, (_bar, filled, empty) =>
				theme.fg("muted", "[") + theme.fg("warning", filled) + theme.fg("dim", empty) + theme.fg("muted", "]"),
			)
			.replace(/\[([█]*)([░]*)\]/g, (_bar, filled, empty) =>
				theme.fg("muted", "[") + theme.fg("accent", filled) + theme.fg("dim", empty) + theme.fg("muted", "]"),
			);
		return new Text(text, 1, 0);
	});
	const setStatus = (ctx: ExtensionContext, provider: "claude" | "codex" | "openrouter", text: string) => {
		const color = provider === "claude" ? "warning" : provider === "codex" ? "accent" : "success";
		ctx.ui.setStatus("usage", ctx.ui.theme.fg(color, text));
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
				const text = "Usage: /usage takes no arguments";
				pi.appendEntry<UsageEntry>("usage", { text });
				if (ctx.mode === "print") process.stderr.write(`${text}\n`);
				return;
			}
			const version = ++refreshVersion;
			let results;
			try {
				results = await collectUsage(await discoverCredentials());
			} catch {
				results = await collectUsage({});
			}
			const text = formatUsage(results);
			pi.appendEntry<UsageEntry>("usage", { text });
			if (ctx.mode === "print") process.stderr.write(`${text}\n`);
			const provider = providerForModel(ctx.model?.provider);
			const result = provider && results.find((candidate) => candidate.provider === provider);
			if (version === refreshVersion && provider && result) setStatus(ctx, provider, formatStatus(provider, result));
			if (!provider) ctx.ui.setStatus("usage", undefined);
		},
	});
}
