import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.onTerminalInput((data) => {
			if (ctx.isIdle() || !matchesKey(data, "ctrl+c")) return;
			ctx.abort();
			return { consume: true };
		});
	});
}
