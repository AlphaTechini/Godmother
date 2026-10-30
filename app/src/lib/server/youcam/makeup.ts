// Makeup VTO: the whitelist of pattern labels, the validator (the real gate before a unit is spent),
// and the JSON Schema handed to the LLM. Spec: docs/API-NOTES.md §2.3.

import type { MakeupEffect } from './index';

export type MakeupValidation =
	{ ok: true; effects: MakeupEffect[] } | { ok: false; errors: string[] };

export type PatternCategory =
	| 'eye_shadow'
	| 'eye_liner'
	| 'eyebrows'
	| 'eyelashes'
	| 'blush'
	| 'contour'
	| 'bronzer'
	| 'highlighter'
	| 'lip_liner'
	| 'lip_color';

/** Labels per category -> number of palettes (colorNum). Case-sensitive. (§2.3.2) */
export const MAKEUP_PATTERNS: Record<PatternCategory, Record<string, number>> = {
	eye_shadow: {
		...n(1, '1color1 1color8 1color9 1color22 1color23 1color30 1color55 1color57 1color67'),
		...n(2, '2colors1 2colors25 2colors40 2colors83 2colors164 2colors167'),
		...n(3, '3colors1 3colors100 3colors103'),
		...n(4, '4colors1'),
		...n(5, '5colors1')
	},
	eye_liner: {
		...n(
			1,
			'Arabic3 Lower1 Lower11 OpenWings1 OpenWings2 OpenWings3 Smoke11 Drama8 Drama12 Drama13 Drama34 Drama40 Drama42 Drama47 Drama51 PandaSmudge1 PandaSmudge11 FullRim7'
		),
		...n(2, '2colors1'),
		...n(3, '3colors2 3colors5')
	},
	eyebrows: n(
		1,
		'Arrow1 Arrow13 Curved1 Drama2 Drama4 Drama7 Drama14 HighArch1 HighArch4 Original2 Original5 SoftArch1 Straight1 Straight2 Thin1 Upward4'
	),
	eyelashes: n(
		1,
		'Natural1 Upper1 UpperDense1 Upper&Lower1 Upper&Lower4 Winged1 Wispies1 Artistic1'
	),
	blush: {
		...n(1, '1color1 Round1 Round2 Oblique1 Oblique2 Circle2 Rectangle7 Triangle3'),
		...n(2, '2colors1 2colors6'),
		...n(3, '3colors1 3colors8')
	},
	contour: n(
		1,
		'OvalFace6 OvalFace13 HeartFace2 HeartFace3 Invtriangle1 RoundFace4 TriangleFace2 TriangleFace5'
	),
	bronzer: n(1, 'Bronzer1 Bronzer2 Bronzer3 Bronzer5'),
	highlighter: n(
		1,
		'OvalFace2 OvalFace5 OvalFace62 HeartFace4 Invtriangle2 Oblong11 RoundFace3 SquareFace3 TriangleFace3'
	),
	lip_liner: n(1, 'Natural1 Large&Full1 LargerLower1 LargerUpper1 Rosebud1 Small1 Wider1'),
	// lip_color uses shape.name (not pattern.name); this is the complete catalog.
	lip_color: n(1, 'original heart-shaped m-shaped petal plump pouty smile vintage')
};

function n(count: number, labels: string): Record<string, number> {
	return Object.fromEntries(labels.split(' ').map((l) => [l, count]));
}

/* ------------------------------------------------------------------------ rules */

type Kind = 'int' | 'sint' | 'hex';
/** Palette keys by texture. `base` applies to all; `byTexture` adds keys; no `textures` = no texture key. */
interface PaletteRule {
	base: Record<string, Kind>;
	textures?: Record<string, Record<string, Kind>>;
}

const color: Kind = 'hex';
const int: Kind = 'int';

