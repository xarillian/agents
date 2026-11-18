import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

const host = createRequire(realpathSync(execFileSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim()));
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "@earendil-works/pi-tui") return { url: pathToFileURL(host.resolve(specifier)).href, shortCircuit: true };
		return nextResolve(specifier, context);
	},
});
const { default: install } = await import("../index.ts");
const { SPINNER_VERBS } = await import("../verbs.ts");
const { createAnimatedGradient, renderGradient } = await import("../../w-startup/gradient.ts");
const { createAnimatedLogo, LOGO_WIDTH } = await import("../../w-startup/logo.ts");
const { stripTerminalSequences, visibleWidth } = await import("@earendil-works/pi-tui");

test("a verb spans the logo's pink, violet, and cyan palette", () => {
	assert.equal(renderGradient(["ABC"], 0, true)[0],
		"\x1b[38;2;248;79;204mA\x1b[39m\x1b[38;2;147;98;244mB\x1b[39m\x1b[38;2;0;219;228mC\x1b[39m");
	assert.equal(renderGradient(["ABC"], 0, false)[0],
		"\x1b[38;5;206mA\x1b[39m\x1b[38;5;99mB\x1b[39m\x1b[38;5;44mC\x1b[39m");
});

test("the gradient and shine move and repeat together every twelve seconds", () => {
	const first = renderGradient(["Considering…"], 0, true);
	assert.notDeepEqual(renderGradient(["Considering…"], 1000, true), first);
	assert.deepEqual(renderGradient(["Considering…"], 12000, true), first);
});

test("colouring preserves every verb, its width, and its ellipsis", () => {
	for (const verb of SPINNER_VERBS) {
		for (const trueColor of [true, false]) {
			const message = `${verb}…`;
			const rendered = renderGradient([message], 1733, trueColor)[0];
			assert.equal(stripTerminalSequences(rendered), message);
			assert.equal(visibleWidth(rendered), visibleWidth(message));
			assert.ok(rendered.endsWith("\x1b[39m"));
			assert.doesNotMatch(rendered, /NaN/);
		}
	}
	assert.equal(stripTerminalSequences(renderGradient(["é"], 0, true)[0]), "é");
});

test("the shared animation keeps the startup logo's shape and diagonal colour positions", () => {
	const logo = createAnimatedLogo(() => {});
	try {
		const lines = logo.render();
		assert.deepEqual(lines.map(stripTerminalSequences), ["████████████", "   ██  ██   ", "   ██  ██   ", "   ▒▒  ██   ", "       ██   "]);
		assert.ok(lines.every((line) => visibleWidth(line) === LOGO_WIDTH));
		const frame = renderGradient(["ABC", "DEF", "GHI"], 0, true);
		const firstColor = (line: string) => line.match(/^\x1b\[[^m]+m/)![0];
		assert.equal(firstColor(frame[0]), "\x1b[38;2;248;79;204m");
		assert.equal(firstColor(frame[2]), "\x1b[38;2;147;98;244m");
	} finally {
		logo.dispose();
	}
});

test("animation starts on first render and disposal prevents further ticks or restarts", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	let ticks = 0;
	const animation = createAnimatedGradient(["Working…"], () => ticks++);
	t.mock.timers.tick(99);
	assert.equal(ticks, 0);
	animation.render();
	t.mock.timers.tick(99);
	assert.equal(ticks, 3);
	animation.dispose();
	animation.dispose();
	animation.render();
	t.mock.timers.tick(99);
	assert.equal(ticks, 3);
});

function harness() {
	const handlers = new Map<string, Function>();
	const messages: (string | undefined)[] = [];
	const indicators: ({ frames: string[]; intervalMs: number } | undefined)[] = [];
	install({ on: (event, handler) => handlers.set(event, handler) } as any);
	const ctx = { mode: "tui", ui: {
		setWorkingMessage: (message?: string) => messages.push(message),
		setWorkingIndicator: (indicator?: { frames: string[]; intervalMs: number }) => indicators.push(indicator),
		theme: { fg: (_color: string, text: string) => `\x1b[35m${text}\x1b[39m` },
	} };
	return { handlers, messages, indicators, ctx };
}

test("a run picks one verb, animates its colours, then restores the default on completion", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	let now = 0;
	t.mock.method(performance, "now", () => now);
	const h = harness();
	h.handlers.get("agent_start")!({}, h.ctx);
	const first = h.messages.at(-1)!;
	const verb = stripTerminalSequences(first);
	assert.ok(SPINNER_VERBS.some((item) => `${item}…` === verb));
	assert.match(first, /\x1b\[38;/);
	now = 1000;
	t.mock.timers.tick(33);
	assert.equal(stripTerminalSequences(h.messages.at(-1)!), verb);
	assert.notEqual(h.messages.at(-1), first);
	assert.equal(h.indicators.length, 1);
	h.handlers.get("agent_end")!({}, h.ctx);
	assert.equal(h.messages.at(-1), undefined);
	assert.equal(h.indicators.at(-1), undefined);
	const count = h.messages.length;
	t.mock.timers.tick(99);
	assert.equal(h.messages.length, count);
});

test("restarting a run replaces its timer and shutdown cleans it up", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const h = harness();
	h.handlers.get("agent_start")!({}, h.ctx);
	h.handlers.get("agent_start")!({}, h.ctx);
	const count = h.messages.length;
	t.mock.timers.tick(33);
	assert.equal(h.messages.length, count + 1);
	h.handlers.get("session_shutdown")!({}, h.ctx);
	assert.equal(h.messages.at(-1), undefined);
	assert.equal(h.indicators.at(-1), undefined);
	const stoppedCount = h.messages.length;
	t.mock.timers.tick(99);
	assert.equal(h.messages.length, stoppedCount);
});

test("print, JSON, and RPC runs do not animate or change UI state", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const h = harness();
	for (const mode of ["print", "json", "rpc"]) h.handlers.get("agent_start")!({}, { ...h.ctx, mode });
	t.mock.timers.tick(99);
	assert.deepEqual(h.messages, []);
	assert.deepEqual(h.indicators, []);
});

test("each spinner frame moves down one dot-row without changing its shape, width, or speed", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const h = harness();
	h.handlers.get("agent_start")!({}, h.ctx);
	const indicator = h.indicators.at(-1)!;
	assert.equal(indicator.intervalMs, 80);
	const originals = [..."⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"];
	const dots = (frame: string) => {
		const bits = frame.codePointAt(0)! - 0x2800;
		return [[1, 8], [2, 16], [4, 32], [64, 128]].flatMap((row, y) =>
			row.flatMap((bit, x) => bits & bit ? [[x, y]] : []));
	};
	assert.equal(indicator.frames.length, originals.length);
	indicator.frames.forEach((frame, i) => {
		assert.equal(visibleWidth(frame), 1);
		assert.match(frame, /^\x1b\[35m/);
		assert.deepEqual(dots(stripTerminalSequences(frame)), dots(originals[i]).map(([x, y]) => [x, y + 1]));
	});
	h.handlers.get("agent_end")!({}, h.ctx);
});
