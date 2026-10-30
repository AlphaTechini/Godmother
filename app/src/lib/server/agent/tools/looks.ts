// propose_looks, revise_look, decide: the three outfit looks and their renders.

import { tryOnGarment } from '#lib/server/youcam';
import type {
	Asset,
	GarmentCategory,
	Look,
	LookPiece,
	NamedColor,
	PieceRole,
	PieceSource,
	RenderStep
} from '#lib/types';
import { newId } from '../state';
import { GARMENT_ROLES, LOOK_SCHEMA, arrayOf, obj } from './schemas';
import { failureMessage } from './youcam-errors';
import {
	Problems,
	ToolError,
	isRec,
	readColors,
	readEnum,
	readHex,
	readNumber,
	readString,
	unitsLeft,
	type ToolDef,
	type ToolEnv
} from './types';

/* ------------------------------------------------------------ validation */

export interface ParsedPiece {
	role: GarmentCategory;
	name: string;
	colorHex?: string;
	source: PieceSource;
	image: Asset;
	warning?: string;
}

export interface ParsedLook {
	title: string;
	summary: string;
	rationale: string;
	palette: NamedColor[];
	pieces: ParsedPiece[];
}

const SOURCE_TYPES = ['wardrobe', 'product', 'sew'] as const;

/** Resolves a { type, id } reference to a source and its try-on image. Problems are recorded on `p`. */
export function resolveSource(
	env: ToolEnv,
	p: Problems,
	ref: unknown,
	role: PieceRole,
	path: string,
	allowed: readonly (typeof SOURCE_TYPES)[number][] = SOURCE_TYPES
): { source: PieceSource; image: Asset; warning?: string } | undefined {
	if (!isRec(ref)) {
		p.add(path, 'must be { type, id }.');
		return undefined;
	}
	const type = readEnum(p, ref.type, `${path}.type`, allowed);
	const id = readString(p, ref.id, `${path}.id`, { max: 80 });
	if (!type || !id) return undefined;

	if (type === 'wardrobe') {
		const item = env.session.wardrobe.find((w) => w.id === id);
		if (!item) return void p.add(path, `wardrobe item "${id}" does not exist.`);
		if (item.role !== role) return void p.add(path, `wardrobe item "${id}" is a ${item.role}, not a ${role}.`);
		return { source: { type: 'wardrobe', wardrobeItemId: item.id }, image: item.image };
	}
	if (type === 'product') {
		const reg = env.agent.products[id];
		if (!reg) return void p.add(path, `product "${id}" does not exist. Use a productId returned by search_products.`);
		if (reg.role !== role) return void p.add(path, `product "${id}" is a ${reg.role}, not a ${role}.`);
		if (!reg.product.image) return void p.add(path, `product "${id}" has no stored photo to try on.`);
		return {
			source: { type: 'product', product: reg.product },
			image: reg.product.image,
			...(reg.vetted ? {} : { warning: `Product "${id}" did not pass the photo check (${reg.concern ?? 'unsuitable photo'}); the try-on may look off.` })
		};
	}
	const sew = env.agent.sewDesigns[id];
	if (!sew) return void p.add(path, `sew design "${id}" does not exist. Use a designId returned by design_garment.`);
	if (sew.role !== role) return void p.add(path, `sew design "${id}" is a ${sew.role}, not a ${role}.`);
	return { source: { type: 'sew', design: sew.design }, image: sew.design.image };
}

