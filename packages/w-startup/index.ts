import { basename, extname } from "node:path";
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
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { findDuplicateContextFiles } from "../w-deduplicate/index.ts";

const DEDUPLICATED_MARKER = " †";

type Theme = ExtensionContext["ui"]["theme"];

type StartupResources = {
	context: string[];
	skills: string[];
	prompts: string[];
	extensions: string[];
};

type CategoryRow = {
	glyph: string;
	label: string;
	value: string;
};

const PI_BLUE = "\x1b[38;2;80;180;230m";
const RESET_FOREGROUND = "\x1b[39m";
const LOGO = ["██████", "██  ██", "████  ██", "██    ██"];
const LOGO_WIDTH = Math.max(...LOGO.map((line) => line.length));
const METADATA_GAP = "   ";
const CATEGORY_INDENT = " ".repeat(LOGO_WIDTH + METADATA_GAP.length);

const buildCategoryLines = (rows: CategoryRow[], theme: Theme, width: number): string[] => {
	const prefixWidth = Math.max(...rows.map((row) => row.glyph.length + 1 + row.label.length)) + 2;
	const continuationIndent = CATEGORY_INDENT + " ".repeat(prefixWidth);
	const availableWidth = Math.max(1, width - CATEGORY_INDENT.length - prefixWidth);

	return rows.flatMap((row) => {
		const label = theme.fg("dim", `${row.glyph} ${row.label}`.padEnd(prefixWidth));
		const wrapped = wrapTextWithAnsi(theme.fg("dim", row.value), availableWidth);
		return wrapped.map((line, index) => (index === 0 ? `${CATEGORY_INDENT}${label}${line}` : `${continuationIndent}${line}`));
	});
};

const formatPath = (path: string) => path.replace(process.env.HOME ?? "", "~");

const commandNames = (commands: SlashCommandInfo[], source: SlashCommandInfo["source"]): string[] =>
	commands
		.filter((command) => command.source === source)
		.map((command) => command.name.replace(/^skill:/, ""))
		.sort((left, right) => left.localeCompare(right));

const skillNames = (commands: SlashCommandInfo[]): string[] =>
	commands
		.filter((command) => command.source === "skill")
		.map((command) => command.name.replace(/^skill:/, ""))
		.sort((left, right) => left.localeCompare(right));

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
		context: contextFiles.map((file) => formatPath(file.path) + (deduplicatedPaths.has(file.path) ? DEDUPLICATED_MARKER : "")),
		skills: skillNames(commands),
		prompts: commandNames(commands, "prompt").map((name) => `/${name}`),
		extensions: resolved.extensions
			.filter((extension) => extension.enabled)
			.map((extension) => extensionName(extension.path, extension.metadata))
			.sort((left, right) => left.localeCompare(right)),
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
							{ glyph: "⌁", label: "context", value: resources.context.join(", ") },
							{ glyph: "◆", label: "skills", value: resources.skills.join(", ") },
							{ glyph: "▪", label: "extensions", value: resources.extensions.join(", ") },
							{ glyph: "▸", label: "prompts", value: resources.prompts.join(", ") },
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
