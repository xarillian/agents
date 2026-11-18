import assert from "node:assert/strict";
import test from "node:test";
import deduplicate, { removeDuplicateContext } from "../index.ts";

const context = (path: string, content: string) => ({ path, content });

test("a later context file repeating earlier instructions is dropped", () => {
	const global = context("/home/me/.pi/agent/AGENTS.md", "Be concise.");
	const project = context("/home/me/.agents/AGENTS.md", "Be concise.");
	const local = context("/home/me/.agents/packages/AGENTS.md", "Local.");

	assert.deepEqual(removeDuplicateContext([global, project, local]), [global, local]);
});

test("context files with distinct instructions are all kept", () => {
	const global = context("/global/AGENTS.md", "Same.");
	const project = context("/project/AGENTS.md", "Changed by another extension.");

	assert.deepEqual(removeDuplicateContext([global, project]), [global, project]);
});

test("the handler edits context files and leaves the prompt for Pi to build", () => {
	let handler: Function = () => {};
	deduplicate({ on: (_event: string, registered: Function) => (handler = registered) } as never);
	const global = context("/global/AGENTS.md", "Same.");
	const systemPromptOptions = { contextFiles: [global, context("/project/AGENTS.md", "Same.")] };

	const result = handler({ systemPromptOptions });

	assert.equal(result, undefined);
	assert.deepEqual(systemPromptOptions.contextFiles, [global]);
});
