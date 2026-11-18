import type { Api, Model, Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type Provider = "openai-codex" | "anthropic";
export type WebContext = Pick<ExtensionContext, "model" | "modelRegistry" | "sessionManager">;
export interface Source {
	id: string;
	url: string;
	title: string;
}
export interface SourceLine {
	line?: number;
	column?: number;
	text: string;
}
export interface SourceCard {
	source: Source;
	kind: "snippet" | "passage";
	lines: SourceLine[];
	cached?: boolean;
	notice?: string;
	continuation?: string;
}
export interface WebDetails {
	provider?: Provider;
	model?: { provider: string; id: string };
	sources: Source[];
	cards: SourceCard[];
	usage?: Usage;
}
export interface SearchHit {
	url: string;
	title: string;
	snippet?: string;
}
export interface Page {
	lines: Record<number, string>;
	totalLines: number;
	notice?: string;
}
export interface Retrieved<T> {
	value: T;
	usage?: Usage;
}
export interface WebProvider {
	name: Provider;
	search(query: string, signal?: AbortSignal): Promise<Retrieved<SearchHit[]>>;
	read(url: string, line: number, signal?: AbortSignal): Promise<Retrieved<Page>>;
	find?(url: string, pattern: string, signal?: AbortSignal): Promise<Retrieved<Page>>;
}

export function webModel(model: Model<Api> | undefined): Model<Api> & { provider: Provider } {
	if (!model || (model.provider !== "openai-codex" && model.provider !== "anthropic")) {
		throw new Error("w-web supports the openai-codex and anthropic providers. Select one with /web-model; providers are never substituted.");
	}
	const origin = model.provider === "openai-codex" ? "https://chatgpt.com" : "https://api.anthropic.com";
	const api = model.provider === "openai-codex" ? "openai-codex-responses" : "anthropic-messages";
	if (new URL(model.baseUrl).origin !== origin || model.api !== api) {
		throw new Error(`w-web requires the native ${model.provider} endpoint and API.`);
	}
	return model as Model<Api> & { provider: Provider };
}

export function publicUrl(value: string): string {
	if (value.length > 2048) throw new Error("w-web URLs must not exceed 2048 characters.");
	const url = new URL(value);
	if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) {
		throw new Error("w-web accepts public HTTP(S) URLs without credentials or custom ports.");
	}
	const host = url.hostname.toLowerCase();
	if (!host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") ||
		host.endsWith(".internal") || /^[\d.]+$/.test(host) || host.includes(":")) {
		throw new Error("w-web does not retrieve local hosts or IP addresses.");
	}
	url.hash = "";
	return url.href;
}

export function cleanText(text: string): string {
	return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

export function deadline(signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(90_000);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