/** Checks one look input: references, completeness and the YouCam one-garment-per-call combinations. */
export function parseLook(env: ToolEnv, p: Problems, raw: unknown, path: string): ParsedLook | undefined {
	if (!isRec(raw)) {
		p.add(path, 'must be a look object.');
		return undefined;
	}
	const before = p.list.length;
	const title = readString(p, raw.title, `${path}.title`, { max: 80 });
	const summary = readString(p, raw.summary, `${path}.summary`, { max: 200 });
	const rationale = readString(p, raw.rationale, `${path}.rationale`, { max: 500 });
	const palette = readColors(p, raw.palette, `${path}.palette`, { max: 6 });

	const pieces: ParsedPiece[] = [];
	if (!Array.isArray(raw.pieces) || raw.pieces.length === 0) p.add(`${path}.pieces`, 'must list the pieces of the look.');
	else {
		raw.pieces.forEach((rp, i) => {
			const pp = `${path}.pieces[${i}]`;
			if (!isRec(rp)) return p.add(pp, 'must be a piece object.');
			const role = readEnum(p, rp.role, `${pp}.role`, GARMENT_ROLES);
			const name = readString(p, rp.name, `${pp}.name`, { max: 120 });
			const colorHex = readHex(p, rp.colorHex, `${pp}.colorHex`);
			if (!role) return;
			const resolved = resolveSource(env, p, rp.source, role, `${pp}.source`);
			if (name && resolved) {
				pieces.push({
					role,
					name,
					...(colorHex ? { colorHex } : {}),
					source: resolved.source,
					image: resolved.image,
					...(resolved.warning ? { warning: resolved.warning } : {})
				});
			}
		});
		const roles = pieces.map((x) => x.role);
		const dup = roles.find((r, i) => roles.indexOf(r) !== i);
		if (dup) p.add(`${path}.pieces`, `has two ${dup} pieces; YouCam dresses one garment per role.`);
		const full = roles.includes('full_body');
		const upper = roles.includes('upper_body');
		const lower = roles.includes('lower_body');
		if (full && (upper || lower)) {
			p.add(`${path}.pieces`, 'a full_body piece cannot be combined with upper_body or lower_body.');
		} else if (!full && upper && !lower) {
			p.add(`${path}.pieces`, 'an upper_body piece needs a lower_body piece (or use a full_body piece).');
		} else if (!full && lower && !upper) {
			p.add(`${path}.pieces`, 'a lower_body piece needs an upper_body piece (or use a full_body piece).');
		} else if (!full && !upper && !lower && pieces.length > 0) {
			p.add(`${path}.pieces`, 'every look needs one full_body piece, or upper_body + lower_body (outer alone is not an outfit).');
		}
	}
	if (p.list.length > before) return undefined;
	return { title: title!, summary: summary!, rationale: rationale!, palette, pieces };
}

/* --------------------------------------------------------------- building */

const ORDER: Record<GarmentCategory, number> = { full_body: 0, upper_body: 0, lower_body: 1, outer: 2, shoes: 3 };

/** Garment pieces in the order they are dressed on. */
export function renderOrder(look: Look): LookPiece[] {
	return look.pieces
		.filter((p) => (GARMENT_ROLES as readonly string[]).includes(p.role))
		.sort((a, b) => ORDER[a.role as GarmentCategory] - ORDER[b.role as GarmentCategory]);
}

export function buildLook(parsed: ParsedLook, index: number, id = newId('look'), version = 1): Look {
	const pieces: LookPiece[] = parsed.pieces.map((x) => ({
		id: newId('pc'),
		role: x.role,
		name: x.name,
		...(x.colorHex ? { colorHex: x.colorHex } : {}),
		source: x.source,
		image: x.image
	}));
	const look: Look = {
		id,
		index,
		title: parsed.title,
		summary: parsed.summary,
		rationale: parsed.rationale,
		palette: parsed.palette,
		pieces,
		render: { status: 'pending', steps: [] },
		version
	};
	look.render.steps = renderOrder(look).map(
		(piece): RenderStep => ({ label: piece.name, status: 'pending' })
	);
	return look;
}

/* ---------------------------------------------------------------- render */

/**
 * Dresses the user in the look, one garment per YouCam call, each on the previous result.
 * Mutates `look` in place (it is the object held by the session) and pushes a snapshot after every step.
 */
