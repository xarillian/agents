import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { hideCommand } from "../w-effort/hide-command.ts";

type ModelReference = { provider: string; id: string };

const NEW_COMMAND = "new";

/** A replacement session resolves its model from settings, so the model in play is handed forward here: the extension instance does not survive the switch, but the module does. */
let carriedModel: ModelReference | undefined;

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode === "tui") ctx.ui.addAutocompleteProvider((current) => hideCommand(current, NEW_COMMAND));

		const carried = carriedModel;
		carriedModel = undefined;
		if (!carried) return;
		if (ctx.model?.provider === carried.provider && ctx.model.id === carried.id) return;

		const model = ctx.modelRegistry.find(carried.provider, carried.id);
		if (model && (await pi.setModel(model))) return;

		ctx.ui.notify(`Kept the startup model: ${carried.provider}/${carried.id} is unavailable.`, "warning");
	});

	pi.registerCommand("clear", {
		description: "Start a new session with empty context.",
		handler: async (_args, ctx) => {
			carriedModel = ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined;
			await ctx.newSession();
		},
	});
}
