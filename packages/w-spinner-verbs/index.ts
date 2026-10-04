import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createAnimatedGradient } from "../w-startup/gradient.ts";
import { SPINNER_VERBS } from "./verbs.ts";

const LOWERED_SPINNER_FRAMES = ["⠖", "⠲", "⢲", "⢰", "⣰", "⣠", "⣄", "⣆", "⡆", "⡖"];

function pickVerb(): string {
	return SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)];
}

export default function (pi: ExtensionAPI) {
	let animation: ReturnType<typeof createAnimatedGradient> | undefined;
	let activeContext: ExtensionContext | undefined;

	const stop = () => {
		animation?.dispose();
		animation = undefined;
		activeContext?.ui.setWorkingMessage();
		activeContext?.ui.setWorkingIndicator();
		activeContext = undefined;
	};

	pi.on("agent_start", (_event, ctx) => {
		stop();
		if (ctx.mode !== "tui") return;
		activeContext = ctx;
		ctx.ui.setWorkingIndicator({
			frames: LOWERED_SPINNER_FRAMES.map((frame) => ctx.ui.theme.fg("accent", frame)),
			intervalMs: 80,
		});
		const paint = () => ctx.ui.setWorkingMessage(animation!.render()[0]);
		animation = createAnimatedGradient([`${pickVerb()}…`], paint);
		paint();
	});
	pi.on("agent_end", stop);
	pi.on("session_shutdown", stop);
}
