import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { realpathSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import type { FooterState } from "../presentation.ts";
import { sessionUsage } from "../usage.ts";

const piPath = realpathSync(execFileSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim());
const host = createRequire(piPath);
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "@earendil-works/pi-tui") {
			return { url: pathToFileURL(host.resolve(specifier)).href, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
});
const { renderFooter } = await import("../presentation.ts");
const { default: installFooter } = await import("../index.ts");
const { cacheHistory, renderCacheHistory } = await import("../cache-history.ts");
const { FooterPopover, findBadge, observePointerInput } = await import("../footer-popover.ts");
const { USAGE_REQUEST, USAGE_UPDATE } = await import("../../w-usage/footer.ts");
const { visibleWidth, rgbColor } = await import("@earendil-works/pi-tui");
const plain = {
	fg: (_color: string, value: string) => value,
	style: (value: string) => value,
	colors: { accent: rgbColor(80, 180, 220), dim: rgbColor(100, 100, 100) },
};
const state: FooterState = {
	cwd: "/home/me/.agents", home: "/home/me", branch: "main", model: "gpt-6-astra", thinking: "high",
	contextPercent: 42, cost: 0.18, subscription: false, statuses: new Map(),
};
const totals = { input: 12400, output: 2100, cacheRead: 10000, cacheWrite: 2000 };

test("one row: the figures on the left, the place and model right-aligned", () => {
	const lines = renderFooter(state, 100, plain);
	assert.equal(lines.length, 1);
	assert.match(lines[0], /^▰▰▰▰▱▱▱▱▱▱ 42%  \$0\.18 +~\/\.agents · main · gpt-6-astra · high$/);
	assert.equal(visibleWidth(lines[0]), 100);
});

test("narrowing gives up the place, then the meter, then the cache, keeping context and cost", () => {
	const cached = { ...state, cacheHit: 80 };
	assert.equal(renderFooter(cached, 30, plain)[0], "▰▰▰▰▱▱▱▱▱▱ 42%  $0.18  ◈ 80%");
	assert.equal(renderFooter(cached, 20, plain)[0], "42%  $0.18  ◈ 80%");
	assert.equal(renderFooter(cached, 12, plain)[0], "42%  $0.18");
	assert.equal(renderFooter(cached, 5, plain)[0], "42%");
});

test("the location gives way before the model, and the provider before the location", () => {
	const named = { ...state, provider: "openai-codex", sessionName: "terminal-token-usage" };
	assert.match(renderFooter(named, 100, plain)[0], /~\/\.agents · main · terminal-token-usage · openai-codex\/gpt-6-astra · high$/);
	const tight = renderFooter(named, 70, plain)[0];
	assert.match(tight, /~\/\.agents · main · te.* · gpt-6-astra · high$/);
	assert.doesNotMatch(tight, /terminal-token-usage|openai-codex/);
	assert.match(renderFooter(named, 46, plain)[0], /\$0\.18 +gpt-6-astra · high$/);
});

test("unknown context after compaction is not presented as an empty measured context", () => {
	const line = renderFooter({ ...state, contextPercent: null }, 100, plain)[0];
	assert.match(line, /^\?{10} \?  /);
	assert.doesNotMatch(line, /0%|▱/);
});

test("capacity warnings survive compact layouts and over-capacity meters stay bounded", () => {
	const colors: string[] = [];
	const theme = { fg: (color: string, value: string) => { if (value.endsWith("%")) colors.push(color); return value; } };
	for (const [percent, expected] of [[70, "accent"], [71, "warning"], [90, "warning"], [91, "error"], [125, "error"]] as const) {
		colors.length = 0;
		const current = { ...state, contextPercent: percent };
		assert.match(renderFooter(current, 12, theme)[0], new RegExp(`${percent}%`));
		assert.deepEqual(colors, [expected]);
		assert.equal((renderFooter(current, 100, plain)[0].match(/[▰▱]/g) ?? []).length, 10);
	}
});

test("extension status colours and deterministic ordering survive the replacement footer", () => {
	const statuses = new Map([["usage", "\u001b[33mCodex 32%\u001b[0m"], ["agents", "2 working\n1 waiting"]]);
	const lines = renderFooter({ ...state, statuses }, 80, plain);
	assert.equal(lines[1], "2 working 1 waiting  \u001b[33mCodex 32%\u001b[0m");
});

