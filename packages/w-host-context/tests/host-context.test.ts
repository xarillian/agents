import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inlineImports, resolveImportPath } from "../index.ts";

const root = mkdtempSync(join(tmpdir(), "w-host-context-"));
const agents = join(root, "AGENTS.md");
writeFileSync(join(root, "user-context.md"), "# User Context\n\n**Time Zone:** `America/Regina`\n");
mkdirSync(join(root, "profiles"));

test("an import line becomes the imported file's text", () => {
	const content = "# Engineering\n\n@./user-context.md\n";

	assert.equal(inlineImports({ path: agents, content }), "# Engineering\n\n# User Context\n\n**Time Zone:** `America/Regina`\n");
});

test("an import of a missing file stays as written", () => {
	const content = "@./host-context.md\n";

	assert.equal(inlineImports({ path: agents, content }), content);
});

test("an import of a directory stays as written", () => {
	const content = "@./profiles\n";

	assert.equal(inlineImports({ path: agents, content }), content);
});

test("an @ inside a sentence is a mention, not an import", () => {
	const content = "Ask @./user-context.md about it.\n";

	assert.equal(inlineImports({ path: agents, content }), content);
});

test("a ~/ import resolves from the home directory", () => {
	assert.equal(resolveImportPath("~/.agents/user-context.md", agents), join(homedir(), ".agents/user-context.md"));
});

test("a relative import resolves beside the importing file", () => {
	assert.equal(resolveImportPath("../user-context.md", "/home/me/.agents/profiles/AGENTS.md"), "/home/me/.agents/user-context.md");
});
