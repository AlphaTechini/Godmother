// Puts the finished head from the portrait onto the full-body shot, because the video API takes one
// image and the full-body shot still has the original hair.

import sharp from 'sharp';

/** Fractions of the image, from the top left corner. */
export interface HeadBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

const PAD = 0.1;
/** How far a pixel must sit from the wall colour before it starts counting as the person. */
const WALL_NEAR = 22;
const WALL_RANGE = 26;
/** Fades out below the chin so the full-body shot keeps its own neck and collar. */
const FADE_START = 0.8;
const FADE_END = 0.93;
/** The cut-out only works against a plain wall; above this the corners are too busy to trust. */
const MAX_WALL_SPREAD = 18;

/** The composited JPEG, or undefined when the portrait's background is too busy to cut out cleanly. */
export async function pasteHead(
	fullBytes: Uint8Array,
	faceBytes: Uint8Array,
	onFull: HeadBox,
	onFace: HeadBox
): Promise<Buffer | undefined> {
	const full = await sharp(fullBytes).rotate().removeAlpha().toBuffer({ resolveWithObject: true });
	const face = await sharp(faceBytes).rotate().removeAlpha().toBuffer({ resolveWithObject: true });
	const [fullW, fullH] = [full.info.width, full.info.height];
	const [faceW, faceH] = [face.info.width, face.info.height];

	const left = Math.max(0, Math.round((onFace.x - onFace.width * PAD) * faceW));
	const top = Math.max(0, Math.round((onFace.y - onFace.height * PAD) * faceH));
	const width = Math.min(faceW - left, Math.round(onFace.width * (1 + 2 * PAD) * faceW));
	const height = Math.min(faceH - top, Math.round(onFace.height * (1 + 2 * PAD) * faceH));
	const tH = Math.round(onFull.height * (1 + 2 * PAD) * fullH);
	const tW = Math.round((tH * width) / height);
	const x0 = Math.round((onFull.x + onFull.width / 2) * fullW - tW / 2);
	const y0 = Math.max(0, Math.round((onFull.y + onFull.height / 2) * fullH - tH / 2));
	if (tW < 8 || tH < 8 || x0 < 0 || x0 + tW > fullW || y0 + tH > fullH) return undefined;

	const rgb = await sharp(face.data)
		.extract({ left, top, width, height })
		.resize(tW, tH)
		.raw()
		.toBuffer();

	const samples: number[][] = [];
	const corner = Math.round(tW * 0.12);
	for (let y = 0; y < corner; y++) {
		for (const start of [0, tW - corner]) {
			for (let x = start; x < start + corner; x++) {
				const i = (y * tW + x) * 3;
				samples.push([rgb[i], rgb[i + 1], rgb[i + 2]]);
			}
		}
	}
	const wall = [0, 1, 2].map((c) => samples.reduce((sum, s) => sum + s[c], 0) / samples.length);
	const spread =
		samples.reduce(
			(sum, s) => sum + Math.hypot(s[0] - wall[0], s[1] - wall[1], s[2] - wall[2]),
			0
		) / samples.length;
	if (spread > MAX_WALL_SPREAD) return undefined;

	const alpha = Buffer.alloc(tW * tH);
	for (let y = 0; y < tH; y++) {
		for (let x = 0; x < tW; x++) {
			const i = (y * tW + x) * 3;
			const dist = Math.hypot(rgb[i] - wall[0], rgb[i + 1] - wall[1], rgb[i + 2] - wall[2]);
			let v = Math.min(1, Math.max(0, (dist - WALL_NEAR) / WALL_RANGE));
			// Without this, a stray line at the crop's edge survives as a hard stripe above the head.
			v *= Math.min(1, Math.min(y, x, tW - 1 - x) / (tH * 0.05));
			const fy = y / tH;
			if (fy > FADE_START) v *= Math.max(0, 1 - (fy - FADE_START) / (FADE_END - FADE_START));
			alpha[y * tW + x] = Math.round(v * 255);
		}
	}
	const mask = await sharp(alpha, { raw: { width: tW, height: tH, channels: 1 } })
		.blur(1.6)
		.extractChannel(0)
		.raw()
		.toBuffer();
	const rgba = Buffer.alloc(tW * tH * 4);
	for (let p = 0; p < tW * tH; p++) {
		rgba[p * 4] = rgb[p * 3];
		rgba[p * 4 + 1] = rgb[p * 3 + 1];
		rgba[p * 4 + 2] = rgb[p * 3 + 2];
		rgba[p * 4 + 3] = mask[p];
	}
	const head = await sharp(rgba, { raw: { width: tW, height: tH, channels: 4 } })
		.png()
		.toBuffer();
	return sharp(full.data)
		.composite([{ input: head, left: x0, top: y0 }])
		.jpeg({ quality: 94 })
		.toBuffer();
}
