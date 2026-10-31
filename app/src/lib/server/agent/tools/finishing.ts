// analyze_face, list_hairstyles, finish_look: makeup, hair, shoes and accessories on the chosen look.

import {
	analyzeFace,
	applyHairstyle,
	applyMakeup,
	listHairTemplates,
	makeupEffectsJsonSchema,
	tryOnAccessory,
	tryOnGarment,
	tryOnShoes,
	validateMakeupEffects,
	type FeatureResult,
	type MakeupEffect
} from '#lib/server/youcam';
import type {
	AccessoryCategory,
	Asset,
	GarmentCategory,
	Look,
	Lookbook,
	LookPiece,
	MakeupStep,
	NamedColor,
	RenderStep
} from '#lib/types';
import { newId } from '../state';
import {
	ACCESSORY_ROLES,
	COLOR_SCHEMA,
	PIECE_INPUT_SCHEMA,
	arrayOf,
	nullableStr,
	obj
} from './schemas';
import { resolveSource } from './looks';
import { headAndShouldersCrop } from './portrait-crop';
import { failureMessage } from './youcam-errors';
import {
	Problems,
	ToolError,
	isRec,
	readColors,
	readEnum,
	readHex,
	readString,
	unitsLeft,
	type ToolDef,
	type ToolEnv
} from './types';

/* ------------------------------------------------------------ analyze_face */

export const analyzeFaceTool: ToolDef = {
	name: 'analyze_face',
	description:
		"Read the user's skin tone, undertone, eye/lip/hair colour and face and feature shapes from their portrait (costs 30 YouCam units, so it runs once per session; a repeat call returns the saved profile for free). Run it before choosing makeup.",
	parameters: obj({}),
	strict: true,
	label: (_a, env) => (env.session.face ? null : 'Reading your skin tone and face shape'),
	async run(_args, { session, ctx }) {
		if (session.face) return { ok: true, cached: true, profile: session.face };
		const portrait = session.photos.portrait;
		if (!portrait) {
			throw new ToolError(
				'There is no portrait yet. Call request_photos with slots ["portrait"] and wait for the user.'
			);
		}
		try {
			session.face = await analyzeFace({ session }, { portrait });
		} catch (err) {
			await ctx.sessionChanged();
			throw new ToolError(failureMessage(err, 'The face analysis'));
		}
		ctx.block({ type: 'face_profile', profile: session.face });
		await ctx.sessionChanged();
		return { ok: true, cached: false, profile: session.face };
	}
};

/* --------------------------------------------------------- list_hairstyles */

export const listHairstyles: ToolDef = {
	name: 'list_hairstyles',
	description:
		'List the hairstyle templates available for a gender (id and title). Free. Pick one template id for finish_look; there is no free-text hairstyle.',
	parameters: obj({ gender: { type: 'string', enum: ['female', 'male'] } }),
	strict: true,
	label: () => null,
	async run(args) {
		const p = new Problems();
		const gender = readEnum(p, args.gender, 'gender', ['female', 'male'] as const);
		p.throwIfAny('Invalid gender.');
		let all;
		try {
			all = await listHairTemplates();
		} catch (err) {
			throw new ToolError(failureMessage(err, 'Listing hairstyles'));
		}
		const matching = all
			.filter((t) => t.gender === gender || t.gender === 'unisex')
			// Styles that keep the user's own hair colour look most real.
			.sort((a, b) => Number(b.keepUsersColor) - Number(a.keepUsersColor))
			.slice(0, 60);
		return { templates: matching.map((t) => ({ id: t.id, title: t.title })) };
	}
};

/* ------------------------------------------------------------- finish_look */

const MAKEUP_STEP_SCHEMA = obj({
	area: { type: 'string', description: 'e.g. "Eyes", "Lips", "Base".' },
	product: { type: 'string', description: 'Generic product to use, e.g. "Satin cream blush".' },
	colorHex: nullableStr,
	instruction: { type: 'string', description: 'One clear DIY instruction.' }
});