test("resizing with wide Unicode and ANSI colours never overflows a terminal row", () => {
	const theme = { fg: (_color: string, value: string) => `\u001b[36m${value}\u001b[0m` };
	const unicode = { ...state, cwd: "/项目/🦊/é", branch: "分支", model: "模型🦊".repeat(10), statuses: new Map([["usage", "状态🦊".repeat(30)]]) };
	for (let width = 0; width <= 180; width++) {
		for (const line of renderFooter(unicode, width, theme)) assert.ok(visibleWidth(line) <= width, `width ${width}: ${line}`);
	}
});

test("home abbreviation respects directory boundaries and names stay on one line", () => {
	const lines = renderFooter({ ...state, cwd: "/home/medical", branch: "main\nbranch", sessionName: "a\tb" }, 100, plain);
	assert.match(lines[0], /\/home\/medical · main branch · a b · gpt-6-astra/);
});

test("subscription cost and the cache reuse rate sit on the row, and token totals stay in the graph", () => {
	const line = renderFooter({ ...state, subscription: true, cacheHit: 80 }, 120, plain)[0];
	assert.match(line, /\$0\.18 \(sub\)  ◈ 80%/);
	assert.doesNotMatch(line, /↑|↓|read|stored/);
});

test("a measured cache miss is visible but missing telemetry is not invented", () => {
	assert.match(renderFooter({ ...state, cacheHit: 0 }, 120, plain)[0], /◈ 0%/);
	assert.doesNotMatch(renderFooter(state, 120, plain)[0], /◈/);
});

test("the cache badge keeps its glyph quiet without treating misses as errors", () => {
	const styled: [string, string][] = [];
	const theme = { fg: (color: string, value: string) => { styled.push([color, value]); return value; } };
	renderFooter({ ...state, cacheHit: 0 }, 120, theme);
	assert.ok(styled.some(([color, value]) => color === "muted" && value === "◈ "));
	assert.ok(styled.some(([color, value]) => color === "accent" && value === "0%"));
	assert.ok(styled.every(([color]) => color !== "warning" && color !== "error"));
});

test("the extension ignores non-terminal sessions", () => {
	let start: Function = () => assert.fail("session_start was not registered");
	installFooter({ events: { on() {} }, registerCommand() {}, on: (event, handler) => { if (event === "session_start") start = handler; } } as any);
	for (const mode of ["rpc", "json", "print"]) start({}, { mode, ui: { setFooter: () => assert.fail("terminal UI installed outside TUI mode") } });
});

test("live rendering refreshes usage on session changes and disposes its branch watcher", () => {
	let start: Function = () => assert.fail("session_start was not registered");
	installFooter({ events: { on() {}, emit() {} }, registerCommand() {}, on: (event, handler) => { if (event === "session_start") start = handler; }, getThinkingLevel: () => "high" } as any);
	let scans = 0;
	let cost = 1;
	let branchHistory = [response(20, 80)];
	let sessionId = "first";
	let disposed = false;
	let renderRequests = 0;
	let branchChanged: Function = () => assert.fail("branch watcher not registered");
	let component: { render(width: number): string[]; dispose(): void };
	const ctx = {
		mode: "tui", model: { id: "model-one", provider: "example", contextWindow: 200000, reasoning: true },
		getContextUsage: () => ({ percent: 42, contextWindow: 200000 }),
		modelRegistry: { isUsingOAuth: () => false },
		sessionManager: {
			getSessionId: () => sessionId, getEntryCount: () => 1, getLeafId: () => "leaf",
			getCwd: () => "/project", getSessionName: () => undefined, getBranch: () => branchHistory,
			getEntries: () => {
				scans++;
				return [{ type: "usage", usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: { total: cost } } }];
			},
		},
		ui: { setFooter: (factory: Function) => {
			component = factory({ requestRender: () => renderRequests++, addInputListener: () => () => {} }, plain, {
				onBranchChange: (handler: Function) => { branchChanged = handler; return () => { disposed = true; }; },
				getGitBranch: () => "main", getAvailableProviderCount: () => 1, getExtensionStatuses: () => new Map(),
			});
		} },
	};
	start({}, ctx);
	assert.match(component!.render(100)[0], /\$1\.00/);
	assert.match(component!.render(100)[0], /◈ 80%/);
	assert.equal(scans, 1);
	ctx.model.id = "model-two";
	assert.match(component!.render(100)[0], /model-two/);
	sessionId = "second";
	branchHistory = [response(100, 0)];
	cost = 2;
	assert.match(component!.render(100)[0], /\$2\.00/);
	assert.match(component!.render(100)[0], /◈ 0%/);
	assert.equal(scans, 2);
	branchChanged();
	assert.equal(renderRequests, 1);
	component!.dispose();
	assert.equal(disposed, true);
});

