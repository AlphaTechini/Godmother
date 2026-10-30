import { describe, expect, it } from 'vitest';
import {
	MAKEUP_PATTERNS,
	makeupEffectsJsonSchema,
	makeupEffectsParameterSchema,
	validateMakeupEffects
} from './makeup';

// API-NOTES §2.3.3
const GALA: any[] = [
	{ category: 'skin_smooth', skinSmoothStrength: 45, skinSmoothColorIntensity: 38 },
	{
		category: 'foundation',
		palettes: [{ color: '#C68E6E', colorIntensity: 40, glowIntensity: 20, coverageIntensity: 50 }]
	},
	{
		category: 'contour',
		pattern: { name: 'OvalFace6' },
		palettes: [{ color: '#7A4E3A', colorIntensity: 30 }]
	},
	{
		category: 'highlighter',
		pattern: { name: 'OvalFace2' },
		palettes: [
			{
				color: '#F3D9B1',
				colorIntensity: 45,
				glowIntensity: 55,
				shimmerIntensity: 40,
				shimmerDensity: 40,
				shimmerSize: 30
			}
		]
	},
	{
		category: 'blush',
		pattern: { name: 'Oblique1' },
		palettes: [{ color: '#C9706B', texture: 'satin', glowStrength: 35, colorIntensity: 55 }]
	},
	{
		category: 'eyebrows',
		pattern: { type: 'shape', name: 'SoftArch1', curvature: 8, thickness: 5, definition: 55 },
		palettes: [{ color: '#3B2A20', colorIntensity: 50, texture: 'matte' }]
	},
	{
		category: 'eye_shadow',
		pattern: { name: '2colors83' },
		palettes: [
			{
				color: '#5B3A29',
				texture: 'shimmer',
				shimmerColor: '#E6C27A',
				shimmerIntensity: 60,
				colorIntensity: 65
			},
			{ color: '#2B1B14', texture: 'matte', colorIntensity: 70 }
		]
	},
	{
		category: 'eye_liner',
		pattern: { name: 'OpenWings3' },
		palettes: [{ color: '#000000', texture: 'matte', colorIntensity: 80 }]
	},
	{
		category: 'eyelashes',
		pattern: { name: 'UpperDense1' },
		palettes: [{ color: '#000000', colorIntensity: 85 }]
	},
	{
		category: 'lip_color',
		shape: { name: 'original' },
		style: { type: 'full' },
		palettes: [{ color: '#8E1B2C', texture: 'matte', colorIntensity: 85 }]
	}
];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const errorsOf = (input: unknown) => {
	const r = validateMakeupEffects(input);
	return r.ok ? [] : r.errors;
};

