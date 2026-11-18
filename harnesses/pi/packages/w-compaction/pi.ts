import { findPackageJSON } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getPackageDir } from "@earendil-works/pi-coding-agent";

export async function loadConverters() {
	// The bundled CLI exposes virtual modules, not resolvable packages beside extensions.
	const manifest = findPackageJSON("@earendil-works/pi-ai", pathToFileURL(join(getPackageDir(), "package.json")));
	if (!manifest) throw new Error("Pi's installed message converters are unavailable");
	const root = pathToFileURL(manifest);
	const { convertResponsesMessages } = await import(new URL("./dist/api/openai-responses-shared.js", root).href);
	const { createGrammarToolInputProperties } = await import(new URL("./dist/api/constrained-sampling.js", root).href);
	const { getDeclaredTools } = await import(new URL("./dist/utils/transcript.js", root).href);
	return { convertResponsesMessages, createGrammarToolInputProperties, getDeclaredTools };
}
