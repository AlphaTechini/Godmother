// The YouCam features. Each one: reserve units (UnitCapError before any network call), prepare and
// upload the inputs, create the task (never retried), poll, record the ledger, download the result
// into the asset store. Endpoint bodies: docs/API-NOTES.md §2.

import { config } from '#lib/server/config';
import type { Asset, AssetKind, FaceProfile } from '#lib/types';
import type { AccessoryCategory, GarmentCategory } from '#lib/types';
import { mapFaceAttributes, mapSkinTone, FACE_ATTR_FEATURES } from './analysis';
import { rememberResultUrl, imageRef, refField, type ImageRef } from './files';
import { YouCamTaskError } from './errors';
import { listHairTemplates as listHairTemplatesImpl } from './hair-templates';
import type { FaceBox } from './images';
import type { FeatureContext, FeatureResult, HairTemplate, MakeupEffect } from './index';
import { reserve, UNIT_COSTS, type LedgerFeature } from './ledger';
import { validateMakeupEffects } from './makeup';
import { storeResult } from './results';
import { forgetEntry, resumableEntry, saveJournal, updateEntry } from './task-journal';
import { runTask } from './tasks';
import { tuning } from './tuning';

export function unitCost(feature: LedgerFeature): number {
	return UNIT_COSTS[feature];
}

/* ---------------------------------------------------------------- shared runner */

interface ImageFeatureSpec {
	feature: LedgerFeature;
	label: string;
	path: string;
	kind: AssetKind;
	/** Makeup returns PNG with alpha: flatten onto white and store as JPEG. */
	flattenToJpeg?: boolean;
	/** Builds the request body (prepares and uploads the inputs). */
	build: () => Promise<Record<string, unknown>>;
}

async function runImageFeature(
	ctx: FeatureContext,
	spec: ImageFeatureSpec
): Promise<FeatureResult> {
	const units = UNIT_COSTS[spec.feature];
	// Reserve first and synchronously: parallel callers cannot overshoot, and nothing has hit the
	// network if the cap is exceeded.
	const reservation = reserve(ctx.session, units);
	try {
		const body = await spec.build();
		const task = await runTask({
			session: ctx.session,
			reservation,
			feature: spec.feature,
			units,
			path: spec.path,
			body
		});
		if (!task.url) {
			throw new YouCamTaskError(
				'no_result',
				'YouCam finished but returned no image. Try again.',
				spec.feature,
				{ taskId: task.taskId }
			);
		}
		const saved = task.replayed ? resumableEntry(ctx.session, task.key)?.image : undefined;
		if (saved) return { image: saved, seconds: 0, units: 0 };
		let image;
		try {
			image = await storeResult({
				url: task.url,
				feature: spec.feature,
				kind: spec.kind,
				label: spec.label,
				sessionId: ctx.session.id,
				taskId: task.taskId,
				flattenToJpeg: spec.flattenToJpeg
			});
		} catch (err) {
			// A saved result's link may have expired, so the next attempt has to start over.
			if (task.replayed) forgetEntry(ctx.session, task.key);
			throw err;
		}
		updateEntry(ctx.session, task.key, { image });
		await saveJournal(ctx.session);
		// Chaining by URL (chainMode 'url') needs the raw YouCam URL; the flattened makeup JPEG
		// differs from it, so it is only remembered for untouched results.
		if (spec.kind === 'result' && !spec.flattenToJpeg) rememberResultUrl(image.id, task.url);
		return { image, seconds: task.seconds, units: task.replayed ? 0 : units };
	} finally {
		reservation.release();
	}
}

const taskPath = (rest: string) => `/s2s/v2.0/task/${rest}`;

/* ------------------------------------------------------------------- garments */