const PALETTES: Record<string, PaletteRule> = {
	foundation: {
		base: { color, colorIntensity: int, glowIntensity: int, coverageIntensity: int }
	},
	concealer: {
		base: { color, colorIntensity: int, colorUnderEyeIntensity: int, coverageLevel: int }
	},
	bronzer: { base: { color, colorIntensity: int } },
	contour: { base: { color, colorIntensity: int } },
	highlighter: {
		base: {
			color,
			colorIntensity: int,
			glowIntensity: int,
			shimmerIntensity: int,
			shimmerDensity: int,
			shimmerSize: int
		}
	},
	eyelashes: { base: { color, colorIntensity: int } },
	blush: {
		base: { color, colorIntensity: int },
		textures: {
			matte: {},
			satin: { glowStrength: int },
			shimmer: { shimmerColor: color, shimmerDensity: int }
		}
	},
	eyebrows: {
		base: { color, colorIntensity: int },
		textures: {
			matte: {},
			shimmer: { shimmerColor: color, shimmerIntensity: int, shimmerSize: int, shimmerDensity: int }
		}
	},
	eye_shadow: eyeRule(),
	eye_liner: eyeRule(),
	lip_color: {
		base: { color, colorIntensity: int },
		textures: {
			matte: {},
			satin: {},
			gloss: { gloss: int, transparencyIntensity: int },
			sheer: { gloss: int, transparencyIntensity: int },
			shimmer: {
				gloss: int,
				transparencyIntensity: int,
				shimmerColor: color,
				shimmerIntensity: int,
				shimmerDensity: int,
				shimmerSize: int
			},
			metallic: {
				gloss: int,
				shimmerColor: color,
				shimmerIntensity: int,
				shimmerDensity: int,
				shimmerSize: int
			},
			holographic: {
				gloss: int,
				shimmerColor: color,
				shimmerIntensity: int,
				shimmerDensity: int,
				shimmerSize: int
			}
		}
	},
	lip_liner: {
		base: { color, colorIntensity: int, thickness: int, smoothness: int },
		textures: { matte: {}, satin: {} }
	}
};

function eyeRule(): PaletteRule {
	return {
		base: { color, colorIntensity: int },
		textures: {
			matte: {},
			shimmer: { shimmerColor: color, shimmerIntensity: int },
			metallic: { shimmerColor: color, shimmerIntensity: int, metallicIntensity: int }
		}
	};
}

const EFFECT_CATEGORIES = [
	'skin_smooth',
	'foundation',
	'concealer',
	'blush',
	'bronzer',
	'contour',
	'highlighter',
	'eyebrows',
	'eye_shadow',
	'eye_liner',
	'eyelashes',
	'lip_color',
	'lip_liner'
] as const;
type EffectCategory = (typeof EFFECT_CATEGORIES)[number];

/** Categories whose `pattern.name` must be on the whitelist (lip_color and eyebrows are special). */
const NAMED_PATTERN: ReadonlySet<string> = new Set([
	'blush',
	'bronzer',
	'contour',
	'highlighter',
	'eye_shadow',
	'eye_liner',
	'eyelashes',
	'lip_liner'
]);

const HEX = /^#[0-9a-fA-F]{6}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Recursively drops null/undefined (strict-mode LLM output sends nulls for unused keys). */
function stripNulls(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(stripNulls);
	if (isObj(v)) {
		const out: Record<string, unknown> = {};
		for (const [k, x] of Object.entries(v)) {
			if (x === null || x === undefined) continue;
			out[k] = stripNulls(x);
		}
		return out;
	}
	return v;
}

class Check {
	errors: string[] = [];
	constructor(private prefix: string) {}
	err(msg: string) {
		this.errors.push(`${this.prefix}: ${msg}`);
	}
	/** Reads an integer in [lo, hi]. */
	int(
		o: Record<string, unknown>,
		key: string,
		lo: number,
		hi: number,
		where = ''
	): number | undefined {
		const v = o[key];
		const name = `${where}${key}`;
		if (v === undefined) return void this.err(`missing ${name}`);
		if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
			return void this.err(`${name} must be an integer ${lo}..${hi} (got ${JSON.stringify(v)})`);
		}
		return v;
	}
	hex(o: Record<string, unknown>, key: string, where = ''): string | undefined {
		const v = o[key];
		const name = `${where}${key}`;
		if (v === undefined) return void this.err(`missing ${name}`);
		if (typeof v !== 'string' || !HEX.test(v)) {
			return void this.err(`${name} must be a #RRGGBB colour (got ${JSON.stringify(v)})`);
		}
		return v.toUpperCase();
	}
}

