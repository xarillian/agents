import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const piRoot = process.env.PI_PACKAGE_ROOT ?? resolve(dirname(process.execPath), "../lib/node_modules/@earendil-works/pi-coding-agent");
const host = pathToFileURL(join(piRoot, "dist/index.js")).href;
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-tui"].includes(specifier)) {
			if (specifier === "@earendil-works/pi-coding-agent") return { url: host, shortCircuit: true };
			return nextResolve(specifier, { ...context, parentURL: host });
		}
		return nextResolve(specifier, context);
	},
});
