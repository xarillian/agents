import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
	PathMetadata,
	SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import {
	DefaultPackageManager,
	getAgentDir,
	loadProjectContextFiles,
	SettingsManager,
	VERSION,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { findDuplicateContextFiles } from "../w-deduplicate/index.ts";

const DEDUPLICATED_MARKER = " †";

type Theme = ExtensionContext["ui"]["theme"];

type ResourceItem = {
	label: string;
	path: string;
};

type StartupResources = {
	context: ResourceItem[];
	skills: ResourceItem[];
	prompts: ResourceItem[];
	extensions: ResourceItem[];
};

type CategoryRow = {
	glyph: string;
	label: string;
	items: ResourceItem[];
};

const PI_BLUE = "\x1b[38;2;80;180;230m";
const RESET_FOREGROUND = "\x1b[39m";
const LOGO = ["████████", "██    ██", "██    ██", "██    ██"];
const LOGO_WIDTH = Math.max(...LOGO.map((line) => line.length));
const METADATA_GAP = "   ";
const CATEGORY_INDENT = " ".repeat(LOGO_WIDTH + METADATA_GAP.length);

const CHIP_INDENT = `${CATEGORY_INDENT}  `;

/** Wraps `label` in an OSC 8 hyperlink to `path`, falling back to plain text for an unresolvable path. */
const hyperlink = (label: string, path: string): string => {
	try {
		return `\x1b]8;;${pathToFileURL(path).href}\x1b\\${label}\x1b]8;;\x1b\\`;
	} catch {
		return label;
	}
};

/** Greedily packs pre-rendered chips onto lines by their visible width, since OSC 8 hyperlinks confuse wrapTextWithAnsi's word-boundary detection. */
const wrapChips = (chips: string[], width: number): string[] => {
	const lines: string[] = [];
	let current = "";
	for (const chip of chips) {
		const candidate = current ? `${current} ${chip}` : chip;
		if (current && visibleWidth(candidate) > width) {
			lines.push(current);
			current = chip;
		} else {
			current = candidate;
		}
	}
	if (current) lines.push(current);
	return lines;
};

const buildCategoryLines = (rows: CategoryRow[], theme: Theme, width: number): string[] => {
	const availableWidth = Math.max(1, width - CHIP_INDENT.length);

	return rows.flatMap((row) => {
		const heading = `${CATEGORY_INDENT}${theme.fg("accent", `${row.glyph} ${row.label}`)}`;
		const chips = row.items.map((item) => theme.fg("muted", hyperlink(`[${item.label}]`, item.path)));
		const wrapped = wrapChips(chips, availableWidth);
		return [heading, ...wrapped.map((line) => `${CHIP_INDENT}${line}`)];
	});
};

const formatPath = (path: string) => path.replace(process.env.HOME ?? "", "~");

const commandItems = (commands: SlashCommandInfo[], source: SlashCommandInfo["source"]): ResourceItem[] =>
	commands
		.filter((command) => command.source === source)
		.map((command) => ({ label: command.name.replace(/^skill:/, ""), path: command.sourceInfo.path }))
		.sort((left, right) => left.label.localeCompare(right.label));

const extensionName = (path: string, metadata: PathMetadata): string => {
	if (metadata.source.startsWith("npm:")) return metadata.source.slice(4);
	if (metadata.source.startsWith("git:")) return metadata.source.slice(4);
	if (metadata.origin === "package" && metadata.baseDir) return basename(metadata.baseDir);

	const filename = basename(path);
	if (filename === "index.ts" || filename === "index.js") return basename(path.slice(0, -filename.length - 1));
	return filename.slice(0, -extname(filename).length);
};

const discoverResources = async (pi: ExtensionAPI, ctx: ExtensionContext): Promise<StartupResources> => {
	const commands = pi.getCommands();
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(ctx.cwd, agentDir, { projectTrusted: ctx.isProjectTrusted() });
	const packageManager = new DefaultPackageManager({ cwd: ctx.cwd, agentDir, settingsManager });
	const resolved = await packageManager.resolve(async () => "skip");

	const contextFiles = loadProjectContextFiles({ cwd: ctx.cwd, agentDir });
	const deduplicatedPaths = findDuplicateContextFiles(contextFiles);

	return {
		context: contextFiles.map((file) => ({
			label: formatPath(file.path) + (deduplicatedPaths.has(file.path) ? DEDUPLICATED_MARKER : ""),
			path: file.path,
		})),
		skills: commandItems(commands, "skill"),
		prompts: commandItems(commands, "prompt").map((item) => ({ ...item, label: `/${item.label}` })),
		extensions: resolved.extensions
			.filter((extension) => extension.enabled)
			.map((extension) => ({ label: extensionName(extension.path, extension.metadata), path: extension.path }))
			.sort((left, right) => left.label.localeCompare(right.label)),
	};
};

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		const resources = await discoverResources(pi, ctx);
		ctx.ui.setHeader((_tui, theme) => ({
			render(width: number): string[] {
				const logo = (line: string) => `${PI_BLUE}${line}${RESET_FOREGROUND}`;
				const model = ctx.model?.id ?? "no model";
				const provider = ctx.model?.provider ?? "no provider";
				const metadata = [
					logo(LOGO[0].padEnd(LOGO_WIDTH)),
					`${logo(LOGO[1].padEnd(LOGO_WIDTH))}${METADATA_GAP}${theme.fg("text", `${theme.bold("pi")} v${VERSION}`)}`,
					`${logo(LOGO[2].padEnd(LOGO_WIDTH))}${METADATA_GAP}${theme.fg("text", model)}${theme.fg("muted", " · ")}${theme.fg("muted", provider)}`,
					`${logo(LOGO[3].padEnd(LOGO_WIDTH))}${METADATA_GAP}${theme.fg("muted", formatPath(ctx.cwd))}`,
				].map((line) => truncateToWidth(line, width));

				return [
					...metadata,
					"",
					"",
					...buildCategoryLines(
						[
							{ glyph: "⌁", label: "context", items: resources.context },
							{ glyph: "◆", label: "skills", items: resources.skills },
							{ glyph: "▪", label: "extensions", items: resources.extensions },
							{ glyph: "▸", label: "prompts", items: resources.prompts },
						],
						theme,
						width,
					),
					"",
				];
			},
			invalidate() {},
		}));
	});
}
