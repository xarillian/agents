import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { completeEffortLevel, readEffortRequest } from "./effort.ts";
import { hideCommand } from "./hide-command.ts";

const THINKING_COMMAND = "thinking";

const acceptedLevels = (model: ExtensionContext["model"]): ThinkingLevel[] =>
	model ? (getSupportedThinkingLevels(model) as ThinkingLevel[]) : [];

export default function (pi: ExtensionAPI) {
	let session: ExtensionContext | undefined;

	const report = (ctx: ExtensionContext, message: string, level: "info" | "warning" = "info") => {
		if (ctx.hasUI) ctx.ui.notify(message, level);
		else process.stderr.write(`${message}\n`);
	};

	const chooseLevel = async (ctx: ExtensionContext, accepted: ThinkingLevel[]) => {
		const current = pi.getThinkingLevel();
		if (ctx.hasUI) return (await ctx.ui.select(`Effort (now ${current})`, accepted)) as ThinkingLevel | undefined;

		report(ctx, `Effort: ${current} · accepts ${accepted.join(", ")}`);
		return undefined;
	};

	pi.on("session_start", (_event, ctx) => {
		session = ctx;
		if (ctx.mode !== "tui") return;
		ctx.ui.addAutocompleteProvider((current) => hideCommand(current, THINKING_COMMAND));
	});

	pi.on("session_shutdown", () => {
		session = undefined;
	});

	pi.registerCommand("effort", {
		description: "Set reasoning effort",
		getArgumentCompletions: (prefix) => completeEffortLevel(prefix, acceptedLevels(session?.model)),
		handler: async (args, ctx) => {
			const accepted = acceptedLevels(ctx.model);
			if (!ctx.model) return report(ctx, "No model is selected.", "warning");
			if (accepted.length < 2) return report(ctx, `${ctx.model.id} has no reasoning effort to set.`, "warning");

			const request = readEffortRequest(args, accepted);
			if (request.kind === "unsupported") {
				return report(ctx, `Unknown effort "${request.requested}". ${ctx.model.id} accepts ${accepted.join(", ")}.`, "warning");
			}

			const level = request.kind === "level" ? request.level : await chooseLevel(ctx, accepted);
			if (!level) return;

			pi.setThinkingLevel(level);
			report(ctx, `Effort: ${pi.getThinkingLevel()}`);
		},
	});
}
