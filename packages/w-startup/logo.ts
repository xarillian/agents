import { createAnimatedGradient } from "./gradient.ts";

const LOGO = ["████████████", "   ██  ██   ", "   ██  ██   ", "   ▒▒  ██   ", "       ██   "];
export const LOGO_WIDTH = Math.max(...LOGO.map((line) => line.length));

export function createAnimatedLogo(requestRender: () => void) {
	return createAnimatedGradient(LOGO, requestRender);
}