test("usage status opens the live provider card, including clipped statuses and keyboard access", async () => {
	const bus = new EventEmitter();
	const handlers = new Map<string, Function>();
	const commands = new Map<string, any>();
	const events = { on: (name: string, fn: Function) => bus.on(name, fn as any), emit: (name: string, data: unknown) => bus.emit(name, data) };
	installFooter({ events, registerCommand: (name, command) => commands.set(name, command), on: (name, fn) => handlers.set(name, fn) } as any);
	const now = Date.now();
	let result: any = { provider: "codex", name: "Codex", configured: true, fetchedAt: now, windows: [
		{ label: "session (5h)", remaining: 73, resetAt: now + 3_600_000 },
		{ label: "weekly (7d)", remaining: 42 },
	] };
	bus.on(USAGE_REQUEST, () => bus.emit(USAGE_UPDATE, result));
	let component: any;
	let panel: any;
	let hidden = 0;
	let input: Function;
	const statuses = new Map([["agents", "🦊 working"], ["usage", "\u001b[33m● codex 73% ↻ 1h 42%\u001b[0m"], ["z", "other"]]);
	const ctx: any = {
		mode: "tui", model: { id: "test", provider: "openai-codex" },
		getContextUsage: () => undefined, modelRegistry: { isUsingOAuth: () => true },
		sessionManager: {
			getSessionId: () => "test", getLeafId: () => "leaf", getEntries: () => [], getBranch: () => [],
			getCwd: () => "/project", getSessionName: () => undefined,
		},
		ui: { setFooter: (factory: Function) => {
			component = factory({
				addInputListener: (fn: Function) => { input = fn; return () => {}; }, requestRender() {},
				showOverlay: (value: any) => { panel = value; return { hide: () => hidden++ }; },
			}, plain, {
				onBranchChange: () => () => {}, getGitBranch: () => undefined,
				getAvailableProviderCount: () => 1, getExtensionStatuses: () => statuses,
			});
		} },
	};
	handlers.get("session_start")!({}, ctx);
	const lines = component.render(100);
	const start = visibleWidth("🦊 working  ");
	assert.equal(component.handleMouse({ type: "move", button: "none", x: start, y: 0 }), undefined);
	assert.equal(component.handleMouse({ type: "move", button: "none", x: start, y: 1 }).handled, true);
	assert.match(panel.render(48).join("\n"), /session \(5h\)\s+73% left ↻ 1h/);
	assert.match(panel.render(48).join("\n"), /weekly \(7d\)\s+42% left/);
	assert.equal(component.handleMouse({ type: "move", button: "none", x: visibleWidth(lines[1]) - 1, y: 1 }), undefined);
	result = { ...result, unavailable: "request failed" };
	bus.emit(USAGE_UPDATE, result);
	assert.match(panel.render(48).join("\n"), /Unavailable \(request failed\)/);
	assert.doesNotMatch(panel.render(48).join("\n"), /73%/);
	input!("\u001b");
	component.render(start + 12);
	assert.equal(component.handleMouse({ type: "move", button: "none", x: start, y: 1 }).handled, true);
	input!("\u001b");
	await commands.get("usage-popup").handler("", ctx);
	assert.match(panel.render(48).join("\n"), /pinned/);
	ctx.model.provider = "anthropic";
	assert.match(panel.render(48).join("\n"), /Usage unavailable/);
	assert.doesNotMatch(panel.render(48).join("\n"), /Codex/);
	for (let width = 0; width < 60; width++) {
		for (const line of panel.render(width)) assert.ok(visibleWidth(line) <= width);
	}
	component.dispose();
	assert.equal(hidden, 3);
});

