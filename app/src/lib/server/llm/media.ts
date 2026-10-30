// Turns stored assets into model input (images as downscaled base64 JPEGs, PDFs as documents).

import sharp from 'sharp';
import { readAsset } from '#lib/server/store';
import type { InputPart } from './types';

/** Per-photo checks do not need detail, and image tokens grow with pixel count. */
const SIDE_FOR_DETAIL = { low: 768, high: 1568 } as const;
/** Larger raw files are never sent when downscaling fails. */
const MAX_RAW_BYTES = 5 * 1024 * 1024;

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/**
 * The model input part for a stored asset, or null when it cannot be read or decoded.
 * Images are rotated per EXIF and shrunk to fit the requested detail (JPEG).
 */
export async function assetInputPart(
	assetId: string,
	opts: { detail?: 'low' | 'high'; filename?: string } = {}
): Promise<InputPart | null> {
	const asset = await readAsset(assetId);
	if (!asset) return null;

	if (asset.mime === 'application/pdf') {
		return {
			type: 'pdf',
			base64: base64(asset.bytes),
			filename: opts.filename ?? `${assetId}.pdf`
		};
	}
	if (!asset.mime.startsWith('image/')) return null;

	const side = SIDE_FOR_DETAIL[opts.detail ?? 'high'];
	try {
		const jpeg = await sharp(Buffer.from(asset.bytes), { failOn: 'none' })
			.rotate()
			.resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
			.flatten({ background: '#ffffff' })
			.jpeg({ quality: 85 })
			.toBuffer();
		return { type: 'image', mediaType: 'image/jpeg', base64: base64(jpeg) };
	} catch {
		// HEIC without a decoder, for example. Pass web-safe formats through if they are small enough.
		const mime = asset.mime;
		if (
			(mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') &&
			asset.bytes.byteLength <= MAX_RAW_BYTES
		) {
			return { type: 'image', mediaType: mime, base64: base64(asset.bytes) };
		}
		return null;
	}
}
