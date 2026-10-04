import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelSelectorComponent, type ExtensionAPI, type ExtensionContext, type ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { MODEL_ENTRY, supportsWebModel, WebModelSelection } from "./model.ts";

export function registerWebModelCommand(pi: ExtensionAPI, selection: WebModelSelection) {
	pi.registerCommand("web-model", {
		description: "Choose the web model; Enter selects for this session, the picker save shortcut sets the default",
		async handler(query, ctx) {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/web-model requires TUI mode. Configure defaultModel in the agent directory's w-web.json.", "error");
				return;
			}
			try {
				const selected = selection.selected(ctx);
				const saved = selection.defaultModel();
				const picked = await ctx.ui.custom<{ model: Model<Api>; save: boolean } | undefined>((tui, theme, _keys, done) => {
					const runtime = pickerRuntime(ctx);
					const picker = new ModelSelectorComponent(
						tui, runtime.getModel(selected.provider, selected.id), runtime as unknown as ModelRuntime,
						ctx.scopedModels.filter(item => supportsWebModel(item.model, ctx)),
						model => done({ model, save: false }), () => done(undefined), query.trim(),
						model => done({ model, save: true }), saved,
					);
					const heading = new Text(theme.fg("accent", theme.bold("Web model")) +
						`\n${theme.fg("muted", `Current: ${selected.provider}/${selected.id}\nDefault: ${saved.provider}/${saved.id}\nCodex or Anthropic API key only. Claude subscriptions are excluded.`)}`, 0, 0);
					return {
						get focused() { return picker.focused; },
						set focused(value: boolean) { picker.focused = value; },
						render(width: number) { return [...heading.render(width), ...picker.render(width)]; },
						invalidate() { heading.invalidate(); picker.invalidate(); },
						handleInput(data: string) { picker.handleInput(data); tui.requestRender(); },
						dispose() { picker.dispose(); },
					};
				});
				if (!picked) return;
				if (!supportsWebModel(picked.model, ctx)) throw new Error("That model cannot use w-web. No selection was changed.");
				const model = { provider: picked.model.provider, id: picked.model.id };
				if (picked.save) selection.saveDefault(model);
				pi.appendEntry(MODEL_ENTRY, model);
				ctx.ui.notify(`Web model: ${model.provider}/${model.id}${picked.save ? " (saved default)" : " (this session)"}`, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : "Could not select the web model.", "error");
			}
		},
	});
}

function pickerRuntime(ctx: ExtensionContext) {
	// The host picker takes ModelRuntime, but extensions receive its registry facade.
	return {
		getAvailableSnapshot: () => ctx.modelRegistry.getAvailable().filter(model => supportsWebModel(model, ctx)),
		getModel: (provider: string, id: string) => {
			const model = ctx.modelRegistry.find(provider, id);
			return model && supportsWebModel(model, ctx) ? model : undefined;
		},
		getError: () => ctx.modelRegistry.getError(),
		refresh: (options) => ctx.modelRegistry.refresh(options),
	} satisfies Pick<ModelRuntime, "getAvailableSnapshot" | "getModel" | "getError" | "refresh">;
}
