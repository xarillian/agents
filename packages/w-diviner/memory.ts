import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface ModelReference { provider: string; id: string }

/** What the diviner carries from one session to the next. */
export interface Memory {
	enabled: boolean;
	/** Absent while the diviner forks whatever model the session runs. */
	defaultModel?: ModelReference;
	/** Readings already shown, so the same one is not offered twice. */
	offered: string[];
	/** Readings the person said they understood. */
	known: string[];
	ignoredInARow: number;
	readingsToSkip: number;
}

const KEPT = 50;
const FREE_IGNORES = 2;
const MOST_SKIPPED = 16;

export const FRESH: Memory = { enabled: true, offered: [], known: [], ignoredInARow: 0, readingsToSkip: 0 };

export const isFamiliar = (memory: Memory, line: string) =>
	[...memory.offered, ...memory.known].some(seen => sameLine(seen, line));

export const offered = (memory: Memory, line: string): Memory =>
	({ ...memory, offered: [...memory.offered, line].slice(-KEPT) });

export const understood = (memory: Memory, line: string): Memory =>
	memory.known.some(known => sameLine(known, line)) ? memory : { ...memory, known: [...memory.known, line].slice(-KEPT) };

/** Each card typed past in a row doubles the readings skipped, once the first two go free. */
export function ignored(memory: Memory): Memory {
	const ignoredInARow = memory.ignoredInARow + 1;
	const readingsToSkip = ignoredInARow <= FREE_IGNORES ? 0 : Math.min(MOST_SKIPPED, 2 ** (ignoredInARow - FREE_IGNORES - 1));
	return { ...memory, ignoredInARow, readingsToSkip };
}

export const answered = (memory: Memory): Memory => ({ ...memory, ignoredInARow: 0, readingsToSkip: 0 });

export const skippedOne = (memory: Memory): Memory => ({ ...memory, readingsToSkip: Math.max(0, memory.readingsToSkip - 1) });

const sameLine = (a: string, b: string) => key(a) === key(b);
const key = (line: string) => line.toLowerCase().replace(/\.$/, "");

/** Read fresh on every use: several pi processes share one memory file. */
export class MemoryFile {
	private readonly path: string;
	constructor(path: string) { this.path = path; }

	read(): Memory {
		let text: string;
		try { text = readFileSync(this.path, "utf8"); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...FRESH };
			throw error;
		}
		return parsed(JSON.parse(text), this.path);
	}

	update(change: (memory: Memory) => Memory): Memory {
		const memory = change(this.read());
		mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
		const temporary = `${this.path}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporary, `${JSON.stringify(memory, null, 2)}\n`, { mode: 0o600 });
			renameSync(temporary, this.path);
		} finally {
			rmSync(temporary, { force: true });
		}
		return memory;
	}
}

function parsed(value: unknown, path: string): Memory {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid diviner memory in ${path}.`);
	const stored = value as Record<string, unknown>;
	return {
		enabled: stored.enabled !== false,
		...(isReference(stored.defaultModel) && { defaultModel: { provider: stored.defaultModel.provider, id: stored.defaultModel.id } }),
		offered: lines(stored.offered),
		known: lines(stored.known),
		ignoredInARow: count(stored.ignoredInARow),
		readingsToSkip: count(stored.readingsToSkip),
	};
}

export function isReference(value: unknown): value is ModelReference {
	return !!value && typeof value === "object" && "provider" in value && "id" in value &&
		typeof value.provider === "string" && value.provider.trim() !== "" && typeof value.id === "string" && value.id.trim() !== "";
}

const lines = (value: unknown) => Array.isArray(value) ? value.filter((line): line is string => typeof line === "string") : [];
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
