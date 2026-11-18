import { join } from "node:path";
import { type ExtensionAPI, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import { projectDirs, readPrompts } from "./history.ts";
import { type HistoryChoice, HistorySearch, type Scope } from "./search.ts";

export default function (pi: ExtensionAPI) {
	const searchHistory = async (ctx: ExtensionContext) => {
		const choice = await ctx.ui.custom<HistoryChoice | undefined>(
			(tui, theme, _keybindings, done) => new HistorySearch(tui, theme, (scope) => promptsIn(scope, ctx), done),
		);
		if (!choice) return;
		if (choice.action === "edit") return ctx.ui.setEditorText(choice.prompt);

		pi.sendUserMessage(choice.prompt, { expandPromptTemplates: true, ...(ctx.isIdle() ? {} : { deliverAs: "steer" }) });
	};

	pi.registerCommand("history", {
		description: "Search the prompts you sent in past sessions.",
		handler: async (_args, ctx) => searchHistory(ctx),
	});

	pi.registerShortcut("ctrl+r", {
		description: "Search prompt history",
		handler: searchHistory,
	});
}

async function promptsIn(scope: Scope, ctx: ExtensionContext) {
	const sessionDirs = scope === "project" ? [ctx.sessionManager.getSessionDir()] : await projectDirs(join(getAgentDir(), "sessions"));
	return readPrompts(sessionDirs);
}
