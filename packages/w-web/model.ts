import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { webModel } from "./contracts.ts";

export interface ModelReference { provider: string; id: string }
export const DEFAULT_WEB_MODEL: ModelReference = { provider: "openai-codex", id: "gpt-6-luna" };
export const MODEL_ENTRY = "w-web:model";

type ModelContext = Pick<ExtensionContext, "modelRegistry" | "sessionManager">;

export class WebModelSelection {
	private path: string;
	constructor(path: string) { this.path = path; }

	defaultModel(): ModelReference {
		const saved = this.settings().defaultModel;
		if (saved === undefined) return { ...DEFAULT_WEB_MODEL };
		return reference(saved);
	}

	selected(ctx: ModelContext): ModelReference {
		for (const entry of ctx.sessionManager.getBranch().toReversed()) {
			if (entry.type === "custom" && entry.customType === MODEL_ENTRY) return reference(entry.data);
		}
		return this.defaultModel();
	}

	resolve(ctx: ModelContext) {
		const selected = this.selected(ctx);
		const model = ctx.modelRegistry.find(selected.provider, selected.id);
		if (!model) throw new Error(`Web model ${selected.provider}/${selected.id} is unavailable. Select one with /web-model; no other model was tried.`);
		const valid = webModel(model);
		if (valid.provider === "anthropic" && ctx.modelRegistry.isUsingOAuth(valid)) {
			throw new Error("w-web does not use Claude subscription credentials. Use Claude Code for subscription-backed web access. No other provider was tried.");
		}
		return valid;
	}

	saveDefault(model: ModelReference) {
		const settings = { ...this.settings(), defaultModel: reference(model) };
		mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
		const temporary = `${this.path}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
			renameSync(temporary, this.path);
		} finally {
			rmSync(temporary, { force: true });
		}
	}

	private settings(): Record<string, unknown> {
		let text: string;
		try { text = readFileSync(this.path, "utf8"); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
			throw error;
		}
		const value: unknown = JSON.parse(text);
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid web settings in ${this.path}.`);
		return value as Record<string, unknown>;
	}
}

export function supportsWebModel(model: Model<Api>, ctx: Pick<ExtensionContext, "modelRegistry">): boolean {
	try { webModel(model); } catch { return false; }
	return model.provider !== "anthropic" || !ctx.modelRegistry.isUsingOAuth(model);
}

function reference(value: unknown): ModelReference {
	if (!value || typeof value !== "object" || !("provider" in value) || !("id" in value) ||
		typeof value.provider !== "string" || !value.provider.trim() || typeof value.id !== "string" || !value.id.trim()) {
		throw new Error("Invalid web model reference; expected provider and id strings.");
	}
	return { provider: value.provider, id: value.id };
}