export async function renderLook(env: ToolEnv, look: Look): Promise<void> {
	const { ctx, session } = env;
	const person = session.photos.fullBody;
	const actId = `render:${look.id}:${look.version}`;
	const order = renderOrder(look);
	look.render.status = 'rendering';
	delete look.render.error;
	if (!person) {
		look.render.status = 'failed';
		look.render.error = 'No full-body photo to dress.';
		await ctx.sessionChanged();
		return;
	}

	let current: Asset = person;
	let seconds = 0;
	let failure: string | undefined;
	for (const [i, piece] of order.entries()) {
		const step = look.render.steps[i];
		if (failure) {
			step.status = 'skipped';
			continue;
		}
		step.status = 'rendering';
		ctx.activity(actId, `Trying look ${look.index} on you`, 'running', piece.name);
		await ctx.sessionChanged();
		try {
			const r = await tryOnGarment(
				{ session },
				{
					person: current,
					garment: piece.image!,
					category: piece.role as GarmentCategory,
					// The first pass may bring the shoes of its reference; later passes keep what is already on.
					...(i > 0 ? { changeShoes: false } : {})
				}
			);
			step.status = 'done';
			step.image = r.image;
			step.units = r.units;
			step.seconds = r.seconds;
			seconds += r.seconds;
			current = r.image;
		} catch (err) {
			failure = failureMessage(err, `Trying on ${piece.name}`);
			step.status = 'failed';
			step.error = failure;
		}
		await ctx.sessionChanged();
	}

	if (failure) {
		look.render.status = 'failed';
		look.render.error = failure;
		ctx.activity(actId, `Look ${look.index} could not be rendered`, 'failed', failure);
	} else {
		look.render.status = 'done';
		look.render.image = current;
		look.render.seconds = Math.round(seconds * 10) / 10;
		ctx.activity(actId, `Look ${look.index} is ready`, 'done');
	}
	await ctx.sessionChanged();
}

function summarize(env: ToolEnv, looks: Look[], warnings: string[]) {
	const failed = looks.filter((l) => l.render.status === 'failed');
	return {
		ok: failed.length < looks.length,
		looks: looks.map((l) => ({
			lookId: l.id,
			index: l.index,
			title: l.title,
			version: l.version,
			status: l.render.status,
			seconds: l.render.seconds,
			...(l.render.error ? { error: l.render.error } : {})
		})),
		unitsRemaining: unitsLeft(env.session),
		...(warnings.length ? { warnings } : {}),
		...(failed.length
			? {
					note: `${failed.length} look(s) failed to render. Tell the user briefly; offer revise_look with a different piece (flat bottoms and busy product photos fail most often) rather than retrying the same pieces.`
				}
			: {})
	};
}

/* ------------------------------------------------------------------ tools */

function resetChoice(env: ToolEnv): void {
	const s = env.session;
	delete s.decision;
	delete s.chosenLookId;
	delete s.lookbook;
	delete s.shoppingList;
}

export const proposeLooks: ToolDef = {
	name: 'propose_looks',
	description:
		'Propose exactly three complete outfit looks and try them all on the user. Each look is one full_body piece, or upper_body + lower_body, optionally with outer. Every piece must reference a wardrobe item, a registered product or a sew design by id. Shoes and accessories come later, in finish_look. Needs the full-body photo. Renders take a minute; the cards update live.',
	parameters: obj({ looks: { ...arrayOf(LOOK_SCHEMA), description: 'Exactly three looks.' } }),
	strict: true,
	label: () => null,
	async run(args, env) {
		const { session, ctx } = env;
		if (!session.photos.fullBody) {
			throw new ToolError(
				'There is no full-body photo yet, so nothing can be tried on. Call request_photos with slots ["fullBody"] and wait for the user.'
			);
		}
		if (!Array.isArray(args.looks) || args.looks.length !== 3) {
			throw new ToolError(`Propose exactly three looks (got ${Array.isArray(args.looks) ? args.looks.length : 0}).`);
		}
		const p = new Problems();
		const parsed = args.looks.map((l, i) => parseLook(env, p, l, `looks[${i}]`));
		p.throwIfAny('The looks are not valid. Nothing was rendered or charged; fix these and call propose_looks again.');

		const looks = parsed.map((l, i) => buildLook(l!, i + 1));
		const warnings = parsed.flatMap((l, i) => (l!.pieces.flatMap((x) => (x.warning ? [`Look ${i + 1}: ${x.warning}`] : []))));
		resetChoice(env);
		session.looks = looks;
		session.stage = 'looks';
		ctx.block({ type: 'looks', lookIds: looks.map((l) => l.id) });
		await ctx.sessionChanged();

		await Promise.all(looks.map((l) => renderLook(env, l)));
		return summarize(env, looks, warnings);
	}
};

