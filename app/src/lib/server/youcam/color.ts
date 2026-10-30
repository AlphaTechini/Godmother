// Small colour helpers: hex normalisation, descriptive names, and the undertone estimate.

export function normalizeHex(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const m = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
	return m ? `#${m[1].toUpperCase()}` : undefined;
}

function rgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB hex -> CIELAB (D65). */
export function hexToLab(hex: string): { L: number; a: number; b: number } {
	const lin = rgb(hex).map((v) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const [r, g, b] = lin;
	const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
	const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
	const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
	const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	const fx = f(x);
	const fy = f(y);
	const fz = f(z);
	return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * Undertone from the skin hex. YouCam has NO undertone field (API-NOTES §2.6): this is OUR estimate.
 * Heuristic: the Lab hue angle atan2(b*, a*). Pink/red skin sits at a low angle (cool),
 * yellow-ish skin at a high angle (warm), a greenish-yellow cast at the top end (olive).
 * Thresholds in degrees; tune here only.
 */
export const UNDERTONE_THRESHOLDS = { coolBelow: 52, warmFrom: 60, oliveFrom: 72 };

export function deriveUndertone(skinHex: string): 'warm' | 'cool' | 'neutral' | 'olive' {
	const { a, b } = hexToLab(skinHex);
	const hue = (Math.atan2(b, a) * 180) / Math.PI;
	const t = UNDERTONE_THRESHOLDS;
	if (hue >= t.oliveFrom) return 'olive';
	if (hue >= t.warmFrom) return 'warm';
	if (hue < t.coolBelow) return 'cool';
	return 'neutral';
}

/** Descriptive skin depth from lightness. */
export function describeSkinTone(hex: string): string {
	const { L } = hexToLab(hex);
	if (L >= 80) return 'Fair';
	if (L >= 70) return 'Light';
	if (L >= 60) return 'Medium';
	if (L >= 50) return 'Tan';
	if (L >= 40) return 'Deep';
	return 'Rich deep';
}

/** Simple descriptive colour name (HSL buckets). Good enough for a chat message. */
export function describeColor(hex: string): string {
	const [r8, g8, b8] = rgb(hex);
	const r = r8 / 255;
	const g = g8 / 255;
	const b = b8 / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	let h = 0;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h = (h * 60 + 360) % 360;
	}
	if (s < 0.1) {
		if (l < 0.15) return 'Black';
		if (l < 0.4) return 'Dark grey';
		if (l < 0.7) return 'Grey';
		return l < 0.9 ? 'Light grey' : 'White';
	}
	const light = l >= 0.7 ? 'Light ' : l < 0.3 ? 'Dark ' : '';
	if ((h < 15 || h >= 345) && l >= 0.5 && s < 0.6) return 'Rose';
	if (h >= 15 && h < 45 && l < 0.4) return 'Brown';
	if (h >= 15 && h < 45 && l >= 0.55 && s < 0.6) return 'Peach';
	const family =
		h < 15 || h >= 345
			? 'red'
			: h < 45
				? 'orange'
				: h < 65
					? 'yellow'
					: h < 165
						? 'green'
						: h < 195
							? 'teal'
							: h < 260
								? 'blue'
								: h < 300
									? 'purple'
									: 'pink';
	const name = `${light}${family}`;
	return name.charAt(0).toUpperCase() + name.slice(1);
}
