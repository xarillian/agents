import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type ContextFile = {
	path: string;
	content: string;
};

const contextBlock = ({ path, content }: ContextFile) =>
	`<project_instructions path="${path}">\n${content}\n</project_instructions>\n\n`;

export function findDuplicateContextFiles(contextFiles: ContextFile[] = []): Set<string> {
	const seenContent = new Set<string>();
	const duplicatePaths = new Set<string>();

	for (const file of contextFiles) {
		if (seenContent.has(file.content)) duplicatePaths.add(file.path);
		else seenContent.add(file.content);
	}

	return duplicatePaths;
}

export function removeDuplicateContext(prompt: string, contextFiles: ContextFile[] = []): string {
	const duplicatePaths = findDuplicateContextFiles(contextFiles);

	for (const file of contextFiles) {
		if (duplicatePaths.has(file.path)) prompt = prompt.replace(contextBlock(file), "");
	}

	return prompt;
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => ({
		systemPrompt: removeDuplicateContext(event.systemPrompt, event.systemPromptOptions.contextFiles),
	}));
}