export const reviseLook: ToolDef = {
	name: 'revise_look',
	description:
		'Replace one of the three looks (by its index 1-3) with a revised version and re-render only that look. Same rules as propose_looks. Only change what the user disliked.',
	parameters: obj({
		lookIndex: { type: 'integer', description: '1, 2 or 3.' },
		look: LOOK_SCHEMA
	}),
	strict: true,
	label: () => null,
	async run(args, env) {
		const { session, ctx } = env;
		if (!session.photos.fullBody) {
			throw new ToolError('There is no full-body photo yet. Call request_photos with slots ["fullBody"].');
		}
		const p = new Problems();
		const idx = readNumber(p, args.lookIndex, 'lookIndex', { min: 1, max: 3 });
		const existing = session.looks.find((l) => l.index === idx);
		if (idx !== undefined && !existing) p.add('lookIndex', `there is no look ${idx} yet.`);
		const parsed = parseLook(env, p, args.look, 'look');
		p.throwIfAny('The revised look is not valid. Nothing was rendered or charged.');

		const revised = buildLook(parsed!, existing!.index, existing!.id, existing!.version + 1);
		session.looks = session.looks.map((l) => (l.id === revised.id ? revised : l));
		if (session.decision?.lookId === revised.id) delete session.decision;
		if (session.chosenLookId === revised.id) {
			delete session.chosenLookId;
			delete session.lookbook;
			delete session.shoppingList;
			session.stage = 'looks';
		}
		ctx.block({ type: 'looks', lookIds: [revised.id] });
		await ctx.sessionChanged();
		await renderLook(env, revised);
		return summarize(env, [revised], parsed!.pieces.flatMap((x) => (x.warning ? [x.warning] : [])));
	}
};

export const decide: ToolDef = {
	name: 'decide',
	description:
		'Commit to one look when the user asks you to decide: rank all looks 0-100 with a short note each and give one clear reason for the winner. Records the choice and shows the decision card.',
	parameters: obj({
		chosenLookId: { type: 'string' },
		reason: { type: 'string', description: '1-2 sentences, specific to the dress code, colours and this person.' },
		ranking: arrayOf(
			obj({
				lookId: { type: 'string' },
				score: { type: 'integer', description: '0-100' },
				note: { type: 'string', description: 'One short sentence.' }
			})
		)
	}),
	strict: true,
	label: () => 'Weighing up the three looks',
	async run(args, { session, ctx }) {
		const p = new Problems();
		const chosen = readString(p, args.chosenLookId, 'chosenLookId', { max: 80 });
		const reason = readString(p, args.reason, 'reason', { max: 500 });
		if (chosen && !session.looks.some((l) => l.id === chosen)) p.add('chosenLookId', `look "${chosen}" does not exist.`);
		const ranking: { lookId: string; score: number; note: string }[] = [];
		if (!Array.isArray(args.ranking) || args.ranking.length === 0) p.add('ranking', 'must rank the looks.');
		else {
			args.ranking.forEach((r, i) => {
				if (!isRec(r)) return p.add(`ranking[${i}]`, 'must be { lookId, score, note }.');
				const lookId = readString(p, r.lookId, `ranking[${i}].lookId`, { max: 80 });
				const score = readNumber(p, r.score, `ranking[${i}].score`, { min: 0, max: 100 });
				const note = readString(p, r.note, `ranking[${i}].note`, { max: 240 });
				if (lookId && !session.looks.some((l) => l.id === lookId)) p.add(`ranking[${i}].lookId`, `look "${lookId}" does not exist.`);
				if (lookId && score !== undefined && note) ranking.push({ lookId, score: Math.round(score), note });
			});
		}
		p.throwIfAny('The decision is not valid.');
		const look = session.looks.find((l) => l.id === chosen)!;
		if (look.render.status === 'failed') {
			throw new ToolError(`Look ${look.index} failed to render, so it cannot be the pick. Choose a look that rendered.`);
		}
		ranking.sort((a, b) => b.score - a.score);
		const decision = { lookId: look.id, reason: reason!, ranking };
		session.decision = decision;
		session.chosenLookId = look.id;
		if (session.stage === 'looks' || session.stage === 'photos') session.stage = 'chosen';
		ctx.block({ type: 'decision', decision });
		await ctx.sessionChanged();
		return { ok: true, chosen: { lookId: look.id, index: look.index, title: look.title }, stage: session.stage };
	}
};