function validatePalette(
	c: Check,
	category: string,
	rule: PaletteRule,
	raw: unknown,
	i: number
): Record<string, unknown> | undefined {
	const where = `palettes[${i}].`;
	if (!isObj(raw)) return void c.err(`palettes[${i}] must be an object`);
	const out: Record<string, unknown> = {};
	let keys = { ...rule.base };
	if (rule.textures) {
		const t = raw.texture;
		const allowed = Object.keys(rule.textures);
		if (typeof t !== 'string' || !(t in rule.textures)) {
			c.err(
				`${where}texture must be one of ${allowed.join(', ')} for ${category} (got ${JSON.stringify(t)})`
			);
			return undefined;
		}
		out.texture = t;
		keys = { ...keys, ...rule.textures[t] };
	}
	for (const [key, kind] of Object.entries(keys)) {
		const v = kind === 'hex' ? c.hex(raw, key, where) : c.int(raw, key, 0, 100, where);
		if (v !== undefined) out[key] = v;
	}
	return out;
}

function validatePalettes(
	c: Check,
	category: string,
	raw: unknown,
	expected: number | { min: number; max: number }
): Record<string, unknown>[] | undefined {
	if (!Array.isArray(raw)) return void c.err('palettes must be an array');
	const [min, max] =
		typeof expected === 'number' ? [expected, expected] : [expected.min, expected.max];
	if (raw.length < min || raw.length > max) {
		c.err(
			min === max
				? `palettes must have exactly ${min} item(s) for this pattern (got ${raw.length})`
				: `palettes must have ${min}..${max} items (got ${raw.length})`
		);
		return undefined;
	}
	const rule = PALETTES[category];
	const out = raw.map((p, i) => validatePalette(c, category, rule, p, i));
	return out.every(Boolean) ? (out as Record<string, unknown>[]) : undefined;
}

function whitelisted(
	c: Check,
	category: PatternCategory,
	name: unknown,
	what: string
): number | undefined {
	const table = MAKEUP_PATTERNS[category];
	if (typeof name !== 'string' || !Object.hasOwn(table, name)) {
		c.err(
			`${what} ${JSON.stringify(name)} is not an allowed ${category} label. Allowed: ${Object.keys(table).join(', ')}`
		);
		return undefined;
	}
	return table[name];
}

