import { getCapabilities, visibleWidth } from "@earendil-works/pi-tui";

const GRADIENT_PERIOD_MS = 6000;
const SHINE_PERIOD_MS = 4000;
const ANIMATION_TICK_MS = 33;
const SHINE_HALF_WIDTH = 0.18;
const GRADIENT_STOPS = [[248, 79, 204], [147, 98, 244], [0, 219, 228]] as const;
const GRADIENT_RAMP_256 = [206, 170, 134, 99, 69, 74, 44];

export function createAnimatedGradient(lines: readonly string[], requestRender: () => void) {
	let start: number | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let disposed = false;

	const dispose = () => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
		disposed = true;
	};

	return {
		render(): string[] {
			const now = performance.now();
			if (start === undefined && !disposed) {
				start = now;
				timer = setInterval(requestRender, ANIMATION_TICK_MS);
				timer.unref();
			}
			return renderGradient(lines, disposed ? 0 : now - (start ?? now), getCapabilities().trueColor);
		},
		dispose,
	};
}

export function renderGradient(lines: readonly string[], elapsedMs: number, trueColor: boolean): string[] {
	const width = Math.max(1, ...lines.map((line) => visibleWidth(line)));
	const phase = (elapsedMs % GRADIENT_PERIOD_MS) / GRADIENT_PERIOD_MS;
	const shineProgress = (elapsedMs % SHINE_PERIOD_MS) / SHINE_PERIOD_MS;
	const shinePos = shineProgress * (1 + 2 * SHINE_HALF_WIDTH) - SHINE_HALF_WIDTH;

	return lines.map((line, y) => {
		let x = 0;
		return [...line].map((char) => {
			const horizontal = x / Math.max(1, width - 1);
			x += visibleWidth(char);
			if (char === " ") return char;
			const base = lines.length === 1 ? horizontal : (horizontal + y / (lines.length - 1)) / 2;
			const t = (1 - Math.cos(Math.PI * (base + 2 * phase))) / 2;
			const shine = Math.max(0, 1 - Math.abs(base - shinePos) / SHINE_HALF_WIDTH) * 0.55;
			return `${gradientEscape(t, shine, trueColor)}${char}\x1b[39m`;
		}).join("");
	});
}

function gradientEscape(t: number, shine: number, trueColor: boolean): string {
	if (!trueColor) {
		const index = shine > 0.5
			? GRADIENT_RAMP_256.length - 1
			: Math.min(GRADIENT_RAMP_256.length - 1, Math.max(0, Math.round(t * (GRADIENT_RAMP_256.length - 1))));
		return `\x1b[38;5;${GRADIENT_RAMP_256[index]}m`;
	}

	const segment = t * (GRADIENT_STOPS.length - 1);
	const index = Math.min(GRADIENT_STOPS.length - 2, Math.floor(segment));
	const fraction = segment - index;
	const rgb = GRADIENT_STOPS[index].map((channel, i) => {
		const value = channel + (GRADIENT_STOPS[index + 1][i] - channel) * fraction;
		return Math.round(value + (255 - value) * shine);
	});
	return `\x1b[38;2;${rgb.join(";")}m`;
}
