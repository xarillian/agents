import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type ContextFile = {
	path: string;
	content: string;
};

export function findDuplicateContextFiles(contextFiles: ContextFile[] = []): Set<string> {
	const seenContent = new Set<string>();
	const duplicatePaths = new Set<string>();

	for (const file of contextFiles) {
		if (seenContent.has(file.content)) duplicatePaths.add(file.path);
		else seenContent.add(file.content);
	}

	return duplicatePaths;
}

export function removeDuplicateContext(contextFiles: ContextFile[] = []): ContextFile[] {
	const duplicatePaths = findDuplicateContextFiles(contextFiles);

	return contextFiles.filter((file) => !duplicatePaths.has(file.path));
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", ({ systemPromptOptions }) => {
		systemPromptOptions.contextFiles = removeDuplicateContext(systemPromptOptions.contextFiles);
	});
}