test("session totals include tools, compaction, branch summaries, and standalone usage", () => {
	const usage = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cost: { total: 0.1 } };
	const entries = [
		{ type: "message", message: { role: "assistant", usage } },
		{ type: "message", message: { role: "toolResult", usage } },
		{ type: "compaction", usage },
		{ type: "branch_summary", usage },
		{ type: "usage", usage },
		{ type: "message", message: { role: "user", content: "hello" } },
	];
	assert.deepEqual(sessionUsage(entries as Parameters<typeof sessionUsage>[0]), {
		input: 5, output: 10, cacheRead: 15, cacheWrite: 20, cost: 0.5,
	});
});

function response(input: number, cacheRead: number, cacheWrite = 0) {
	return { type: "message", message: { role: "assistant", usage: { input, cacheRead, cacheWrite } } } as any;
}

test("history records request reuse including misses, not tool usage or missing telemetry", () => {
	assert.deepEqual(cacheHistory([
		response(20, 80), response(100, 0), response(0, 0), response(0, 50, 50),
		{ type: "usage", usage: { input: 0, cacheRead: 100, cacheWrite: 0 } } as any,
		{ type: "message", message: { role: "toolResult", usage: { input: 0, cacheRead: 100, cacheWrite: 0 } } } as any,
	]), [80, 0, 50]);
	assert.deepEqual(cacheHistory(Array.from({ length: 100 }, (_, i) => response(100 - i, i))).map((value) => Math.round(value)), Array.from({ length: 64 }, (_, i) => i + 36));
});

test("the graph distinguishes zero reuse, full reuse, and an empty history", () => {
	const lines = renderCacheHistory({ history: [0, 100], totals }, 48, false, plain);
	assert.ok(lines.some((line) => line.includes("100% │ █")));
	assert.ok(lines.some((line) => line.includes("0% │·█")));
	assert.ok(lines.some((line) => line.includes("100.0% latest · 2 requests")));
	assert.equal(lines.length, 9);
	assert.doesNotMatch(lines.join("\n"), /Recent requests/);
	assert.doesNotMatch(lines.join("\n"), /preview|pinned|Click|Esc|oldest|one bar|Active branch|shown/);
	assert.match(renderCacheHistory({ history: [80], totals }, 48, true, plain).join("\n"), /80\.0% latest · 1 request\s/);
	assert.match(renderCacheHistory({ history: [], totals }, 48, true, plain).join("\n"), /No history yet/);
	for (let width = 0; width < 90; width++) {
		for (const line of renderCacheHistory({ history: [0, 25, 50, 75, 100], totals }, width, true, plain)) assert.ok(visibleWidth(line) <= width);
	}
});

test("under the graph, the card totals the tokens spent and what the cache read and stored", () => {
	const lines = renderCacheHistory({ history: [80], totals }, 48, false, plain);
	assert.match(lines.at(-2)!, /↑12k in  ↓2\.1k out  10k read  2\.0k stored/);
});

test("request bars sit flush and keep the newest samples that fit", () => {
	const history = [0, ...Array(37).fill(100), 50];
	const lines = renderCacheHistory({ history, totals }, 48, false, plain);
	assert.equal((lines[2].match(/█/g) ?? []).length, 37);
	assert.match(lines[2], /│███/);
	assert.match(lines[6], /50\.0% latest · 38 requests/);
	assert.doesNotMatch(lines[5], /·/);
});

test("adjacent bars alternate shades without adding columns or changing height", () => {
	const colors: unknown[] = [];
	const lines = renderCacheHistory({ history: [100, 100, 100], totals }, 48, false, {
		...plain,
		style: (value, options) => { colors.push(options.fg); return value; },
	});
	assert.deepEqual(colors[0], plain.colors.accent);
	assert.notDeepEqual(colors[0], colors[1]);
	assert.deepEqual(colors[0], colors[2]);
	assert.deepEqual(colors.slice(0, 3), colors.slice(3, 6));
	assert.match(lines[2], /│███/);
});

