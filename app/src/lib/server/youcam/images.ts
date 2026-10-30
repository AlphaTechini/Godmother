// Per-feature input images (API-NOTES §1.5, §5.2): one stored Asset cannot satisfy every YouCam
// feature, so each feature gets its own JPEG derived with sharp. Variants are produced on demand
// (only when the file is not already uploaded; see files.ts) and are not kept on disk.

import sharp from 'sharp';
import { readAsset } from '#lib/server/store';
import type { Asset } from '#lib/types';
import { YouCamTaskError } from './errors';

export type Variant = 'clothes' | 'makeup' | 'hair' | 'analysis' | 'accessory';

/** A face box in fractions of the (EXIF-rotated) image: x, y = top-left, 0..1. */
export interface FaceBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface VariantOptions {
	/** From a vision model; only used by the 'analysis' variant. Without it we use a heuristic. */
	faceBox?: FaceBox;
}

/** Long-side limits (px) per variant. */
export const LONG_SIDE: Record<Variant, number> = {
	clothes: 2048,
	makeup: 1536,
	hair: 1024,
	analysis: 1280,
	accessory: 2048
};

const MAX_UPLOAD_BYTES = 9.5 * 1024 * 1024; // YouCam: images must be under 10 MB.
const ANALYSIS_MIN_SIDE = 320;

/** Cache key part for a variant (a face box changes the output, so it is part of the key). */
export function variantKey(variant: Variant, opts: VariantOptions = {}): string {
	const b = opts.faceBox;
	if (variant !== 'analysis' || !b) return variant;
	return `analysis@${[b.x, b.y, b.width, b.height].map((n) => n.toFixed(3)).join(',')}`;
}

export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/**
 * THE ANALYSIS CROP. Skin tone and face attributes need the face to fill more than 60% of the
 * image width (API-NOTES §1.5); a normal portrait has the face at 30-45%. We have no face detector,
 * so without a `faceBox` this is a heuristic:
 *  - portrait or square photo: take the top-centre region, 55% of the width, 4:5 (w:h), starting at
 *    the top edge (heads sit in the upper part of a portrait, and the face then fills ~65-80%);
 *  - landscape photo: full height (at most 55% of the width), centred horizontally.
 * With a `faceBox` (fractions of the image, e.g. from a vision model) the crop is centred on the
 * face and sized so the face is ~64% of the crop width, clamped to the image.
 * Replace or refine ONLY this function.
 */
export function analysisCropRect(width: number, height: number, faceBox?: FaceBox): Rect {
	const ASPECT = 1.25; // height / width
	if (faceBox && faceBox.width > 0 && faceBox.height > 0) {
		const faceW = faceBox.width * width;
		const cx = (faceBox.x + faceBox.width / 2) * width;
		const cy = (faceBox.y + faceBox.height / 2) * height;
		let w = Math.min(width, faceW / 0.64);
		let h = w * ASPECT;
		if (h > height) {
			h = height;
			w = Math.min(w, h / ASPECT);
		}
		const left = clamp(cx - w / 2, 0, width - w);
		const top = clamp(cy - h / 2, 0, height - h);
		return rect(left, top, w, h, width, height);
	}
	let w = width * 0.55;
	let h = w * ASPECT;
	if (h > height) {
		h = height;
		w = h / ASPECT;
	}
	const left = (width - w) / 2;
	const top = height > width ? 0 : (height - h) / 2;
	return rect(left, top, w, h, width, height);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function rect(l: number, t: number, w: number, h: number, W: number, H: number): Rect {
	const left = clamp(Math.round(l), 0, W - 1);
	const top = clamp(Math.round(t), 0, H - 1);
	return {
		left,
		top,
		width: clamp(Math.round(w), 1, W - left),
		height: clamp(Math.round(h), 1, H - top)
	};
}

export interface PreparedImage {
	bytes: Buffer;
	width: number;
	height: number;
}

const UNREADABLE =
	'We could not read that photo. Please upload a JPEG or PNG (iPhone HEIC photos are not supported; export as JPEG).';

/** Derives the variant of an asset. Throws YouCamTaskError for unreadable or missing images. */
export async function prepareVariant(
	asset: Asset,
	variant: Variant,
	feature: string,
	opts: VariantOptions = {}
): Promise<PreparedImage> {
	const stored = await readAsset(asset.id);
	if (!stored) {
		throw new YouCamTaskError(
			'asset_missing',
			'We cannot find that image any more. Please upload it again.',
			feature
		);
	}
	const input = Buffer.from(stored.bytes);
	try {
		const meta = await sharp(input).metadata();
		let w = meta.width ?? 0;
		let h = meta.height ?? 0;
		if (!w || !h) throw new Error('no dimensions');
		// EXIF orientations 5-8 swap the axes; .rotate() below applies it.
		if ((meta.orientation ?? 1) >= 5) [w, h] = [h, w];

		const long = LONG_SIDE[variant];
		for (const quality of [90, 78, 65]) {
			let img = sharp(input).rotate().toColourspace('srgb');
			if (variant === 'analysis') {
				const r = analysisCropRect(w, h, opts.faceBox);
				img = img.extract(r);
				// One resize only (sharp keeps the last): each side must be >= 320 px, long side <= cap.
				const small = Math.min(r.width, r.height);
				const k =
					small < ANALYSIS_MIN_SIDE
						? ANALYSIS_MIN_SIDE / small
						: Math.max(r.width, r.height) > long
							? long / Math.max(r.width, r.height)
							: 1;
				if (k !== 1) {
					img = img.resize({
						width: Math.max(1, Math.round(r.width * k)),
						height: Math.max(1, Math.round(r.height * k)),
						fit: 'fill',
						kernel: 'lanczos3'
					});
				}
			} else {
				img = img.resize({ width: long, height: long, fit: 'inside', withoutEnlargement: true });
			}
			const { data, info } = await img
				.flatten({ background: '#ffffff' })
				.jpeg({ quality, mozjpeg: true })
				.toBuffer({ resolveWithObject: true });
			if (data.byteLength <= MAX_UPLOAD_BYTES || quality === 65) {
				return { bytes: data, width: info.width, height: info.height };
			}
		}
		throw new Error('unreachable');
	} catch (err) {
		if (err instanceof YouCamTaskError) throw err;
		const heic = stored.mime === 'image/heic';
		throw new YouCamTaskError('unsupported_image', UNREADABLE, feature, {
			details: [`${heic ? 'HEIC' : stored.mime}: ${err instanceof Error ? err.message : err}`]
		});
	}
}
