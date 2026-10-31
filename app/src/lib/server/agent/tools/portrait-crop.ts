// The face panel's backup: when YouCam can't put the outfit on the portrait, cut the head and
// shoulders out of the full-look render, so makeup and hair still go on the right clothes.

import sharp from 'sharp';
import { assetInputPart } from '#lib/server/llm';
import { readAsset, saveAsset } from '#lib/server/store';
import type { Asset } from '#lib/types';
import { obj } from './schemas';
import { isRec, type ToolEnv } from './types';
import { plainAsset } from './youcam-errors';

const percent = (description: string) => ({ type: 'number', description });

const BOX_SCHEMA = obj({
	found: { type: 'boolean', description: 'False when no single person is clearly visible.' },
	left: percent('Left edge, as a percentage of the image width.'),
	top: percent('Top edge, as a percentage of the image height.'),
	right: percent('Right edge, as a percentage of the image width.'),
	bottom: percent('Bottom edge, as a percentage of the image height.')
});

/** Far-away faces are small in a full-body render, and hair needs a face at least 128 px wide. */
const MIN_CROP_WIDTH = 1000;
const MARGIN = 0.05;

const fraction = (v: unknown) =>
	typeof v === 'number' && v >= 0 && v <= 100 ? v / 100 : undefined;

/** The cropped portrait, or undefined when it can't be made. Never throws. */
export async function headAndShouldersCrop(
	env: ToolEnv,
	render: Asset
): Promise<Asset | undefined> {
	try {
		const part = await assetInputPart(render.id, { detail: 'high' });
		const stored = await readAsset(render.id);
		if (!part || !stored) return undefined;
		const res = await env.model.ask({
			tier: 'fast',
			system:
				"You locate one person in a photo. Give the box around their head and shoulders: from just above the hair to just below the shoulders, including the outfit's neckline.",
			input: [{ type: 'text', text: 'Find the head and shoulders.' }, part],
			schema: BOX_SCHEMA
		});
		const box = res.json;
		if (!isRec(box) || box.found !== true) return undefined;
		const [l, t, r, b] = [box.left, box.top, box.right, box.bottom].map(fraction);
		if (l === undefined || t === undefined || r === undefined || b === undefined) return undefined;
		if (r <= l || b <= t) return undefined;

		const image = sharp(Buffer.from(stored.bytes)).rotate();
		const { data, info } = await image.toBuffer({ resolveWithObject: true });
		const left = Math.round(Math.max(0, l - MARGIN) * info.width);
		// Extra headroom: the box can clip the hair, and the hair step needs the whole head in frame.
		const top = Math.round(Math.max(0, t - MARGIN - (b - t) * 0.25) * info.height);
		const width = Math.round(Math.min(1, r + MARGIN) * info.width) - left;
		const height = Math.round(Math.min(1, b + MARGIN) * info.height) - top;
		const bytes = await sharp(data)
			.extract({ left, top, width, height })
			.resize({ width: Math.max(width, MIN_CROP_WIDTH), kernel: 'lanczos3' })
			.flatten({ background: '#ffffff' })
			.jpeg({ quality: 90, mozjpeg: true })
			.toBuffer();
		const saved = await saveAsset({
			bytes,
			mime: 'image/jpeg',
			kind: 'result',
			sessionId: env.session.id,
			label: 'Head and shoulders from the full look'
		});
		return plainAsset(saved);
	} catch (err) {
		console.error('[agent] portrait crop failed', err);
		return undefined;
	}
}