function popupHarness() {
	let listener: (data: string) => any;
	let panel: any;
	let options: any;
	let hidden = 0;
	let unsubscribed = false;
	let opened = 0;
	const popup = new FooterPopover({
		addInputListener: (fn) => { listener = fn; return () => { unsubscribed = true; }; },
		requestRender() {},
		showOverlay: (component, config) => {
			panel = component; options = config; opened++;
			return { hide: () => { hidden++; } };
		},
	} as any, (width, pinned) => renderCacheHistory({ history: [20, 80], totals }, width, pinned, plain),
		(lines) => findBadge(lines, /◈ \S+/));
	popup.layout(["42%  ◈ 80%    gpt-6-astra"], 100);
	const mouse = (x = 6, type = "move", y = 0) => ({ type, button: type === "move" ? "none" : "left", x, y }) as any;
	return { popup, mouse, input: (data: string) => listener!(data), panel: () => panel, options: () => options, hidden: () => hidden, opened: () => opened, unsubscribed: () => unsubscribed };
}

test("hover opens without taking focus, and leaving closes after a short grace period", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const h = popupHarness();
	assert.equal(h.popup.handleMouse(h.mouse(0)), undefined);
	h.popup.handleMouse(h.mouse());
	assert.equal(h.opened(), 1);
	assert.equal(h.options().nonCapturing, true);
	assert.match(h.panel().render(48).join("\n"), /Cache reuse/);
	assert.doesNotMatch(h.panel().render(48).join("\n"), /pinned|preview/);
	h.input("mouse input outside the footer");
	t.mock.timers.tick(80);
	h.input("still moving outside the footer");
	t.mock.timers.tick(41);
	assert.equal(h.hidden(), 1);
	h.popup.dispose();
	assert.equal(h.unsubscribed(), true);
});

test("moving from the badge into the popup keeps the preview open", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const h = popupHarness();
	h.popup.handleMouse(h.mouse());
	h.input("mouse input");
	h.panel().handleMouse(h.mouse());
	t.mock.timers.tick(121);
	assert.equal(h.hidden(), 0);
	h.popup.dispose();
});

test("click pins and unpins; escape closes without sending escape to the editor", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const h = popupHarness();
	h.popup.handleMouse(h.mouse(6, "click"));
	assert.match(h.panel().render(48).join("\n"), /pinned/);
	h.input("typing while pinned");
	t.mock.timers.tick(121);
	assert.equal(h.hidden(), 0);
	h.popup.handleMouse(h.mouse(6, "click"));
	assert.doesNotMatch(h.panel().render(48).join("\n"), /pinned|preview/);
	assert.deepEqual(h.input("\u001b"), { consume: true });
	assert.equal(h.hidden(), 1);
	h.popup.dispose();
});

test("keyboard toggle works without a badge, while resize dismisses only unpinned previews", () => {
	const h = popupHarness();
	h.popup.handleMouse(h.mouse());
	h.popup.layout(["42%"], 30);
	assert.equal(h.hidden(), 1);
	h.popup.toggle();
	assert.equal(h.opened(), 2);
	assert.match(h.panel().render(30).join("\n"), /pinned/);
	h.popup.layout(["42%"], 20);
	assert.equal(h.hidden(), 1);
	h.popup.toggle();
	assert.equal(h.hidden(), 2);
	h.popup.dispose();
});

test("the pointer observer runs before routing, buffers split packets, and leaves stdin unchanged", () => {
	const input = new EventEmitter();
	const order: string[] = [];
	const received: string[] = [];
	input.on("data", (data) => { received.push(data); order.push("route"); });
	const stop = observePointerInput(() => order.push("pointer"), input);
	input.emit("data", "\u001b[<35;");
	input.emit("data", "6;2M");
	assert.deepEqual(order, ["route", "pointer", "route"]);
	assert.deepEqual(received, ["\u001b[<35;", "6;2M"]);
	input.emit("data", "text");
	assert.equal(order.filter((event) => event === "pointer").length, 1);
	input.emit("data", "\u001b[O");
	assert.equal(order.filter((event) => event === "pointer").length, 2);
	stop();
	assert.equal(input.listenerCount("data"), 1);
});

test("disposing an open preview removes the overlay, listener, and pending timer", (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const h = popupHarness();
	h.popup.handleMouse(h.mouse());
	h.input("mouse input");
	h.popup.dispose();
	assert.equal(h.hidden(), 1);
	assert.equal(h.unsubscribed(), true);
	t.mock.timers.tick(121);
	assert.equal(h.hidden(), 1);
});
