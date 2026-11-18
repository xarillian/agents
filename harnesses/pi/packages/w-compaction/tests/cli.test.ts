import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const extension = fileURLToPath(new URL("../index.ts", import.meta.url));
const transport = fileURLToPath(new URL("fixtures/transport.ts", import.meta.url));

async function rpc(t: any, command: object, options: { history?: boolean; failNative?: boolean; missingConverters?: boolean } = {}) {
	const directory = mkdtempSync(join(tmpdir(), "w-compaction-cli-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const agentDir = join(directory, "agent");
	mkdirSync(agentDir);
	writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ compaction: { keepRecentTokens: 5, reserveTokens: 100 } }));
	const args = ["--mode", "rpc", "--no-extensions", "-e", extension, "--provider", "openai", "--model", "gpt-5.5"];
	if (options.history) {
		const timestamp = new Date().toISOString();
		const messages = [
			{ role: "user", content: "Preserve the old sentinel 8675309", timestamp: Date.now() },
			{ role: "assistant", content: [{ type: "text", text: "I will preserve it." }], timestamp: Date.now(),
				provider: "openai", api: "openai-responses", model: "gpt-5.5", stopReason: "stop",
				usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } },
			{ role: "user", content: "Recent work with enough text to exceed the retained-history budget", timestamp: Date.now() },
		];
		const entries = messages.map((message, i) => ({ type: "message", id: `message-${i}`, parentId: i ? `message-${i - 1}` : null, timestamp, message }));
		const path = join(directory, "session.jsonl");
		writeFileSync(path, [{ type: "session", version: 3, id: randomUUID(), timestamp, cwd: directory }, ...entries].map(entry => JSON.stringify(entry)).join("\n") + "\n");
		args.push("--session", path, "-e", transport);
	} else args.push("--no-session");
	const env: NodeJS.ProcessEnv = { ...process.env, HOME: directory, PI_CODING_AGENT_DIR: agentDir, OPENAI_API_KEY: "test-key",
		W_COMPACTION_TEST_FAIL_NATIVE: options.failNative ? "1" : "" };
	delete env.NODE_OPTIONS;
	delete env.NODE_PATH;
	if (options.missingConverters) env.PI_PACKAGE_DIR = directory;
	return await new Promise<{ records: any[]; stderr: string; code: number | null }>((resolve, reject) => {
		const child = spawn("pi", args, { cwd: directory, env, stdio: ["pipe", "pipe", "pipe"] });
		const records: any[] = [];
		let stderr = "", buffered = "";
		const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Pi RPC timed out: ${stderr}`)); }, 20_000);
		child.on("error", error => { clearTimeout(timer); reject(error); });
		child.stderr.setEncoding("utf8").on("data", text => { stderr += text; });
		child.stdout.setEncoding("utf8").on("data", text => {
			buffered += text;
			let end: number;
			while ((end = buffered.indexOf("\n")) >= 0) {
				const line = buffered.slice(0, end).trim();
				buffered = buffered.slice(end + 1);
				if (!line) continue;
				try {
					const record = JSON.parse(line);
					records.push(record);
					if (record.type === "response" && record.id === "test") child.stdin.end();
				} catch (error) { child.kill(); clearTimeout(timer); reject(error); }
			}
		});
		child.on("close", code => { clearTimeout(timer); resolve({ records, stderr, code }); });
		child.stdin.on("error", error => { clearTimeout(timer); child.kill(); reject(error); });
		child.stdin.write(JSON.stringify({ ...command, id: "test" }) + "\n");
	});
}

test("the shipped Pi CLI starts with w-compaction and answers RPC without resolver hooks", async t => {
	const result = await rpc(t, { type: "get_state" });
	assert.equal(result.code, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /Failed to load extension|Cannot find module/);
	assert.equal(result.records.find(record => record.id === "test")?.success, true);
});

test("the shipped Pi CLI performs native compaction using its installed converters", async t => {
	const result = await rpc(t, { type: "compact" }, { history: true });
	assert.equal(result.code, 0, result.stderr);
	const reply = result.records.find(record => record.id === "test");
	assert.equal(reply?.success, true, JSON.stringify(result));
	assert.equal(reply.data.details.kind, "w-compaction/v1", JSON.stringify(result));
	assert.equal(reply.data.details.output[0].encrypted_content, "test-native-state");
	assert.doesNotMatch(JSON.stringify(result.records), /using fallback compaction/);
});

test("missing installed converters trigger visible fallback rather than blocking CLI startup", async t => {
	const result = await rpc(t, { type: "compact" }, { history: true, missingConverters: true });
	assert.equal(result.code, 0, result.stderr);
	const reply = result.records.find(record => record.id === "test");
	assert.equal(reply?.success, true, JSON.stringify(result));
	assert.match(reply.data.summary, /portable fallback summary/);
	assert.match(JSON.stringify(result.records) + result.stderr, /using fallback compaction \(Pi\)/);
	assert.doesNotMatch(result.stderr, /Failed to load extension/);
});

test("the shipped Pi CLI announces native failure and completes Pi fallback compaction", async t => {
	const result = await rpc(t, { type: "compact" }, { history: true, failNative: true });
	assert.equal(result.code, 0, result.stderr);
	const reply = result.records.find(record => record.id === "test");
	assert.equal(reply?.success, true, JSON.stringify(result));
	assert.match(reply.data.summary, /portable fallback summary/);
	assert.match(JSON.stringify(result.records) + result.stderr, /using fallback compaction \(Pi\)/);
});
