// request_photos, catalog_wardrobe, suggest_replies.

import { assetInputPart } from '#lib/server/llm';
import type { Asset, PhotoSlot, WardrobeItem } from '#lib/types';
import { newId } from '../state';
import { PIECE_ROLES, arrayOf, COLOR_SCHEMA, nullableStr, obj } from './schemas';
import {
	Problems,
	ToolError,
	isRec,
	mapLimit,
	readColors,
	readEnum,
	readString,
	type ToolDef
} from './types';

const SLOTS: readonly PhotoSlot[] = ['fullBody', 'portrait', 'hand'];

export const requestPhotos: ToolDef = {
	name: 'request_photos',
	description:
		'Ask the user for photos they have not given yet. fullBody is needed for outfits, portrait for makeup/hair/earrings/necklace, hand only if a watch, ring or bracelet is planned. Only missing slots are shown.',
	parameters: obj({
		slots: { type: 'array', items: { type: 'string', enum: [...SLOTS] } },
		reason: {
			type: 'string',
			description: 'One short sentence telling the user why, e.g. "To try the looks on you."'
		}
	}),
	strict: true,
	label: () => null,
	async run(args, { ctx, session }) {
		const p = new Problems();
		const reason = readString(p, args.reason, 'reason', { max: 240 });
		const slots: PhotoSlot[] = [];
		if (!Array.isArray(args.slots) || args.slots.length === 0)
			p.add('slots', 'must list at least one slot.');
		else {
			for (const [i, s] of args.slots.entries()) {
				const slot = readEnum(p, s, `slots[${i}]`, SLOTS);
				if (slot && !slots.includes(slot)) slots.push(slot);
			}
		}
		p.throwIfAny('Invalid photo request.');
		const missing = slots.filter((s) => !session.photos[s]);
		if (missing.length === 0) {
			return {
				ok: true,
				missing: [],
				note: 'The user already provided every requested photo. Carry on.'
			};
		}
		ctx.block({ type: 'photo_request', slots: missing, reason: reason! });
		return {
			ok: true,
			missing,
			note: 'The photo request card is shown. Wait for the photos; do not ask for anything else in this message.'
		};
	}
};

const WARDROBE_SCHEMA = obj({
	usable: {
		type: 'boolean',
		description:
			'False when the photo is not a single garment, shoe or accessory (or is unreadable).'
	},
	role: { type: 'string', enum: [...PIECE_ROLES] },
	description: {
		type: 'string',
		description: 'Short and concrete: cut, fabric, pattern, length. No brand guesses.'
	},
	colors: arrayOf(COLOR_SCHEMA),
	formality: { ...nullableStr, description: 'e.g. "casual", "smart casual", "formal", "evening".' },
	wornOnPerson: {
		type: 'boolean',
		description: 'True when a person is wearing the item in the photo.'
	},
	issue: {
		...nullableStr,
		description: 'If not usable, or if the photo is poor for a try-on, say why in one short phrase.'
	}
});

const WARDROBE_INSTRUCTIONS = `You catalogue one photo of a clothing item or accessory from a person's wardrobe.
Pick the single role that fits: upper_body (top, shirt, blouse, jacket worn as a top), lower_body (trousers, skirt), full_body (dress, jumpsuit, suit set, robe, traditional full outfit), outer (coat, blazer or cape worn over other clothes), shoes, earrings, necklace, watch, ring, bracelet.
Describe only what you can see.`;