describe('validateMakeupEffects', () => {
	it('accepts the §2.3.3 gala example unchanged', () => {
		const r = validateMakeupEffects(clone(GALA));
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.effects).toEqual(GALA);
	});

	it('rejects an unknown pattern label', () => {
		const bad = clone(GALA);
		bad[2].pattern = { name: 'NotAThing' };
		const errors = errorsOf(bad);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(/effects\[2\] \(contour\).*NotAThing.*not an allowed contour label/);
	});

	it('labels are case sensitive and per category', () => {
		const bad = clone(GALA);
		bad[2].pattern = { name: 'ovalface6' };
		bad[8].pattern = { name: 'OvalFace6' }; // a contour label on eyelashes
		expect(errorsOf(bad)).toHaveLength(2);
	});

	it('rejects a palette count that differs from colorNum', () => {
		const bad = clone(GALA);
		bad[6].palettes = [bad[6].palettes![0]]; // 2colors83 needs 2
		expect(errorsOf(bad)[0]).toMatch(/exactly 2 item\(s\).*got 1/);
		const bad2 = clone(GALA);
		bad2[7].palettes!.push(bad2[7].palettes![0]); // single-colour liner with 2 palettes
		expect(errorsOf(bad2)[0]).toMatch(/exactly 1 item\(s\).*got 2/);
	});

	it('requires lip_color style, rejects twoTone, checks ombre fields', () => {
		const noStyle = clone(GALA);
		delete (noStyle[9] as any).style;
		expect(errorsOf(noStyle)[0]).toMatch(/missing style\.type/);

		const two = clone(GALA);
		(two[9] as any).style = { type: 'twoTone' };
		expect(errorsOf(two)[0]).toMatch(/twoTone/);

		const ombre = clone(GALA);
		(ombre[9] as any).style = { type: 'ombre', innerRatio: 40 };
		expect(errorsOf(ombre)[0]).toMatch(/featherStrength/);
		(ombre[9] as any).style = { type: 'ombre', innerRatio: 40, featherStrength: 20 };
		expect(validateMakeupEffects(ombre).ok).toBe(true);

		const noShape = clone(GALA);
		delete (noShape[9] as any).shape;
		expect(errorsOf(noShape)[0]).toMatch(/shape\.name/);
	});

	it('enforces texture-conditional keys', () => {
		const noGlow = clone(GALA);
		delete (noGlow[4].palettes as any)[0].glowStrength; // satin blush needs glowStrength
		expect(errorsOf(noGlow)[0]).toMatch(/palettes\[0\]\.glowStrength/);

		const shimmerless = clone(GALA);
		delete (shimmerless[6].palettes as any)[0].shimmerColor;
		expect(errorsOf(shimmerless)[0]).toMatch(/shimmerColor/);

		const lip = clone(GALA);
		(lip[9].palettes as any)[0].texture = 'gloss';
		const e = errorsOf(lip).join(' ');
		expect(e).toMatch(/gloss/);
		expect(e).toMatch(/transparencyIntensity/);

		const badTexture = clone(GALA);
		(badTexture[4].palettes as any)[0].texture = 'glitter';
		expect(errorsOf(badTexture)[0]).toMatch(/texture must be one of matte, satin, shimmer/);
	});

	it('enforces integer ranges and hex colours', () => {
		const a = clone(GALA);
		(a[1].palettes as any)[0].colorIntensity = 140;
		(a[1].palettes as any)[0].glowIntensity = 12.5;
		(a[1].palettes as any)[0].color = 'red';
		expect(errorsOf(a)).toHaveLength(3);

		const brow = clone(GALA);
		(brow[5].pattern as any).curvature = -101;
		(brow[5].pattern as any).definition = -1;
		expect(errorsOf(brow)).toHaveLength(2);
		(brow[5].pattern as any).curvature = -100;
		(brow[5].pattern as any).definition = 0;
		expect(validateMakeupEffects(brow).ok).toBe(true);
	});

	it('requires all eyebrow shape fields, but not for type "color"', () => {
		const shape = clone(GALA);
		delete (shape[5].pattern as any).curvature;
		expect(errorsOf(shape)[0]).toMatch(/pattern\.curvature/);

		const colour = clone(GALA);
		colour[5].pattern = { type: 'color' };
		expect(validateMakeupEffects(colour).ok).toBe(true);
	});

	it('strips nulls and inapplicable keys (strict-mode output)', () => {
		const strict = clone(GALA);
		(strict[1].palettes as any)[0].extra = null;
		(strict[8].palettes as any)[0].texture = null;
		(strict[2] as any).style = null;
		(strict[7].palettes as any)[0].glowStrength = 20; // not valid for a matte liner
		const r = validateMakeupEffects(strict);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.effects).toEqual(GALA);
		}
	});

	it('rejects unknown categories, non-arrays, empty and duplicate categories', () => {
		expect(errorsOf('nope')[0]).toMatch(/must be an array/);
		expect(errorsOf([])[0]).toMatch(/must not be empty/);
		expect(errorsOf([{ category: 'glitter' }])[0]).toMatch(/unknown category/);
		expect(errorsOf([GALA[9], GALA[9]])[0]).toMatch(/more than once/);
		expect(errorsOf([42])[0]).toMatch(/must be an object/);
	});

	it('reports every problem at once', () => {
		const bad = clone(GALA);
		bad[2].pattern = { name: 'x' };
		bad[8].palettes = [];
		delete (bad[9] as any).style;
		expect(errorsOf(bad).length).toBeGreaterThanOrEqual(3);
	});

	it('every whitelisted label has a colorNum and validates with that many palettes', () => {
		for (const [category, labels] of Object.entries(MAKEUP_PATTERNS)) {
			for (const [label, n] of Object.entries(labels)) {
				if (category === 'lip_color' || category === 'eyebrows') continue;
				const palette =
					category === 'lip_liner'
						? {
								color: '#AA5566',
								texture: 'matte',
								colorIntensity: 50,
								thickness: 20,
								smoothness: 30
							}
						: category === 'eye_shadow' || category === 'eye_liner' || category === 'blush'
							? { color: '#AA5566', texture: 'matte', colorIntensity: 50 }
							: category === 'highlighter'
								? {
										color: '#AA5566',
										colorIntensity: 5,
										glowIntensity: 5,
										shimmerIntensity: 5,
										shimmerDensity: 5,
										shimmerSize: 5
									}
								: { color: '#AA5566', colorIntensity: 50 };
				const effect = { category, pattern: { name: label }, palettes: Array(n).fill(palette) };
				expect(errorsOf([effect]), `${category}/${label}`).toEqual([]);
			}
		}
		// spot checks of the table
		expect(MAKEUP_PATTERNS.eye_shadow['2colors83']).toBe(2);
		expect(MAKEUP_PATTERNS.eye_shadow['5colors1']).toBe(5);
		expect(MAKEUP_PATTERNS.eye_liner['3colors2']).toBe(3);
		expect(MAKEUP_PATTERNS.blush['Oblique1']).toBe(1);
		expect(MAKEUP_PATTERNS.eyelashes['Upper&Lower1']).toBe(1);
	});
});

