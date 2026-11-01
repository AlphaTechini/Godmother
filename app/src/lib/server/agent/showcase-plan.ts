// Prepares a showcase video before any units are spent: the starting frame, then the prompt. The
// camera direction never changes; the description of the person is written fresh from the pictures.

import { pasteHead, type HeadBox } from '#lib/server/images/head-paste';
import { assetInputPart, type InputPart } from '#lib/server/llm';
import { readAsset, saveAsset } from '#lib/server/store';
import type { Asset, Session, ShowcasePlan } from '#lib/types';
import { obj } from './tools/schemas';
import { isRec, type ToolEnv } from './tools/types';
import { plainAsset } from './tools/youcam-errors';

const MAX_PROMPT = 1500;
const ACCESSORY_ROLES = ['watch', 'ring', 'bracelet', 'necklace', 'earrings'];

const CAMERA_PROMPT =
	'Cinematic fashion film. One continuous take. The person stands in one spot and does not walk. ' +
	'First the camera zooms straight in to a tight close-up of the face and holds it, then zooms back out to the full body. ' +
	'Then only the camera moves: it travels in a circle around the standing person, seeing their side, their back, their other side, then their front again, with the room passing behind them. ' +
	'Finally the camera pushes in on the hand and ends there.';

const NEGATIVE_PROMPT =
	'walking, striding, stepping forward, person turning instead of the camera, close-ups of fabric, blurry frames, different face, different hair, changed clothes, changed colours, extra jewellery, distorted hands, text, watermark';

const num = { type: 'number' };
const box = () => obj({ x: num, y: num, width: num, height: num });

const HEADS_SCHEMA = obj({ onFull: box(), onFace: box() });

const BRIEF_SCHEMA = obj({
	brief: { type: 'string' },
	notWearing: { type: 'string', description: 'Comma separated.' }
});

const asBox = (v: unknown): HeadBox | undefined =>
	isRec(v) &&
	[v.x, v.y, v.width, v.height].every((n) => typeof n === 'number' && n >= 0 && n <= 1) &&
	(v.width as number) > 0 &&
	(v.height as number) > 0
		? (v as unknown as HeadBox)
		: undefined;

/** The full-body shot with the finished head on it, or the plain shot when that can't be done cleanly. */
async function startingFrame(env: ToolEnv, full: Asset, face: Asset | undefined): Promise<Asset> {
	if (!face) return full;
	try {
		const [fullPart, facePart, fullStored, faceStored] = await Promise.all([
			assetInputPart(full.id, { detail: 'high' }),
			assetInputPart(face.id, { detail: 'high' }),
			readAsset(full.id),
			readAsset(face.id)
		]);
		if (!fullPart || !facePart || !fullStored || !faceStored) return full;
		const res = await env.model.ask({
			tier: 'main',
			system:
				'You locate heads in photos. Give a tight box around the whole head including all hair, from the top of the hair to the bottom of the chin, ear to ear, as fractions of that image.',
			input: [
				{ type: 'text', text: 'onFull: this full-body shot.' },
				fullPart,
				{ type: 'text', text: 'onFace: this portrait.' },
				facePart
			],
			schema: HEADS_SCHEMA
		});
		const onFull = isRec(res.json) ? asBox(res.json.onFull) : undefined;
		const onFace = isRec(res.json) ? asBox(res.json.onFace) : undefined;
		if (!onFull || !onFace) return full;
		const bytes = await pasteHead(fullStored.bytes, faceStored.bytes, onFull, onFace);
		if (!bytes) return full;
		const saved = await saveAsset({
			bytes,
			mime: 'image/jpeg',
			kind: 'result',
			sessionId: env.session.id,
			label: 'Starting frame for the video'
		});
		return plainAsset(saved);
	} catch (err) {
		console.error('[agent] showcase starting frame failed', err);
		return full;
	}
}

async function describePerson(
	env: ToolEnv,
	session: Session,
	start: Asset
): Promise<{ brief: string; notWearing: string } | undefined> {
	const lb = session.lookbook;
	const look = session.looks.find((l) => l.id === lb?.lookId);
	const pictures: [string, Asset | undefined][] = [
		['The full-body shot, the first frame of the video.', start],
		['The portrait panel: final hair and face.', lb?.face],
		['The hand panel: what is actually worn on the hand.', lb?.hand],
		...(look?.pieces ?? [])
			.filter((p) => ACCESSORY_ROLES.includes(p.role))
			.map((p): [string, Asset | undefined] => [
				`Product photo of the ${p.role}: ${p.name}.`,
				p.image
			])
	];
	const input: InputPart[] = [];
	for (const [label, asset] of pictures) {
		const part = asset && (await assetInputPart(asset.id, { detail: 'high' }));
		if (part) input.push({ type: 'text', text: label }, part);
	}
	const limit = MAX_PROMPT - CAMERA_PROMPT.length - 42;
	input.push({ type: 'text', text: 'Write the brief.' });
	const res = await env.model.ask({
		tier: 'main',
		system: `You brief a video model that cannot see these photos. Write what the person must look like. Rules:
- Name the exact colour of every item, as a precise colour word a painter would use, plus a hex code read from the photo. Never write a vague colour. Where a product name disagrees with a photo, trust the photo.
- Cover: hair, skin tone, each garment, shoes, and each accessory actually worn (say which wrist or finger).
- End with one sentence listing every colour allowed and saying no other colours may appear on the person.
- In notWearing, list accessories this person does NOT wear, from: ring, bracelet, watch, necklace, earrings, by checking the photos closely.
- Plain sentences. No camera or movement directions. The brief must be under ${limit} characters.`,
		input,
		schema: BRIEF_SCHEMA
	});
	if (!isRec(res.json) || typeof res.json.brief !== 'string' || !res.json.brief.trim()) {
		return undefined;
	}
	const notWearing = typeof res.json.notWearing === 'string' ? res.json.notWearing.trim() : '';
	return { brief: res.json.brief.trim(), notWearing };
}

/** The saved plan, or a new one. Undefined means the person couldn't be described: spend nothing. */
export async function showcasePlan(env: ToolEnv): Promise<ShowcasePlan | undefined> {
	const { session } = env;
	const lb = session.lookbook;
	if (!lb?.full) return undefined;
	if (lb.videoPlan) return lb.videoPlan;
	const start = await startingFrame(env, lb.full, lb.face);
	const person = await describePerson(env, session, start).catch((err) => {
		console.error('[agent] showcase brief failed', err);
		return undefined;
	});
	if (!person) return undefined;
	const plan: ShowcasePlan = {
		start,
		prompt: `${CAMERA_PROMPT} ${person.brief}`.slice(0, MAX_PROMPT),
		negativePrompt: person.notWearing ? `${NEGATIVE_PROMPT}, ${person.notWearing}` : NEGATIVE_PROMPT
	};
	// Kept so a resumed request matches its YouCam task exactly and isn't charged twice.
	lb.videoPlan = plan;
	await env.ctx.sessionChanged();
	return plan;
}
