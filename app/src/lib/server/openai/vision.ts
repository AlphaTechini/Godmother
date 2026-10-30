// Turns stored assets into model input (images as downscaled base64 data URLs, PDFs as input_file).

import sharp from 'sharp';
import { readAsset } from '#lib/server/store';
import type { ResponseInputContent } from 'openai/resources/responses/responses';

const MAX_SIDE = 1600;
/** Larger raw files are never sent when downscaling fails. */
const MAX_RAW_BYTES = 8 * 1024 * 1024;

function dataUrl(mime: string, bytes: Uint8Array): string {
	return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/**
 * The model input part for a stored asset, or null when it cannot be read or decoded.
 * Images are rotated per EXIF and shrunk to at most 1600px on the long side (JPEG).
 */
export async function assetInputPart(
	assetId: string,
	opts: { detail?: 'low' | 'high' | 'auto'; filename?: string } = {}
): Promise<ResponseInputContent | null> {
	const asset = await readAsset(assetId);
	if (!asset) return null;
	const detail = opts.detail ?? 'auto';

	if (asset.mime === 'application/pdf') {
		return {
			type: 'input_file',
			filename: opts.filename ?? `${assetId}.pdf`,
			file_data: dataUrl('application/pdf', asset.bytes)
		};
	}
	if (!asset.mime.startsWith('image/')) return null;

	try {
		const jpeg = await sharp(Buffer.from(asset.bytes), { failOn: 'none' })
			.rotate()
			.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
			.flatten({ background: '#ffffff' })
			.jpeg({ quality: 85 })
			.toBuffer();
		return { type: 'input_image', detail, image_url: dataUrl('image/jpeg', jpeg) };
	} catch {
		// HEIC without a decoder, for example. Pass web-safe formats through if they are small enough.
		const passthrough = ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mime);
		if (passthrough && asset.bytes.byteLength <= MAX_RAW_BYTES) {
			return { type: 'input_image', detail, image_url: dataUrl(asset.mime, asset.bytes) };
		}
		return null;
	}
}
