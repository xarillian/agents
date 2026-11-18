import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Prompt {
	text: string;
	timestamp: number;
}

type MessageContent = string | { type: string; text?: string }[];

const USER_ROLE = '"role":"user"';

export async function readPrompts(sessionDirs: string[]): Promise<Prompt[]> {
	const files = (await Promise.all(sessionDirs.map(sessionFiles))).flat();
	const prompts = (await Promise.all(files.map(promptsIn))).flat();
	return newestUnique(prompts);
}

export async function projectDirs(sessionsRoot: string): Promise<string[]> {
	const entries = await listDir(sessionsRoot);
	return entries.filter((entry) => entry.isDirectory()).map((entry) => join(sessionsRoot, entry.name));
}

export function searchPrompts(prompts: Prompt[], query: string): Prompt[] {
	const needle = query.toLowerCase();
	return prompts.filter((prompt) => prompt.text.toLowerCase().includes(needle));
}

async function sessionFiles(sessionDir: string): Promise<string[]> {
	const entries = await listDir(sessionDir);
	return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => join(sessionDir, entry.name));
}

/** A project gets its session folder on its first prompt, so a missing folder means no history yet. */
async function listDir(dir: string) {
	try {
		return await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

/** Sessions run to hundreds of megabytes, so only lines that can hold a user prompt get parsed. */
async function promptsIn(file: string): Promise<Prompt[]> {
	const lines = (await readFile(file, "utf8")).split("\n");
	return lines.filter((line) => line.includes(USER_ROLE)).flatMap(promptOf);
}

function promptOf(line: string): Prompt[] {
	let entry;
	try {
		entry = JSON.parse(line);
	} catch {
		return [];
	}
	if (entry.type !== "message" || entry.message?.role !== "user") return [];

	const text = textOf(entry.message.content).trim();
	return text ? [{ text, timestamp: Date.parse(entry.timestamp) }] : [];
}

function textOf(content: MessageContent): string {
	if (typeof content === "string") return content;
	return content.flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join("\n");
}

function newestUnique(prompts: Prompt[]): Prompt[] {
	const newest = new Map<string, Prompt>();
	for (const prompt of prompts) {
		const seen = newest.get(prompt.text);
		if (!seen || seen.timestamp < prompt.timestamp) newest.set(prompt.text, prompt);
	}
	return [...newest.values()].sort((a, b) => b.timestamp - a.timestamp);
}