export const catalogWardrobe: ToolDef = {
	name: 'catalog_wardrobe',
	description:
		"Read the user's wardrobe photos (asset ids from the [attachment ...] lines) and add each garment or accessory to their wardrobe. Only ids the user actually attached in this conversation are accepted.",
	parameters: obj({ assetIds: { type: 'array', items: { type: 'string' } } }),
	strict: true,
	label: (a) => {
		const n = Array.isArray(a.assetIds) ? a.assetIds.length : 0;
		return n === 1 ? 'Looking at the item you photographed' : 'Looking at your wardrobe photos';
	},
	async run(args, { ctx, session, model }) {
		if (!Array.isArray(args.assetIds) || args.assetIds.length === 0) {
			throw new ToolError('assetIds must list at least one asset id.');
		}
		const ids = [...new Set(args.assetIds.filter((x): x is string => typeof x === 'string'))].slice(
			0,
			8
		);

		const known = new Map<string, Asset>();
		for (const m of session.messages) for (const a of m.attachments) known.set(a.asset.id, a.asset);
		const errors = ids
			.filter((id) => !known.has(id))
			.map((id) => `Unknown asset id "${id}": not attached in this conversation.`);
		if (errors.length === ids.length)
			throw new ToolError('None of those asset ids were attached by the user.', { errors });

		type Outcome =
			| { assetId: string; added: WardrobeItem; note?: string }
			| { assetId: string; skipped: string };
		const outcomes = await mapLimit(
			ids.filter((id) => known.has(id)),
			3,
			async (id): Promise<Outcome> => {
				const asset = known.get(id)!;
				const existing = session.wardrobe.find((w) => w.image.id === id);
				if (existing) return { assetId: id, skipped: `Already in the wardrobe as ${existing.id}.` };
				const part = await assetInputPart(id, { detail: 'low' });
				if (!part) return { assetId: id, skipped: 'The image could not be read.' };
				const res = await model.ask({
					tier: 'fast',
					system: WARDROBE_INSTRUCTIONS,
					input: [{ type: 'text', text: 'Catalogue this item.' }, part],
					schema: WARDROBE_SCHEMA
				});
				const raw = res.json;
				if (!isRec(raw)) return { assetId: id, skipped: 'Could not read the item.' };
				const p = new Problems();
				const role = readEnum(p, raw.role, 'role', PIECE_ROLES);
				const description = readString(p, raw.description, 'description', { max: 200 });
				if (raw.usable === false || !role || !description) {
					return {
						assetId: id,
						skipped:
							typeof raw.issue === 'string' && raw.issue
								? raw.issue
								: 'It is not a single garment or accessory.'
					};
				}
				const item: WardrobeItem = {
					id: newId('wd'),
					image: asset,
					role,
					description,
					colors: readColors(new Problems(), raw.colors, 'colors', { max: 4 }),
					...(typeof raw.formality === 'string' && raw.formality.trim()
						? { formality: raw.formality.trim() }
						: {})
				};
				const note =
					role === 'lower_body' && raw.wornOnPerson !== true
						? 'Flat photo of a lower-body piece: YouCam needs a worn photo for these, so it may render poorly. Prefer pairing a dress or a different bottom.'
						: typeof raw.issue === 'string' && raw.issue
							? raw.issue
							: undefined;
				return { assetId: id, added: item, ...(note ? { note } : {}) };
			}
		);

		const added = outcomes.flatMap((o) => ('added' in o ? [o.added] : []));
		if (added.length > 0) {
			session.wardrobe.push(...added);
			ctx.block({ type: 'wardrobe', itemIds: added.map((w) => w.id) });
			await ctx.sessionChanged();
		}
		return {
			ok: added.length > 0,
			added: outcomes.flatMap((o) =>
				'added' in o
					? [
							{
								id: o.added.id,
								role: o.added.role,
								description: o.added.description,
								colors: o.added.colors.map((c) => c.name),
								formality: o.added.formality,
								note: o.note
							}
						]
					: []
			),
			skipped: [
				...outcomes.flatMap((o) =>
					'skipped' in o ? [{ assetId: o.assetId, reason: o.skipped }] : []
				),
				...errors.map((e) => ({ reason: e }))
			]
		};
	}
};

export const suggestReplies: ToolDef = {
	name: 'suggest_replies',
	description:
		'Offer up to 4 short quick replies the user can tap (each under 40 characters, written as the user would say it). Call this as your last tool call on most turns, then write your message to the user.',
	parameters: obj({ options: { type: 'array', items: { type: 'string' } } }),
	strict: true,
	terminal: true,
	label: () => null,
	async run(args, { ctx }) {
		const already = ctx.assistantMessage.blocks.some((b) => b.type === 'suggestions');
		if (already) return { ok: false, note: 'Suggestions were already shown this turn.' };
		const seen = new Set<string>();
		const options = (Array.isArray(args.options) ? args.options : [])
			.filter((o): o is string => typeof o === 'string')
			.map((o) => o.trim().slice(0, 60))
			.filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()))
			.slice(0, 4);
		if (options.length === 0) throw new ToolError('options must contain at least one short reply.');
		ctx.block({ type: 'suggestions', options });
		return { ok: true };
	}
};
