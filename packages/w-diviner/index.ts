import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Editor, matchesKey, type TUI } from "@earendil-works/pi-tui";
import { buttonsOf, DivinerCard } from "./card.ts";
import { Diviner } from "./diviner.ts";
import { describeHistory } from "./history.ts";
import { MemoryFile } from "./memory.ts";
import { chosen, describe, registerModelCommand } from "./model.ts";

const WIDGET = "w-diviner";

export default function (pi: ExtensionAPI) {
	const memory = new MemoryFile(join(getAgentDir(), "w-diviner.json"));
	let diviner: Diviner | undefined;
	let stopListening: (() => void) | undefined;

	const stop = () => {
		stopListening?.();
		stopListening = undefined;
		diviner?.stop();
		diviner = undefined;
	};

	registerModelCommand(pi, memory);
	pi.registerCommand("diviner", {
		description: "Turn the diviner `on` or `off`; with no argument, show its state and recent readings",
		async handler(args, ctx) {
			const wanted = args.trim();
			if (wanted !== "" && wanted !== "on" && wanted !== "off") {
				ctx.ui.notify("Usage: /diviner [on|off]", "error");
				return;
			}
			const current = wanted === "" ? memory.read() : memory.update(saved => ({ ...saved, enabled: wanted === "on" }));
			if (!current.enabled) diviner?.stop();
			const status = `The diviner is ${current.enabled ? "on" : "off"}; it reads with ${describe(chosen(ctx, memory))}.`;
			ctx.ui.notify(wanted === "" ? `${status}\n${describeHistory(diviner?.history ?? [])}` : status, "info");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		stop();
		let card: DivinerCard | undefined;
		let screen: TUI | undefined;
		ctx.ui.setWidget(WIDGET, (tui, theme) => {
			screen = tui;
			return card = new DivinerCard(tui, theme, answer => diviner?.answer(answer));
		});
		diviner = new Diviner(ctx, memory, view => card?.show(view));
		stopListening = ctx.ui.onTerminalInput(data => answerByKey(screen, diviner, data));
	});

	pi.on("agent_start", () => diviner?.runStarted());
	pi.on("turn_start", event => diviner?.turnStarted(event.turnIndex));
	pi.on("turn_end", event => diviner?.turnEnded(event.toolResults.length > 0));
	pi.on("agent_settled", () => diviner?.runSettled());

	pi.on("input", event => {
		if (event.source === "interactive") diviner?.promptSubmitted();
	});

	pi.on("session_shutdown", stop);
}

/**
 * Digits answer the card only while the empty main editor has the keyboard,
 * so neither a prompt being typed nor an open picker or dialog loses a key.
 */
function answerByKey(screen: TUI | undefined, diviner: Diviner | undefined, data: string) {
	const view = diviner?.visible;
	const focused = screen?.getFocusedComponent();
	if (!diviner || !view || screen?.hasOverlay() || !(focused instanceof Editor) || focused.getText() !== "") return undefined;
	const button = buttonsOf(view).find(({ key }) => matchesKey(data, key));
	if (!button) return undefined;
	diviner.answer(button.answer);
	return { consume: true };
}
