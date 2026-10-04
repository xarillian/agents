import { execFile } from "node:child_process";
import { platform } from "node:os";
import { getNativeClipboard } from "@earendil-works/pi-tui";

const READ_TIMEOUT_MS = 1000;

/**
 * pi reads the clipboard the same way but does not export it: Linux through
 * its clipboard tools, since the native helper is unavailable there, and
 * everywhere else through the native helper.
 */
export async function readClipboard(): Promise<string | undefined> {
	const text = platform() === "linux" ? await readLinuxClipboard() : await getNativeClipboard()?.getText().catch(() => undefined);
	return text?.trim() || undefined;
}

async function readLinuxClipboard(): Promise<string | undefined> {
	const tools: [string, string[]][] = [];
	if (process.env.WAYLAND_DISPLAY) tools.push(["wl-paste", ["--no-newline", "--type", "text"]]);
	if (process.env.DISPLAY) tools.push(["xclip", ["-selection", "clipboard", "-out"]], ["xsel", ["--clipboard", "--output"]]);

	for (const [tool, args] of tools) {
		const text = await run(tool, args);
		if (text !== undefined) return text;
	}
	return undefined;
}

const run = (tool: string, args: string[]) =>
	new Promise<string | undefined>((resolve) => {
		execFile(tool, args, { timeout: READ_TIMEOUT_MS, encoding: "utf8" }, (error, stdout) => resolve(error ? undefined : stdout));
	});