/** The effects array schema from the YouCam module, tolerant of it being a const or a function. */
function effectsSchema(): Record<string, unknown> {
	try {
		const src: unknown = makeupEffectsJsonSchema;
		const s = typeof src === 'function' ? (src as () => unknown)() : src;
		if (isRec(s)) return s.type === 'array' ? s : { type: 'array', items: s };
	} catch {
		/* fall through */
	}
	return { type: 'array', items: { type: 'object' } };
}

function checkEffects(effects: unknown): { errors: string[]; effects: MakeupEffect[] } {
	const result: unknown = (validateMakeupEffects as (x: unknown) => unknown)(effects);
	let errors: string[] = [];
	let valid = Array.isArray(effects) ? (effects as MakeupEffect[]) : [];
	if (Array.isArray(result)) {
		errors = result.map(String);
	} else if (isRec(result)) {
		if (Array.isArray(result.errors))
			errors = result.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)));
		if (result.ok === false && errors.length === 0) errors = ['The makeup effects are not valid.'];
		if (Array.isArray(result.effects)) valid = result.effects as MakeupEffect[];
	}
	return { errors, effects: valid };
}

const HAND_ROLES: readonly AccessoryCategory[] = ['watch', 'ring', 'bracelet'];

interface PlannedPiece {
	piece: LookPiece;
	productUrl?: string;
}

async function runStep(
	env: ToolEnv,
	step: RenderStep,
	actId: string,
	label: string,
	work: () => Promise<FeatureResult>
): Promise<Asset | undefined> {
	const { ctx } = env;
	step.status = 'rendering';
	ctx.activity(actId, label, 'running');
	await ctx.sessionChanged();
	try {
		const r = await work();
		step.status = 'done';
		step.image = r.image;
		step.units = r.units;
		step.seconds = r.seconds;
		ctx.activity(actId, label, 'done');
		await ctx.sessionChanged();
		return r.image;
	} catch (err) {
		step.status = 'failed';
		step.error = failureMessage(err, label);
		ctx.activity(actId, label, 'failed', step.error);
		await ctx.sessionChanged();
		return undefined;
	}
}

