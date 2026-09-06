import assert from "node:assert/strict";
import test from "node:test";
import { removeDuplicateContext } from "../index.ts";

const context = (path: string, content: string) => ({ path, content });
const block = (path: string, content: string) => `<project_instructions path="${path}">\n${content}\n</project_instructions>\n\n`;

test("removes later context blocks with identical instructions", () => {
	const global = context("/home/me/.pi/agent/AGENTS.md", "Be concise.");
	const project = context("/home/me/.agents/AGENTS.md", "Be concise.");
	const prompt = `Before\n\n${block(global.path, global.content)}${block(project.path, project.content)}After`;

	assert.equal(removeDuplicateContext(prompt, [global, project]), `Before\n\n${block(global.path, global.content)}After`);
});

test("keeps distinct instructions and duplicate text outside context blocks", () => {
	const global = context("/global/AGENTS.md", "Same.");
	const project = context("/project/AGENTS.md", "Same.");
	const local = context("/project/subdir/AGENTS.md", "Local.");
	const prompt = `Same.\n\n${block(global.path, global.content)}${block(project.path, project.content)}${block(local.path, local.content)}`;

	assert.equal(
		removeDuplicateContext(prompt, [global, project, local]),
		`Same.\n\n${block(global.path, global.content)}${block(local.path, local.content)}`,
	);
});

test("does not remove a context block that a prior extension changed", () => {
	const global = context("/global/AGENTS.md", "Same.");
	const project = context("/project/AGENTS.md", "Same.");
	const changedProjectBlock = block(project.path, "Changed by another extension.");
	const prompt = `${block(global.path, global.content)}${changedProjectBlock}`;

	assert.equal(removeDuplicateContext(prompt, [global, project]), prompt);
});