function validateEffect(raw: unknown, index: number): { effect?: MakeupEffect; errors: string[] } {
	if (!isObj(raw)) return { errors: [`effects[${index}]: must be an object`] };
	const category = raw.category;
	if (typeof category !== 'string' || !EFFECT_CATEGORIES.includes(category as EffectCategory)) {
		return {
			errors: [
				`effects[${index}]: unknown category ${JSON.stringify(category)}. Allowed: ${EFFECT_CATEGORIES.join(', ')}`
			]
		};
	}
	const c = new Check(`effects[${index}] (${category})`);
	const out: Record<string, unknown> = { category };

	if (category === 'skin_smooth') {
		out.skinSmoothStrength = c.int(raw, 'skinSmoothStrength', 0, 100);
		out.skinSmoothColorIntensity = c.int(raw, 'skinSmoothColorIntensity', 0, 100);
	} else if (category === 'foundation' || category === 'concealer') {
		out.palettes = validatePalettes(c, category, raw.palettes, 1);
	} else if (category === 'eyebrows') {
		const pattern = raw.pattern;
		if (!isObj(pattern) || (pattern.type !== 'shape' && pattern.type !== 'color')) {
			c.err('pattern.type must be "shape" or "color"');
		} else if (pattern.type === 'color') {
			out.pattern = { type: 'color' };
		} else {
			const p: Record<string, unknown> = { type: 'shape' };
			whitelisted(c, 'eyebrows', pattern.name, 'pattern.name');
			p.name = pattern.name;
			p.curvature = c.int(pattern, 'curvature', -100, 100, 'pattern.');
			p.thickness = c.int(pattern, 'thickness', -100, 100, 'pattern.');
			p.definition = c.int(pattern, 'definition', 0, 100, 'pattern.');
			out.pattern = p;
		}
		out.palettes = validatePalettes(c, category, raw.palettes, 1);
	} else if (category === 'lip_color') {
		const shape = raw.shape;
		if (!isObj(shape)) c.err('missing shape.name');
		else {
			whitelisted(c, 'lip_color', shape.name, 'shape.name');
			out.shape = { name: shape.name };
		}
		const style = raw.style;
		if (!isObj(style)) c.err('missing style.type (required: "full" or "ombre")');
		else if (style.type === 'full') out.style = { type: 'full' };
		else if (style.type === 'ombre') {
			out.style = {
				type: 'ombre',
				innerRatio: c.int(style, 'innerRatio', 0, 100, 'style.'),
				featherStrength: c.int(style, 'featherStrength', 0, 100, 'style.')
			};
		} else if (style.type === 'twoTone') {
			c.err('style.type "twoTone" is not supported (undocumented); use "full" or "ombre"');
		} else {
			c.err(`style.type must be "full" or "ombre" (got ${JSON.stringify(style.type)})`);
		}
		out.palettes = validatePalettes(c, category, raw.palettes, { min: 1, max: 2 });
		if (raw.morphology !== undefined) {
			// INFERRED ranges: the docs only name the keys.
			const m = raw.morphology;
			if (!isObj(m)) c.err('morphology must be an object');
			else {
				out.morphology = {
					fullness: c.int(m, 'fullness', 0, 100, 'morphology.'),
					wrinkless: c.int(m, 'wrinkless', 0, 100, 'morphology.')
				};
			}
		}
	} else if (NAMED_PATTERN.has(category)) {
		const cat = category as PatternCategory;
		const pattern = raw.pattern;
		let colorNum: number | undefined;
		if (!isObj(pattern)) c.err('missing pattern.name');
		else {
			colorNum = whitelisted(c, cat, pattern.name, 'pattern.name');
			out.pattern = { name: pattern.name };
		}
		// An invalid label still gets its palettes checked structurally (>=1) to report everything.
		out.palettes = validatePalettes(c, category, raw.palettes, colorNum ?? { min: 1, max: 5 });
	}

	if (c.errors.length) return { errors: c.errors };
	return { effect: out as MakeupEffect, errors: [] };
}

/**
 * Validates LLM output against the schema and whitelist. Nulls (from strict-mode schemas) are
 * stripped and inapplicable keys (for example glowStrength on a matte palette) are dropped, so
 * `effects` is exactly what may be sent to YouCam.
 */
export function validateMakeupEffects(input: unknown): MakeupValidation {
	const cleaned = stripNulls(input);
	if (!Array.isArray(cleaned)) return { ok: false, errors: ['effects must be an array'] };
	if (cleaned.length === 0) return { ok: false, errors: ['effects must not be empty'] };
	const errors: string[] = [];
	const effects: MakeupEffect[] = [];
	const seen = new Set<string>();
	cleaned.forEach((raw, i) => {
		const r = validateEffect(raw, i);
		errors.push(...r.errors);
		if (r.effect) {
			if (seen.has(r.effect.category)) {
				errors.push(`effects[${i}]: category ${r.effect.category} appears more than once`);
			}
			seen.add(r.effect.category);
			effects.push(r.effect);
		}
	});
	return errors.length ? { ok: false, errors } : { ok: true, effects };
}

/* ------------------------------------------------------------------- JSON Schema */

type Schema = Record<string, unknown>;