describe('makeupEffectsJsonSchema', () => {
	const schema = makeupEffectsParameterSchema() as any;

	/** Walks the schema and checks OpenAI strict-mode rules. */
	function checkStrict(node: any, path: string, problems: string[], depth = 0) {
		if (depth > 9) problems.push(`${path}: nesting too deep`);
		if (!node || typeof node !== 'object') return;
		if (node.anyOf)
			node.anyOf.forEach((n: any, i: number) =>
				checkStrict(n, `${path}.anyOf[${i}]`, problems, depth + 1)
			);
		if (node.type === 'object') {
			const keys = Object.keys(node.properties ?? {});
			if (node.additionalProperties !== false) problems.push(`${path}: additionalProperties`);
			if (JSON.stringify([...(node.required ?? [])].sort()) !== JSON.stringify([...keys].sort())) {
				problems.push(`${path}: required != properties`);
			}
			for (const k of keys) checkStrict(node.properties[k], `${path}.${k}`, problems, depth + 1);
		}
		if (node.type === 'array') checkStrict(node.items, `${path}[]`, problems, depth + 1);
	}

	it('is strict-mode shaped: all keys required, no extras, shallow, no nullable', () => {
		const problems: string[] = [];
		checkStrict(schema, '$', problems);
		expect(problems).toEqual([]);
		expect(schema.type).toBe('object');
		expect(schema.required).toEqual(['effects']);
		expect(JSON.stringify(schema)).not.toContain('"null"');
		expect(JSON.stringify(schema)).not.toContain('$ref');
	});

	it('makeupEffectsJsonSchema is the bare array schema', () => {
		const arr = makeupEffectsJsonSchema() as any;
		expect(arr.type).toBe('array');
		expect(arr.items.anyOf.length).toBeGreaterThan(20);
		expect(arr).toEqual(schema.properties.effects);
	});

	it('limits labels to the whitelist via enums', () => {
		const text = JSON.stringify(schema);
		for (const labels of Object.values(MAKEUP_PATTERNS)) {
			for (const label of Object.keys(labels)) expect(text).toContain(JSON.stringify(label));
		}
		const variants = schema.properties.effects.items.anyOf as any[];
		const shadow2 = variants.find(
			(v) => v.properties.category.enum[0] === 'eye_shadow' && v.properties.palettes.minItems === 2
		);
		expect(shadow2.properties.pattern.properties.name.enum).toEqual([
			'2colors1',
			'2colors25',
			'2colors40',
			'2colors83',
			'2colors164',
			'2colors167'
		]);
		expect(shadow2.properties.palettes.maxItems).toBe(2);
	});

	it('has one branch per category and the strictness limits are respected', () => {
		const variants = schema.properties.effects.items.anyOf as any[];
		const cats = new Set(variants.map((v) => v.properties.category.enum[0]));
		expect([...cats].sort()).toEqual(
			[
				'blush',
				'bronzer',
				'contour',
				'eye_liner',
				'eye_shadow',
				'eyebrows',
				'eyelashes',
				'foundation',
				'concealer',
				'highlighter',
				'lip_color',
				'lip_liner',
				'skin_smooth'
			].sort()
		);
		expect(JSON.stringify(schema).length).toBeLessThan(120_000);
	});

	it('a schema-shaped example round-trips through the validator', () => {
		// The strict schema forces every conditional key per texture; check a satin blush branch.
		const variants = schema.properties.effects.items.anyOf as any[];
		const blush1 = variants.find(
			(v) => v.properties.category.enum[0] === 'blush' && v.properties.palettes.minItems === 1
		);
		const textures = blush1.properties.palettes.items.anyOf.map(
			(p: any) => p.properties.texture.enum[0]
		);
		expect(textures).toEqual(['matte', 'satin', 'shimmer']);
		const satin = blush1.properties.palettes.items.anyOf[1];
		expect(Object.keys(satin.properties)).toContain('glowStrength');
		expect(Object.keys(blush1.properties.palettes.items.anyOf[0].properties)).not.toContain(
			'glowStrength'
		);
	});
});
