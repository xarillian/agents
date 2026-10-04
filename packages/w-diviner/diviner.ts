import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { askAside } from "./aside.ts";
import type { Answer, View } from "./card.ts";
import { withEntry, type Entry } from "./history.ts";
import { answered, ignored, isFamiliar, offered, skippedOne, understood, type Memory, type MemoryFile } from "./memory.ts";
import { chosen, resolve } from "./model.ts";
import { discussionDraft, readingPrompt } from "./prompts.ts";
import { readReply, type Reading } from "./reading.ts";

/** An offer nobody answers is cleared after this many of the person's prompts. */
const OFFER_SURVIVES = 2;
/** Long runs earn a reading every few model turns. */
const READ_EVERY = 6;
/** A finished run that used tools this many times gets one last reading of its final claims. */
const END_READING_AFTER = 4;

/**
 * One session's diviner: when to read the session, what the card shows, and
 * what each answer does. The card itself is drawn elsewhere.
 */
export class Diviner {
	private view: View | undefined;
	private run = 0;
	private toolTurns = 0;
	private offeredInRun: number | undefined;
	private inFlight: AbortController | undefined;
	private hasReportedFailure = false;
	private entries: Entry[] = [];
	private readonly ctx: ExtensionContext;
	private readonly memory: MemoryFile;
	private readonly show: (view: View | undefined) => void;

	constructor(ctx: ExtensionContext, memory: MemoryFile, show: (view: View | undefined) => void) {
		this.ctx = ctx;
		this.memory = memory;
		this.show = show;
	}

	get visible(): View | undefined {
		return this.view;
	}

	get history(): Entry[] {
		return this.entries;
	}

	runStarted(): void {
		this.run++;
	}

	turnStarted(index: number): void {
		if (index > 0 && index % READ_EVERY === 0) this.read(`turn ${index + 1}`);
	}

	turnEnded(usedTools: boolean): void {
		if (usedTools) this.toolTurns++;
	}

	/** Pi settles once retries and continuations are done, so tool turns are counted until then. */
	runSettled(): void {
		const isDue = this.toolTurns >= END_READING_AFTER;
		this.toolTurns = 0;
		if (isDue) this.read("end of run", { supersede: true });
	}

	/**
	 * Reads the session in the background; the main agent never waits on it.
	 * A superseding reading cancels one still running, since it sees more.
	 */
	private read(trigger: string, { supersede = false } = {}): void {
		if (this.view) return this.note(trigger, "skipped: a card is showing");
		if (this.offeredInRun === this.run) return this.note(trigger, "skipped: this run already had a card");
		if (this.inFlight && !supersede) return this.note(trigger, "skipped: another reading is running");
		const memory = this.memory.read();
		if (!memory.enabled) return;
		if (memory.readingsToSkip > 0) {
			this.memory.update(skippedOne);
			return this.note(trigger, `skipped: backing off after ignored cards (${memory.readingsToSkip - 1} more to skip)`);
		}

		const run = this.run;
		this.ask(trigger, readingPrompt(memory.offered, memory.known), reply => {
			const reading = reply === undefined ? undefined : readReply(reply);
			if (reading === undefined) return "unreadable reply";
			if (reading === "none") return "none";
			if (this.view) return `dropped, a card is showing: ${reading.line}`;
			if (isFamiliar(this.memory.read(), reading.line)) return `dropped, offered or known before: ${reading.line}`;
			this.memory.update(current => offered(current, reading.line));
			this.offeredInRun = run;
			this.change({ kind: "offer", reading, promptsSurvived: 0, disableArmed: false });
			return `offered: ${reading.line}`;
		});
	}

	/** An offer typed past twice is taken as unwanted, and the diviner backs off. */
	promptSubmitted(): void {
		if (this.view?.kind !== "offer") return;
		const promptsSurvived = this.view.promptsSurvived + 1;
		if (promptsSurvived < OFFER_SURVIVES) {
			this.change({ ...this.view, promptsSurvived, disableArmed: false });
			return;
		}
		this.memory.update(ignored);
		this.change(undefined);
	}

	answer(answer: Answer): void {
		const view = this.view;
		if (!view) return;
		const { reading } = view;

		switch (answer) {
			case "learn": return this.explain(reading);
			case "knew":
			case "understood": return this.settle(current => understood(current, reading.line));
			case "dismiss": return this.settle(current => current);
			case "disable": return view.kind === "offer" && !view.disableArmed
				? this.change({ ...view, disableArmed: true })
				: this.disable();
			case "discuss": return view.kind === "explained" ? this.discuss(reading) : undefined;
		}
	}

	stop(): void {
		this.inFlight?.abort();
		this.inFlight = undefined;
		this.change(undefined);
	}

	private explain(reading: Reading): void {
		this.memory.update(answered);
		this.change({ kind: "explained", reading });
	}

	private discuss(reading: Reading): void {
		if (this.ctx.ui.getEditorText().trim() !== "") {
			this.ctx.ui.notify("Your prompt box has text in it. Send or clear it, then press 2 again.", "warning");
			return;
		}
		this.ctx.ui.setEditorText(discussionDraft(reading));
		this.settle(current => understood(current, reading.line));
	}

	private disable(): void {
		this.memory.update(current => ({ ...answered(current), enabled: false }));
		this.change(undefined);
		this.ctx.ui.notify("The diviner is off. /diviner on brings it back.", "info");
	}

	private settle(learn: (memory: Memory) => Memory): void {
		this.memory.update(current => answered(learn(current)));
		this.change(undefined);
	}

	/** `decide` acts on the reply and says what came of it, for the history. */
	private ask(trigger: string, question: string, decide: (reply: string | undefined) => string): void {
		this.inFlight?.abort();
		const controller = new AbortController();
		this.inFlight = controller;
		const started = Date.now();
		const finish = (outcome: string, usage?: Usage) => this.note(trigger, outcome, Date.now() - started, usage);

		Promise.resolve()
			.then(() => askAside(this.ctx, resolve(this.ctx, chosen(this.ctx, this.memory)), question, controller.signal))
			.then(({ text, usage }) => {
				if (this.inFlight !== controller) return finish("cancelled", usage);
				this.inFlight = undefined;
				finish(decide(text), usage);
			}, error => {
				if (this.inFlight !== controller) return finish("cancelled");
				this.inFlight = undefined;
				this.reportFailure(error);
				decide(undefined);
				finish(`failed: ${failure(error)}`);
			});
	}

	/** Once per session: a broken diviner should be known, not repeated every few turns. */
	private reportFailure(error: unknown): void {
		if (this.hasReportedFailure) return;
		this.hasReportedFailure = true;
		this.ctx.ui.notify(`diviner: ${failure(error)}`, "warning");
	}

	private note(trigger: string, outcome: string, ms?: number, usage?: Usage): void {
		this.entries = withEntry(this.entries, { at: Date.now(), trigger, outcome, ...(ms !== undefined && { ms }), ...(usage && { usage }) });
	}

	private change(view: View | undefined): void {
		this.view = view;
		this.show(view);
	}
}

const failure = (error: unknown) => error instanceof Error ? error.message : "the reading failed";
