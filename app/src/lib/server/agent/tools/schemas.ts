// JSON-schema fragments shared by the tool definitions (OpenAI strict mode: every property required,
// optional values are nullable, additionalProperties false everywhere).

import type { DressCode, PieceRole } from '#lib/types';

export const DRESS_CODES: readonly DressCode[] = [
	'white_tie',
	'black_tie',
	'black_tie_optional',
	'formal',
	'cocktail',
	'semi_formal',
	'business',
	'smart_casual',
	'casual',
	'themed',
	'traditional',
	'unknown'
];

export const GARMENT_ROLES = ['upper_body', 'lower_body', 'full_body', 'outer'] as const;
export const ACCESSORY_ROLES = ['earrings', 'necklace', 'watch', 'ring', 'bracelet'] as const;
export const PIECE_ROLES: readonly PieceRole[] = [...GARMENT_ROLES, 'shoes', ...ACCESSORY_ROLES];

export const str = { type: 'string' } as const;
export const nullableStr = { type: ['string', 'null'] } as const;

export function obj(properties: Record<string, unknown>): Record<string, unknown> {
	return {
		type: 'object',
		properties,
		required: Object.keys(properties),
		additionalProperties: false
	};
}

export const arrayOf = (items: unknown) => ({ type: 'array', items });

export const COLOR_SCHEMA = obj({
	name: { type: 'string', description: 'Plain colour name, e.g. "emerald".' },
	hex: { type: 'string', description: '#RRGGBB' }
});

export const SOURCE_REF_SCHEMA = obj({
	type: { type: 'string', enum: ['wardrobe', 'product', 'sew'] },
	id: { type: 'string', description: 'The id from CURRENT STATE (wardrobe item, product or sew design).' }
});

export const LOOK_SCHEMA = obj({
	title: { type: 'string', description: 'Short evocative name, e.g. "Emerald Column".' },
	summary: { type: 'string', description: 'One line describing the outfit.' },
	rationale: {
		type: 'string',
		description: 'Why it fits the dress code, event colours, location and this person. 1-2 sentences.'
	},
	palette: { ...arrayOf(COLOR_SCHEMA), description: '2-4 colours of the look.' },
	pieces: {
		...arrayOf(
			obj({
				role: { type: 'string', enum: [...GARMENT_ROLES] },
				name: { type: 'string', description: 'Human name of the piece, e.g. "Emerald satin gown".' },
				colorHex: nullableStr,
				source: SOURCE_REF_SCHEMA
			})
		),
		description:
			'Either one full_body piece, or upper_body + lower_body. outer is optional. No shoes or accessories here.'
	}
});

export const PIECE_INPUT_SCHEMA = obj({
	role: { type: 'string', enum: ['shoes', ...ACCESSORY_ROLES] },
	name: { type: 'string' },
	source: {
		...SOURCE_REF_SCHEMA,
		description: 'Wardrobe item or registered product (not a sew design).'
	}
});
