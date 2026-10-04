import { piRoot } from "./host.ts";
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import type { Answer, View } from "../card.ts";

const host = await import(pathToFileURL(join(piRoot, "dist/modes/interactive/theme/theme.js")).href);
const { matchesKey, visibleWidth } = await import("@earendil-works/pi-tui");
const { buttonsOf, DivinerCard } = await import("../card.ts");
host.initTheme("dark", false);

const plain = (lines: string[]) => lines.map(line => line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ""));
const reading = { line: "The main agent skipped the flaky test instead of fixing it.", tag: "Heads up" as const, explanation: "**One test no longer runs**\n\nIt was marked skip." };
const offer: View = { kind: "offer", reading, promptsSurvived: 0, disableArmed: false };

function card() {
	const answers: Answer[] = [];
	const shown = new DivinerCard({ requestRender() {} } as any, host.theme, answer => answers.push(answer));
	return { shown, answers };
}

const press = (x: number, y: number) => ({ type: "press", button: "left", x, y }) as any;

test("with nothing to say the card takes no room", () => {
	assert.deepEqual(card().shown.render(80), []);
});

test("an offer names its tag and line, then the answers it takes", () => {
	const { shown } = card();
	shown.show(offer);
	assert.deepEqual(plain(shown.render(120)), [
		"",
		"✦ Heads up · The main agent skipped the flaky test instead of fixing it.",
		"  1 Learn more   2 Knew this already   4 Disable   0 Dismiss",
	]);
});

test("on a narrow terminal the answers wrap instead of running off the edge", () => {
	const { shown } = card();
	shown.show(offer);
	const lines = shown.render(30);
	assert.ok(lines.every(line => visibleWidth(line) <= 30));
	assert.ok(plain(lines).some(line => line.trim().startsWith("4 Disable")));
});

test("clicking an answer gives it, and clicking elsewhere gives nothing", () => {
	const { shown, answers } = card();
	shown.show(offer);
	const lines = plain(shown.render(120));
	const row = lines.length - 1;
	shown.handleMouse(press(lines[row].indexOf("Knew"), row));
	assert.equal(shown.handleMouse(press(0, 1)), undefined);
	assert.deepEqual(answers, ["knew"]);
});

test("an explained card shows the explainer between the line and its answers", () => {
	const { shown } = card();
	shown.show({ kind: "explained", reading });
	const text = plain(shown.render(80)).join("\n");
	assert.match(text, /One test no longer runs[\s\S]*It was marked skip\.[\s\S]*1 Understood   2 Chat in main session   0 Dismiss/);
});

test("a second press of Disable is asked for before it takes effect", () => {
	assert.equal(buttonsOf({ ...offer, disableArmed: true }).find(button => button.key === "4")?.label, "Press again to disable");
});

test("a bare digit from the terminal matches its answer's key", () => {
	assert.equal(matchesKey("1", "1"), true);
	assert.equal(matchesKey("0", "1"), false);
});
