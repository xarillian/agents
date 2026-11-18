import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type ContextFile = {
	path: string;
	content: string;
};

const importLine = /^@(\S+)$/gm;

export function resolveImportPath(target: string, importer: string): string {
	return target.startsWith("~/") ? join(homedir(), target.slice(2)) : resolve(dirname(importer), target);
}

function readImport(path: string): string | undefined {
	return statSync(path, { throwIfNoEntry: false })?.isFile() ? readFileSync(path, "utf8").trimEnd() : undefined;
}

export function inlineImports({ path, content }: ContextFile): string {
	return content.replace(importLine, (line, target) => readImport(resolveImportPath(target, path)) ?? line);
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		for (const file of event.systemPromptOptions.contextFiles) file.content = inlineImports(file);
	});
}
