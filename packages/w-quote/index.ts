import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { readClipboard } from "./clipboard.ts";
import { withEllipses } from "./ellipsis.ts";
import { QuoteEditor } from "./editor.ts";
import { QuoteOffer } from "./offer.ts";
import { appendQuote } from "./quote.ts";
import { recentReplies } from "./replies.ts";
import { isOnScreen } from "./screen.ts";
import { drawThread, type Paint } from "./thread.ts";

const WIDGET = "w-quote";
const CHECK_MS = 300;

/** The fullscreen viewport's selection check; the inline TUI has no transcript selection. */
type SelectingTUI = TUI & { hasActiveSelection(): boolean; getScreenLines(): string[] };

export default function (pi: ExtensionAPI) {
	let stop: (() => void) | undefined;
	let paint: Paint = { border: plain, label: plain, quote: plain, reply: plain };

	pi.registerMarkdownTransformer((markdown, context) =>
		context.messageType === "user" ? drawThread(markdown, context.availableWidth, paint) : markdown,
	);

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		stop?.();
		stop = startQuoting(ctx);
		paint = themed(() => ctx.ui.theme);
	});

	pi.on("session_shutdown", () => {
		stop?.();
		stop = undefined;
	});
}

/**
 * pi says whether anything is highlighted but not what. Copy-on-select puts the
 * text on the clipboard, so the clipboard is offered while a highlight is
 * active, and only when that text is on screen: something copied earlier, still
 * on the clipboard mid-drag, is never shown.
 */
function startQuoting(ctx: ExtensionContext): () => void {
	let offer: QuoteOffer | undefined;
	let tui: SelectingTUI | undefined;

	ctx.ui.setWidget(WIDGET, (mounted, theme) => {
		tui = isSelecting(mounted) ? mounted : undefined;
		offer = new QuoteOffer(mounted, theme, (selection) => quoteIntoEditor(ctx, selection));
		return offer;
	});

	const watch = async () => {
		if (!tui?.hasActiveSelection()) return offer?.offer(undefined);

		const text = await readClipboard();
		offer?.offer(text && isOnScreen(text, tui.getScreenLines()) ? text : undefined);
	};

	const timer = setInterval(() => void watch(), CHECK_MS);
	ctx.ui.setEditorComponent((mounted, editorTheme, keybindings) => new QuoteEditor(mounted, editorTheme, keybindings, () => ctx.ui.theme));

	return () => {
		clearInterval(timer);
		ctx.ui.setWidget(WIDGET, undefined);
		ctx.ui.setEditorComponent(undefined);
	};
}

function quoteIntoEditor(ctx: ExtensionContext, selection: string): void {
	const quote = withEllipses(selection, recentReplies(ctx.sessionManager.getBranch()));
	const draft = ctx.ui.getEditorText();
	ctx.ui.setEditorText(draft + appendQuote(draft, quote));
}

const isSelecting = (tui: TUI): tui is SelectingTUI =>
	typeof (tui as Partial<SelectingTUI>).hasActiveSelection === "function";

const plain = (text: string) => text;

/** The thread's colours, read from the theme each time so a theme change follows. */
const themed = (theme: () => ExtensionContext["ui"]["theme"]): Paint => ({
	border: (text) => theme().fg("borderMuted", text),
	label: (text) => theme().fg("accent", text),
	quote: (text) => theme().italic(text),
	reply: (text) => theme().fg("mdListBullet", text),
});
