import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelSelectorComponent, type ExtensionAPI, type ExtensionContext, type ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { isReference, type MemoryFile, type ModelReference } from "./memory.ts";

export const MODEL_ENTRY = "w-diviner:model";
const MAIN = "main";

/** "main" follows whatever model the session runs, so the reading can reuse its cache. */
export type Choice = ModelReference | typeof MAIN;

type ModelContext = Pick<ExtensionContext, "modelRegistry" | "sessionManager" | "model">;

export function chosen(ctx: Pick<ExtensionContext, "sessionManager">, memory: MemoryFile): Choice {
	for (const entry of ctx.sessionManager.getBranch().toReversed()) {
		if (entry.type === "custom" && entry.customType === MODEL_ENTRY) return isReference(entry.data) ? entry.data : MAIN;
	}
	return memory.read().defaultModel ?? MAIN;
}

export function resolve(ctx: ModelContext, choice: Choice): Model<Api> {
	const model = choice === MAIN ? ctx.model : ctx.modelRegistry.find(choice.provider, choice.id);
	if (!model || !usable(model, ctx)) throw new Error(`The diviner cannot use ${describe(choice)}. Pick another with /diviner-model.`);
	return model;
}

export const describe = (choice: Choice) => choice === MAIN ? "the session's model" : `${choice.provider}/${choice.id}`;

export function registerModelCommand(pi: ExtensionAPI, memory: MemoryFile) {
	pi.registerCommand("diviner-model", {
		description: "Choose the diviner's model: `main` follows the session; Enter picks for this session, the picker save shortcut sets the default",
		async handler(query, ctx) {
			try {
				if (query.trim() === MAIN) {
					memory.update(({ defaultModel: _, ...rest }) => rest);
					pi.appendEntry(MODEL_ENTRY, null);
					ctx.ui.notify("Diviner model: the session's model (saved default)", "info");
					return;
				}
				if (ctx.mode !== "tui") {
					ctx.ui.notify("/diviner-model needs TUI mode for the picker. `/diviner-model main` works anywhere.", "error");
					return;
				}
				const picked = await pick(ctx, chosen(ctx, memory), memory.read().defaultModel, query.trim());
				if (!picked) return;
				const model = { provider: picked.model.provider, id: picked.model.id };
				if (picked.save) memory.update(current => ({ ...current, defaultModel: model }));
				pi.appendEntry(MODEL_ENTRY, model);
				ctx.ui.notify(`Diviner model: ${describe(model)}${picked.save ? " (saved default)" : " (this session)"}`, "info");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : "Could not choose the diviner's model.", "error");
			}
		},
	});
}

function pick(ctx: ExtensionContext, current: Choice, saved: ModelReference | undefined, query: string) {
	return ctx.ui.custom<{ model: Model<Api>; save: boolean } | undefined>((tui, theme, _keys, done) => {
		const runtime = pickerRuntime(ctx);
		const highlighted = current === MAIN ? ctx.model : runtime.getModel(current.provider, current.id);
		const picker = new ModelSelectorComponent(
			tui, highlighted, runtime as unknown as ModelRuntime,
			ctx.scopedModels.filter(item => usable(item.model, ctx)),
			model => done({ model, save: false }), () => done(undefined), query,
			model => done({ model, save: true }), saved,
		);
		const heading = new Text(theme.fg("accent", theme.bold("Diviner model")) +
			`\n${theme.fg("muted", `Current: ${describe(current)}\nDefault: ${describe(saved ?? MAIN)}\nRun /diviner-model main to follow the session's model again.`)}`, 0, 0);
		return {
			get focused() { return picker.focused; },
			set focused(value: boolean) { picker.focused = value; },
			render(width: number) { return [...heading.render(width), ...picker.render(width)]; },
			invalidate() { heading.invalidate(); picker.invalidate(); },
			handleInput(data: string) { picker.handleInput(data); tui.requestRender(); },
			dispose() { picker.dispose(); },
		};
	});
}

/** Matches w-web: a forked transcript never goes out on Claude subscription credentials. */
const usable = (model: Model<Api>, ctx: Pick<ExtensionContext, "modelRegistry">) =>
	model.provider !== "anthropic" || !ctx.modelRegistry.isUsingOAuth(model);

function pickerRuntime(ctx: ExtensionContext) {
	// The host picker takes ModelRuntime, but extensions receive its registry facade.
	return {
		getAvailableSnapshot: () => ctx.modelRegistry.getAvailable().filter(model => usable(model, ctx)),
		getModel: (provider: string, id: string) => {
			const model = ctx.modelRegistry.find(provider, id);
			return model && usable(model, ctx) ? model : undefined;
		},
		getError: () => ctx.modelRegistry.getError(),
		refresh: (options) => ctx.modelRegistry.refresh(options),
	} satisfies Pick<ModelRuntime, "getAvailableSnapshot" | "getModel" | "getError" | "refresh">;
}