const intS = (lo = 0, hi = 100): Schema => ({ type: 'integer', minimum: lo, maximum: hi });
const hexS: Schema = { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' };
const constS = (v: string): Schema => ({ type: 'string', enum: [v] });
/** Strict mode: every property required, no extras. */
const objS = (props: Schema): Schema => ({
	type: 'object',
	properties: props,
	required: Object.keys(props),
	additionalProperties: false
});
const kindS = (k: Kind): Schema => (k === 'hex' ? hexS : intS());

/** One palette schema: a plain object, or an anyOf over textures with their conditional keys. */
function paletteSchema(rule: PaletteRule): Schema {
	const base = Object.fromEntries(Object.entries(rule.base).map(([k, v]) => [k, kindS(v)]));
	if (!rule.textures) return objS(base);
	const variants = Object.entries(rule.textures).map(([tex, extra]) =>
		objS({
			texture: constS(tex),
			...base,
			...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, kindS(v)]))
		})
	);
	return variants.length === 1 ? variants[0] : { anyOf: variants };
}

const palettesS = (category: string, count: number | { min: number; max: number }): Schema => {
	const [min, max] = typeof count === 'number' ? [count, count] : [count.min, count.max];
	return { type: 'array', items: paletteSchema(PALETTES[category]), minItems: min, maxItems: max };
};

/** Labels grouped by colorNum, so each group pins the palette count. */
function groups(category: PatternCategory): [number, string[]][] {
	const by = new Map<number, string[]>();
	for (const [label, num] of Object.entries(MAKEUP_PATTERNS[category])) {
		by.set(num, [...(by.get(num) ?? []), label]);
	}
	return [...by.entries()].sort((a, b) => a[0] - b[0]);
}

function effectVariants(): Schema[] {
	const v: Schema[] = [];
	v.push(
		objS({
			category: constS('skin_smooth'),
			skinSmoothStrength: intS(),
			skinSmoothColorIntensity: intS()
		})
	);
	for (const cat of ['foundation', 'concealer']) {
		v.push(objS({ category: constS(cat), palettes: palettesS(cat, 1) }));
	}
	for (const cat of [
		'blush',
		'bronzer',
		'contour',
		'highlighter',
		'eye_shadow',
		'eye_liner',
		'eyelashes',
		'lip_liner'
	] as const) {
		for (const [num, labels] of groups(cat)) {
			v.push(
				objS({
					category: constS(cat),
					pattern: objS({ name: { type: 'string', enum: labels } }),
					palettes: palettesS(cat, num)
				})
			);
		}
	}
	v.push(
		objS({
			category: constS('eyebrows'),
			pattern: objS({
				type: constS('shape'),
				name: { type: 'string', enum: Object.keys(MAKEUP_PATTERNS.eyebrows) },
				curvature: intS(-100, 100),
				thickness: intS(-100, 100),
				definition: intS()
			}),
			palettes: palettesS('eyebrows', 1)
		}),
		objS({
			category: constS('eyebrows'),
			pattern: objS({ type: constS('color') }),
			palettes: palettesS('eyebrows', 1)
		})
	);
	v.push(
		objS({
			category: constS('lip_color'),
			shape: objS({ name: { type: 'string', enum: Object.keys(MAKEUP_PATTERNS.lip_color) } }),
			style: {
				anyOf: [
					objS({ type: constS('full') }),
					objS({ type: constS('ombre'), innerRatio: intS(), featherStrength: intS() })
				]
			},
			palettes: palettesS('lip_color', { min: 1, max: 2 })
		})
	);
	return v;
}

/**
 * JSON Schema for the effects ARRAY, to be embedded in a tool parameter (a tool's
 * root must be an object, so use makeupEffectsParameterSchema() for a standalone parameter).
 * STRICT-MODE COMPATIBLE: every object lists all properties in `required` with
 * `additionalProperties: false`, and nothing is nullable, because texture-conditional keys are
 * `anyOf` branches (one per texture) and the palette count is pinned per colorNum group with
 * minItems/maxItems. Labels are `enum`s from MAKEUP_PATTERNS, so the model can only pick
 * whitelisted ones. validateMakeupEffects is still the real gate.
 */
export function makeupEffectsJsonSchema(): Schema {
	return { type: 'array', items: { anyOf: effectVariants() }, minItems: 1 };
}

/** `{ effects: Effect[] }`: the effects schema wrapped as a strict-mode object parameter. */
export function makeupEffectsParameterSchema(): Schema {
	return objS({ effects: makeupEffectsJsonSchema() });
}