export async function tryOnGarment(
	ctx: FeatureContext,
	input: { person: Asset; garment: Asset; category: GarmentCategory; changeShoes?: boolean }
): Promise<FeatureResult> {
	return runImageFeature(ctx, {
		feature: 'garment',
		label: 'Garment try-on',
		path: taskPath(config.youcam.clothEndpoint),
		kind: 'result',
		build: async () => ({
			...refField('src', await imageRef(input.person, 'clothes', 'garment')),
			...refField('ref', await imageRef(input.garment, 'clothes', 'garment')),
			garment_category: input.category, // our enum maps 1:1 onto the cloth-v4 enum
			change_shoes: input.changeShoes ?? true
		})
	});
}

export async function tryOnShoes(
	ctx: FeatureContext,
	input: { person: Asset; shoes: Asset }
): Promise<FeatureResult> {
	const viaTransfer = tuning.shoesEngine === 'shoes-transfer';
	return runImageFeature(ctx, {
		feature: 'shoes',
		label: 'Shoes try-on',
		path: viaTransfer ? taskPath('shoes-transfer') : taskPath(config.youcam.clothEndpoint),
		kind: 'result',
		build: async () => {
			const src = refField('src', await imageRef(input.person, 'clothes', 'shoes'));
			const ref = refField('ref', await imageRef(input.shoes, 'clothes', 'shoes'));
			// shoes-transfer body is INFERRED (API-NOTES §2.2): flip tuning.shoesEngine if it fails.
			return viaTransfer ? { ...src, ...ref } : { ...src, ...ref, garment_category: 'shoes' };
		}
	});
}

/* --------------------------------------------------------------------- makeup */

export async function applyMakeup(
	ctx: FeatureContext,
	input: { portrait: Asset; effects: MakeupEffect[] }
): Promise<FeatureResult> {
	// Validate before reserving anything: an invalid plan costs no units and no network call.
	const v = validateMakeupEffects(input.effects);
	if (!v.ok) {
		throw new YouCamTaskError(
			'invalid_makeup',
			`The makeup plan is not valid: ${v.errors.slice(0, 4).join('; ')}`,
			'makeup',
			{ details: v.errors }
		);
	}
	const effects = [...v.effects];
	if (!effects.some((e) => e.category === 'skin_smooth')) {
		// Without one YouCam applies smoothing 50 on its own; we choose the amount.
		effects.unshift({ category: 'skin_smooth', ...tuning.defaultSkinSmooth });
	}
	return runImageFeature(ctx, {
		feature: 'makeup',
		label: 'Makeup',
		path: taskPath('makeup-vto'),
		kind: 'result',
		flattenToJpeg: true,
		build: async () => ({
			...refField('src', await imageRef(input.portrait, 'makeup', 'makeup')),
			version: '1.0',
			effects
		})
	});
}

/* ----------------------------------------------------------------------- hair */

export async function applyHairstyle(
	ctx: FeatureContext,
	input: { portrait: Asset; templateId: string }
): Promise<FeatureResult> {
	if (!input.templateId?.trim()) {
		throw new YouCamTaskError('invalid_template', 'Pick a hairstyle template first.', 'hair');
	}
	return runImageFeature(ctx, {
		feature: 'hair',
		label: 'Hairstyle',
		path: '/s2s/v2.1/task/hair-transfer',
		kind: 'result',
		build: async () => ({
			...refField('src', await imageRef(input.portrait, 'hair', 'hair')),
			template_id: input.templateId
		})
	});
}

export function listHairTemplates(): Promise<HairTemplate[]> {
	return listHairTemplatesImpl();
}

/* ---------------------------------------------------------------- accessories */

/** True when YouCam's servers could fetch this URL (not a relative, localhost or private-network URL). */
export function isPublicHttpUrl(value: string | undefined): value is string {
	if (!value) return false;
	let u: URL;
	try {
		u = new URL(value);
	} catch {
		return false;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
	if (host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host)) return false;
	const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
	if (m) {
		const [a, b] = [Number(m[1]), Number(m[2])];
		if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)) return false;
		if (a === 172 && b >= 16 && b <= 31) return false;
		if (a === 192 && b === 168) return false;
	}
	return true;
}

/** The API path segment: `earring` is singular (API-NOTES §2.5). */
function accessoryItem(category: AccessoryCategory): string {
	return category === 'earrings' ? 'earring' : category;
}

