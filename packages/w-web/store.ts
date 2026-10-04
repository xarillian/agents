import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanText, publicUrl, type Page, type Provider, type Source, type SourceLine } from "./contracts.ts";

interface StoredPage extends Page { fetchedAt: number }
interface RecordFile extends Source { pages: Partial<Record<Provider, StoredPage>> }
const PAGE_TTL_MS = 60 * 60 * 1000;

export class SourceStore {
	private directory: string;
	constructor(root: string, session: string) {
		this.directory = join(root, createHash("sha256").update(session).digest("hex"));
	}

	source(input: string, title?: string): Source {
		if (/^s_[a-f0-9]{20}$/.test(input)) {
			const { id, url, title } = this.load(input);
			return { id, url, title };
		}
		const url = publicUrl(input);
		const id = `s_${createHash("sha256").update(url).digest("hex").slice(0, 20)}`;
		if (existsSync(this.path(id))) return this.source(id);
		const source: RecordFile = { id, url, title: cleanText(title ?? url).replace(/\s+/g, " ").slice(0, 200), pages: {} };
		this.save(source);
		return { id, url, title: source.title };
	}

	page(source: Source, provider: Provider): StoredPage | undefined {
		const page = this.load(source.id).pages[provider];
		return page && Date.now() - page.fetchedAt < PAGE_TTL_MS ? page : undefined;
	}

	putPage(source: Source, provider: Provider, page: Page): Page {
		const record = this.load(source.id);
		const old = this.page(source, provider);
		const lines = old?.totalLines === page.totalLines ? { ...old.lines, ...page.lines } : page.lines;
		record.pages[provider] = { ...page, lines, fetchedAt: old?.fetchedAt ?? Date.now() };
		this.save(record);
		return record.pages[provider]!;
	}

	private path(id: string) {
		if (!/^s_[a-f0-9]{20}$/.test(id)) throw new Error("Invalid w-web source reference.");
		return join(this.directory, `${id}.json`);
	}

	private load(id: string): RecordFile {
		const path = this.path(id);
		if (!existsSync(path)) throw new Error(`Unknown source ${id} in this session. Search again or supply its URL.`);
		return JSON.parse(readFileSync(path, "utf8"));
	}

	private save(record: RecordFile) {
		mkdirSync(this.directory, { recursive: true, mode: 0o700 });
		const path = this.path(record.id);
		const temporary = `${path}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
			renameSync(temporary, path);
		} finally {
			rmSync(temporary, { force: true });
		}
	}
}

export function readPage(page: Page, line = 0, column = 0, limit = 80, budget = 6000) {
	if (line >= page.totalLines) return { text: "End of retrieved document.", lines: [] as SourceLine[], next: undefined };
	const output: string[] = [];
	const lines: SourceLine[] = [];
	let remaining = budget;
	let current = line;
	let position = column;
	while (current < page.totalLines && current < line + limit && remaining > 80) {
		const text = page.lines[current];
		if (text === undefined) break;
		if (position > text.length) throw new Error(`Column exceeds the length of line ${current}.`);
		const prefix = `L${current}${position ? `:${position}` : ""}: `;
		const part = text.slice(position, position + remaining - prefix.length - 1);
		output.push(prefix + part);
		lines.push({ line: current, column: position, text: part });
		remaining -= prefix.length + part.length + 1;
		position += part.length;
		if (position < text.length) break;
		current++;
		position = 0;
	}
	return {
		text: output.join("\n"),
		lines,
		next: current < page.totalLines ? { line: current, column: position } : undefined,
	};
}

export function findPassages(page: Page, pattern: string, startLine = 0) {
	const needle = pattern.toLowerCase();
	const matches = Object.entries(page.lines).filter(([line, text]) => Number(line) >= startLine && text.toLowerCase().includes(needle));
	const selected = matches.slice(0, 8);
	const windows = new Set<number>();
	for (const [line] of selected) {
		for (let n = Math.max(0, Number(line) - 1); n <= Number(line) + 1; n++) if (page.lines[n] !== undefined) windows.add(n);
	}
	const lines = [...windows].sort((a, b) => a - b).map(line => {
		const content = page.lines[line];
		const index = content.toLowerCase().indexOf(needle);
		const start = Math.max(0, index - 120);
		return { line, column: start, text: content.slice(start, start + 220) };
	});
	const text = lines.map(({ line, column, text }) =>
		`L${line}${column ? `:${column}` : ""}: ${column ? "…" : ""}${text}${page.lines[line].length > column + text.length ? "…" : ""}`,
	).join("\n");
	return { text, lines, count: selected.length, nextLine: matches.length > selected.length ? Number(selected.at(-1)![0]) + 1 : undefined };
}