export const finishLook: ToolDef = {
	name: 'finish_look',
	description:
		'Finish the chosen look: shoes on the full-body photo, the outfit then makeup + hair + earrings + necklace on the portrait, and watch/ring/bracelet on the hand photo. Spends YouCam units (shoes 2, each top, dress or outer piece on the portrait 2, makeup 1, hair 2, each accessory 1), so call it once, after analyze_face, with a complete plan. Makeup effects are validated first; if they are invalid you get the errors back and nothing is spent.',
	get parameters() {
		return {
			type: 'object',
			properties: {
				lookId: { type: 'string' },
				shoes: {
					anyOf: [PIECE_INPUT_SCHEMA, { type: 'null' }],
					description: 'Optional shoes (role "shoes").'
				},
				accessories: {
					...arrayOf(PIECE_INPUT_SCHEMA),
					description: 'Earrings, necklace, watch, ring, bracelet. Only those that suit the look.'
				},
				makeup: {
					type: 'object',
					properties: {
						name: {
							type: 'string',
							description: 'Name of the makeup look, e.g. "Warm bronze glow".'
						},
						rationale: {
							type: 'string',
							description: 'Why it suits this face, skin tone and the look.'
						},
						palette: arrayOf(COLOR_SCHEMA),
						effects: {
							...effectsSchema(),
							description: 'YouCam makeup effects. Pattern labels must come from the allowed lists.'
						},
						steps: {
							...arrayOf(MAKEUP_STEP_SCHEMA),
							description: 'DIY steps in the order to apply them.'
						}
					},
					required: ['name', 'rationale', 'palette', 'effects', 'steps'],
					additionalProperties: false
				},
				hair: {
					anyOf: [
						obj({
							templateId: { type: 'string' },
							templateName: { type: 'string' },
							rationale: { type: 'string' }
						}),
						{ type: 'null' }
					],
					description: 'Optional hairstyle from list_hairstyles.'
				}
			},
			required: ['lookId', 'shoes', 'accessories', 'makeup', 'hair'],
			additionalProperties: false
		};
	},
	strict: true,
	label: () => null,
	async run(args, env) {
		const { session, ctx } = env;
		const p = new Problems();

		const lookId = readString(p, args.lookId, 'lookId', { max: 80 });
		const look: Look | undefined = session.looks.find((l) => l.id === lookId);
		if (lookId && !look) p.add('lookId', `look "${lookId}" does not exist.`);
		else if (look && (look.render.status !== 'done' || !look.render.image)) {
			p.add('lookId', `look ${look.index} has no finished render to build on.`);
		}

		// Makeup first: invalid effects must come back to the model before anything is spent.
		const mk = isRec(args.makeup) ? args.makeup : undefined;
		if (!mk) p.add('makeup', 'is required.');
		let makeup:
			| {
					name: string;
					rationale: string;
					palette: NamedColor[];
					steps: MakeupStep[];
					effects: MakeupEffect[];
			  }
			| undefined;
		if (mk) {
			const name = readString(p, mk.name, 'makeup.name', { max: 80 });
			const rationale = readString(p, mk.rationale, 'makeup.rationale', { max: 500 });
			const palette = readColors(p, mk.palette, 'makeup.palette', { max: 8 });
			const steps: MakeupStep[] = [];
			if (!Array.isArray(mk.steps) || mk.steps.length === 0)
				p.add('makeup.steps', 'must list the DIY steps.');
			else {
				mk.steps.slice(0, 14).forEach((s, i) => {
					if (!isRec(s)) return p.add(`makeup.steps[${i}]`, 'must be an object.');
					const area = readString(p, s.area, `makeup.steps[${i}].area`, { max: 40 });
					const product = readString(p, s.product, `makeup.steps[${i}].product`, { max: 120 });
					const instruction = readString(p, s.instruction, `makeup.steps[${i}].instruction`, {
						max: 300
					});
					const colorHex = readHex(p, s.colorHex, `makeup.steps[${i}].colorHex`);
					if (area && product && instruction)
						steps.push({ area, product, instruction, ...(colorHex ? { colorHex } : {}) });
				});
			}
			if (!Array.isArray(mk.effects) || mk.effects.length === 0)
				p.add('makeup.effects', 'must be a non-empty array of effects.');
			else {
				const checked = checkEffects(mk.effects);
				for (const e of checked.errors) p.add('makeup.effects', e);
				if (checked.errors.length === 0 && name && rationale) {
					makeup = { name, rationale, palette, steps, effects: checked.effects };
				}
			}
		}

		// Shoes and accessories.
		const extras: {
			role: LookPiece['role'];
			name: string;
			piece: LookPiece;
			productUrl?: string;
		}[] = [];
		const addExtra = (raw: unknown, path: string, roles: readonly string[]) => {
			if (!isRec(raw)) return p.add(path, 'must be { role, name, source }.');
			const role = readEnum(p, raw.role, `${path}.role`, roles);
			const name = readString(p, raw.name, `${path}.name`, { max: 120 });
			if (!role) return;
			const resolved = resolveSource(
				env,
				p,
				raw.source,
				role as LookPiece['role'],
				`${path}.source`,
				['wardrobe', 'product']
			);
			if (!name || !resolved) return;
			extras.push({
				role: role as LookPiece['role'],
				name,
				productUrl:
					resolved.source.type === 'product' ? resolved.source.product.imageUrl : undefined,
				piece: {
					id: newId('pc'),
					role: role as LookPiece['role'],
					name,
					source: resolved.source,
					image: resolved.image
				}
			});
		};
		if (isRec(args.shoes)) addExtra(args.shoes, 'shoes', ['shoes']);
		if (Array.isArray(args.accessories)) {
			args.accessories
				.slice(0, 8)
				.forEach((a, i) => addExtra(a, `accessories[${i}]`, ACCESSORY_ROLES));
		}
		const seen = new Set<string>();
		for (const e of extras) {
			if (seen.has(e.role)) p.add('accessories', `two pieces for ${e.role}; give one per role.`);
			seen.add(e.role);
		}

		// Hair.
		let hair: { templateId: string; templateName: string; rationale: string } | undefined;
		if (isRec(args.hair)) {
			const templateId = readString(p, args.hair.templateId, 'hair.templateId', { max: 100 });
			const templateName = readString(p, args.hair.templateName, 'hair.templateName', { max: 100 });
			const rationale = readString(p, args.hair.rationale, 'hair.rationale', { max: 300 });
			if (templateId && templateName && rationale) hair = { templateId, templateName, rationale };
		}

		const portrait = session.photos.portrait;
		if (!portrait)
			p.add(
				'',
				'There is no portrait yet: call request_photos with slots ["portrait"] and wait for the user.'
			);
		p.throwIfAny(
			'Cannot finish the look yet. Nothing was spent; fix these and call finish_look again.'
		);

		if (hair) {
			try {
				const templates = await listHairTemplates();
				if (templates.length > 0 && !templates.some((t) => t.id === hair!.templateId)) {
					throw new ToolError(
						`Hair template "${hair.templateId}" does not exist. Nothing was spent; pick an id from list_hairstyles.`
					);
				}
			} catch (err) {
				if (err instanceof ToolError) throw err;
				// The template list is unavailable; let the render report any problem.
			}
		}

		const shoes = extras.find((e) => e.role === 'shoes');
		const portraitPieces = extras.filter((e) => e.role === 'earrings' || e.role === 'necklace');
		portraitPieces.sort(
			(a, b) => (a.role === 'earrings' ? -1 : 1) - (b.role === 'earrings' ? -1 : 1)
		);
		const handPieces = extras.filter((e) => (HAND_ROLES as readonly string[]).includes(e.role));
		const hand = session.photos.hand;

		// Commit the plan: pieces on the look, lookbook with all steps pending.
		const garmentPieces = look!.pieces.filter(
			(x) => !['shoes', ...ACCESSORY_ROLES].includes(x.role)
		);
		look!.pieces = [...garmentPieces, ...extras.map((e) => e.piece)];
		session.chosenLookId = look!.id;
		session.stage = 'finishing';
		delete session.shoppingList;

		const step = (label: string, skipped?: string): RenderStep =>
			skipped ? { label, status: 'skipped', error: skipped } : { label, status: 'pending' };
		const shoesStep = shoes ? step(`Shoes: ${shoes.name}`) : undefined;
		// A portrait stops around the chest, so trousers and skirts would not show on it.
		const portraitGarments = garmentPieces.filter((x) => x.role !== 'lower_body' && x.image);
		const outfitSteps = portraitGarments.map((x) => step(`Outfit on portrait: ${x.name}`));
		const makeupStep = step('Makeup');
		const hairStep = hair ? step(`Hair: ${hair.templateName}`) : undefined;
		const portraitSteps = portraitPieces.map((e) =>
			step(`${e.role === 'earrings' ? 'Earrings' : 'Necklace'}: ${e.name}`)
		);
		const handSteps = handPieces.map((e) =>
			step(
				`${e.role[0].toUpperCase()}${e.role.slice(1)}: ${e.name}`,
				hand ? undefined : 'No hand photo.'
			)
		);
		const book: Lookbook = {
			lookId: look!.id,
			full: look!.render.image,
			accessories: [],
			steps: [
				shoesStep,
				...outfitSteps,
				makeupStep,
				hairStep,
				...portraitSteps,
				...handSteps
			].filter((s): s is RenderStep => Boolean(s))
		};
		session.lookbook = book;
		await ctx.sessionChanged();

		const act = (k: string) => `finish:${look!.id}:${k}`;
		const productUrl = (e: PlannedPiece) => e.productUrl;

		const fullPanel = async () => {
			if (!shoes || !shoesStep) return;
			const img = await runStep(env, shoesStep, act('shoes'), 'Trying on the shoes', () =>
				tryOnShoes({ session }, { person: look!.render.image!, shoes: shoes.piece.image! })
			);
			if (img) book.full = img;
		};

		let usedCrop = false;
		const facePanel = async () => {
			let cur: Asset = portrait!;
			for (const [i, garment] of portraitGarments.entries()) {
				const person = cur;
				const img = await runStep(
					env,
					outfitSteps[i],
					act(`outfit-${i}`),
					'Putting the outfit on your portrait',
					() =>
						tryOnGarment(
							{ session },
							{
								person,
								garment: garment.image!,
								category: garment.role as GarmentCategory,
								changeShoes: false
							}
						)
				);
				if (img) {
					cur = img;
					book.face = cur;
				}
			}
			if (portraitGarments.length > 0 && cur === portrait) {
				const crop = await headAndShouldersCrop(env, look!.render.image!);
				if (crop) {
					usedCrop = true;
					cur = crop;
					book.face = cur;
				}
			}
			const m = await runStep(env, makeupStep, act('makeup'), 'Applying your makeup', () =>
				applyMakeup({ session }, { portrait: cur, effects: makeup!.effects })
			);
			if (m) {
				cur = m;
				book.face = cur;
			}
			// Even if the render failed, the DIY steps are worth keeping.
			book.makeup = {
				image: m ?? cur,
				name: makeup!.name,
				rationale: makeup!.rationale,
				palette: makeup!.palette,
				steps: makeup!.steps
			};
			await ctx.sessionChanged();

			if (hair && hairStep) {
				const h = await runStep(env, hairStep, act('hair'), 'Trying the hairstyle', () =>
					applyHairstyle({ session }, { portrait: cur, templateId: hair!.templateId })
				);
				if (h) {
					cur = h;
					book.face = cur;
					book.hair = {
						image: h,
						templateId: hair.templateId,
						templateName: hair.templateName,
						rationale: hair.rationale
					};
				}
			}
			for (const [i, e] of portraitPieces.entries()) {
				const img = await runStep(
					env,
					portraitSteps[i],
					act(e.role),
					`Trying on the ${e.role}`,
					() =>
						tryOnAccessory(
							{ session },
							{
								person: cur,
								category: e.role as AccessoryCategory,
								product: e.piece.image!,
								productUrl: productUrl(e)
							}
						)
				);
				if (img) {
					cur = img;
					book.face = cur;
					book.accessories.push({ piece: e.piece, image: img, panel: 'portrait' });
				}
			}
		};

		const handPanel = async () => {
			if (!hand || handPieces.length === 0) return;
			let cur: Asset = hand;
			for (const [i, e] of handPieces.entries()) {
				const img = await runStep(env, handSteps[i], act(e.role), `Trying on the ${e.role}`, () =>
					tryOnAccessory(
						{ session },
						{
							person: cur,
							category: e.role as AccessoryCategory,
							product: e.piece.image!,
							productUrl: productUrl(e)
						}
					)
				);
				if (img) {
					cur = img;
					book.hand = cur;
					book.accessories.push({ piece: e.piece, image: img, panel: 'hand' });
				}
			}
		};

		await Promise.all([fullPanel(), facePanel(), handPanel()]);
		ctx.block({ type: 'lookbook', lookId: look!.id });
		await ctx.sessionChanged();

		const failed = book.steps.filter((s) => s.status === 'failed');
		return {
			ok: failed.length < book.steps.length,
			lookId: look!.id,
			steps: book.steps.map((s) => ({
				label: s.label,
				status: s.status,
				...(s.error ? { error: s.error } : {})
			})),
			unitsRemaining: unitsLeft(session),
			...(handPieces.length && !hand
				? {
						note: 'No hand photo, so the watch/ring/bracelet were not tried on (they are still in the look).'
					}
				: {}),
			...(failed.length ? { failed: failed.map((s) => s.label) } : {}),
			...(usedCrop
				? {
						portraitNote:
							'The outfit could not go on the portrait, so the face panel uses a crop of the full-look render. It may look softer. Tell the user if it does.'
					}
				: {}),
			next: 'Offer the shopping list.'
		};
	}
};