/**
 * The `parameter` object. Only `<item>_need_remove_background` is sent: it is the documented,
 * live-verified default for earring/necklace. INFERRED for ring/bracelet/watch (same key pattern
 * seen in other projects' code; omit `parameter` entirely if one of them rejects it).
 */
function accessoryParameter(item: string): Record<string, unknown> {
	return { [`${item}_need_remove_background`]: true };
}

export async function tryOnAccessory(
	ctx: FeatureContext,
	input: { person: Asset; category: AccessoryCategory; product: Asset; productUrl?: string }
): Promise<FeatureResult> {
	const item = accessoryItem(input.category);
	return runImageFeature(ctx, {
		feature: 'accessory',
		label: `${input.category} try-on`,
		path: taskPath(`2d-vto/${item}`),
		kind: 'result',
		build: async () => {
			const src = await imageRef(input.person, 'accessory', 'accessory');
			// A public product URL goes straight to YouCam; otherwise upload our stored copy.
			const ref: ImageRef = isPublicHttpUrl(input.productUrl)
				? { value: input.productUrl, kind: 'url' }
				: await imageRef(input.product, 'accessory', 'accessory');
			return {
				...refField('src', src),
				[ref.kind === 'url' ? 'ref_file_urls' : 'ref_file_ids']: [ref.value],
				source_info: { name: src.value },
				// One entry only: more would be priced as "stacked".
				object_infos: [{ name: ref.value, parameter: accessoryParameter(item) }]
			};
		}
	});
}

/* --------------------------------------------------------------- face analysis */

/**
 * Skin tone (20 units) then face attributes (10 units), sequentially, on the analysis crop.
 * All 30 units are reserved up front so a cap error cannot strike between the two. If the second
 * task fails after the first succeeded, the skin-tone part is returned (it was paid for).
 */
export async function analyzeFace(
	ctx: FeatureContext,
	input: { portrait: Asset; faceBox?: FaceBox }
): Promise<FaceProfile> {
	const reservation = reserve(ctx.session, UNIT_COSTS.skin_tone + UNIT_COSTS.face_attributes);
	try {
		const ref = await imageRef(input.portrait, 'analysis', 'skin_tone', { faceBox: input.faceBox });
		const skin = await runTask({
			session: ctx.session,
			reservation,
			feature: 'skin_tone',
			units: UNIT_COSTS.skin_tone,
			path: taskPath('skin-tone-analysis'),
			body: { ...refField('src', ref), face_angle_strictness_level: 'medium' }
		});
		const profile = mapSkinTone(skin.results);
		try {
			const attrs = await runTask({
				session: ctx.session,
				reservation,
				feature: 'face_attributes',
				units: UNIT_COSTS.face_attributes,
				path: taskPath('face-attr-analysis'),
				body: {
					...refField('src', ref),
					features: [...FACE_ATTR_FEATURES],
					face_angle_strictness_level: 'medium'
				}
			});
			const mapped = mapFaceAttributes(attrs.results);
			profile.faceShape = mapped.faceShape;
			profile.features = { ...profile.features, ...mapped.features };
		} catch (err) {
			if (!(err instanceof YouCamTaskError)) throw err;
			// Keep the paid-for skin tone; the ledger already shows the failed attributes task.
		}
		return { features: {}, ...profile };
	} finally {
		reservation.release();
	}
}

/* ------------------------------------------------------------ text to image */

const GENERATION_NEGATIVE = 'person, face, hands, mannequin, text, watermark, cropped';

export async function generateGarmentImage(
	ctx: FeatureContext,
	input: { prompt: string }
): Promise<FeatureResult> {
	return runImageFeature(ctx, {
		feature: 'image_generation',
		label: 'Garment design',
		path: taskPath('text-to-image/youcam'),
		kind: 'generated',
		build: async () => ({
			model: 'youcam-image-v2',
			prompt: input.prompt,
			negative_prompt: GENERATION_NEGATIVE,
			size: '1104*1472', // portrait; literal "*" separator
			prompt_extend: false
		})
	});
}
