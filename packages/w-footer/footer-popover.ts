import type { EventEmitter } from "node:events";
import { matchesKey, StdinBuffer, stripTerminalSequences, visibleWidth, type OverlayHandle, type OverlayOptions, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";

export type Badge = { row: number; start: number; end: number };

export function findBadge(lines: string[], pattern: RegExp): Badge | undefined {
	for (const [row, line] of lines.entries()) {
		const text = stripTerminalSequences(line);
		const match = pattern.exec(text);
		if (!match) continue;
		const start = visibleWidth(text.slice(0, match.index));
		return { row, start, end: start + visibleWidth(match[0]) };
	}
}

export class FooterPopover {
	private handle?: OverlayHandle;
	private pinned = false;
	private badge?: Badge;
	private width = 0;
	private closeTimer?: ReturnType<typeof setTimeout>;
	private unsubscribe?: () => void;
	private stopPointerObserver?: () => void;
	private options: OverlayOptions = { anchor: "bottom-left", nonCapturing: true, width: 48, maxHeight: "80%" };

	private tui: TUI;
	private renderCard: (width: number, pinned: boolean) => string[];
	private locate: (lines: string[]) => Badge | undefined;

	constructor(tui: TUI, renderCard: (width: number, pinned: boolean) => string[], locate: (lines: string[]) => Badge | undefined) {
		this.tui = tui;
		this.renderCard = renderCard;
		this.locate = locate;
		this.unsubscribe = tui.addInputListener((data) => {
			if (!this.handle) return;
			if (matchesKey(data, "escape")) {
				this.close();
				return { consume: true };
			}
			this.scheduleClose();
		});
	}

	layout(lines: string[], width: number): void {
		const resized = this.width !== width;
		this.width = width;
		this.badge = this.locate(lines);
		this.options.width = Math.min(48, Math.max(1, width));
		this.options.col = Math.min(this.badge?.start ?? width, Math.max(0, width - 48));
		this.options.margin = { bottom: lines.length + 1 };
		if (this.handle && !this.pinned && (resized || !this.badge)) this.close();
	}

	handleMouse(event: TuiMouseEvent) {
		if (!this.badge || event.y !== this.badge.row || event.x < this.badge.start || event.x >= this.badge.end) return;
		if (event.type !== "move" && event.button !== "left") return;
		this.cancelClose();
		if (event.type === "move") this.open(false);
		if (event.type === "click") this.togglePin();
		return { handled: true, render: event.type === "click" };
	}

	toggle(): void {
		if (this.handle && this.pinned) this.close();
		else this.open(true);
	}

	dispose(): void {
		this.close();
		this.unsubscribe?.();
		this.unsubscribe = undefined;
	}

	private open(pin: boolean): void {
		this.cancelClose();
		if (this.handle && !pin) return;
		if (pin) this.pinned = true;
		if (!this.handle) {
			if (this.tui.mode === "fullscreen") this.stopPointerObserver = observePointerInput(() => this.scheduleClose());
			this.handle = this.tui.showOverlay({
				invalidate() {},
				render: (width) => this.renderCard(width, this.pinned),
				handleMouse: (event) => {
					this.cancelClose();
					if (event.type === "click" && event.button === "left") this.togglePin();
					return { handled: true, render: event.type === "click" };
				},
			}, this.options);
		}
		this.tui.requestRender();
	}

	private togglePin(): void {
		if (!this.handle) this.open(true);
		else {
			this.pinned = !this.pinned;
			this.tui.requestRender();
		}
	}

	private close(): void {
		this.cancelClose();
		this.handle?.hide();
		this.handle = undefined;
		this.pinned = false;
		this.stopPointerObserver?.();
		this.stopPointerObserver = undefined;
	}

	private scheduleClose(): void {
		if (this.handle && !this.pinned && !this.closeTimer) this.closeTimer = setTimeout(() => this.close(), 120);
	}

	private cancelClose(): void {
		if (this.closeTimer) clearTimeout(this.closeTimer);
		this.closeTimer = undefined;
	}
}

export function observePointerInput(onPointer: () => void, input: Pick<EventEmitter, "prependListener" | "removeListener"> = process.stdin): () => void {
	const buffer = new StdinBuffer();
	buffer.on("data", (data) => {
		if (data.startsWith("\x1b[<") || data === "\x1b[O") onPointer();
	});
	const feed = (data: string | Buffer) => buffer.process(data);
	// Fullscreen routing consumes mouse input before TUI listeners. Observe first
	// so the destination component can cancel dismissal when it receives the event.
	input.prependListener("data", feed);
	return () => {
		input.removeListener("data", feed);
		buffer.destroy();
	};
}
