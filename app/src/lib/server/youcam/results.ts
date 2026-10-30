// Result download: YouCam URLs expire after 2 h and are served as binary/octet-stream, so we
// download at once, sniff the type from the magic bytes and store the image as one of our assets.

import sharp from 'sharp';
import { saveAsset } from '#lib/server/store';
import type { Asset, AssetKind } from '#lib/types';
import { pollSchedule, rawFetch, sleep } from './client';
import { YouCamTaskError } from './errors';

export function sniffImage(b: Uint8Array): 'image/png' | 'image/jpeg' | null {
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
		return 'image/png';
	}
	return null;
}

export interface StoreResultOptions {
	url: string;
	feature: string;
	kind: AssetKind;
	label: string;
	sessionId: string;
	taskId?: string;
	/** Makeup returns PNG with alpha: flatten onto white and store as JPEG. */
	flattenToJpeg?: boolean;
}

export async function downloadBytes(
	url: string,
	feature: string,
	taskId?: string
): Promise<Uint8Array> {
	let lastError = '';
	for (let attempt = 0; attempt < 3; attempt++) {
		if (attempt > 0) await sleep(pollSchedule().downloadRetryMs * attempt);
		try {
			const res = await rawFetch(url); // no Authorization header: the URL is pre-signed
			if (res.ok) return new Uint8Array(await res.arrayBuffer());
			lastError = `HTTP ${res.status}`;
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		}
	}
	// The task succeeded and was charged; the ledger already records that.
	throw new YouCamTaskError(
		'download_failed',
		'The image was rendered but we could not fetch it from YouCam. Try again.',
		feature,
		{ taskId, details: [lastError] }
	);
}

/** Downloads a result and saves it into the asset store. */
export async function storeResult(o: StoreResultOptions): Promise<Asset> {
	let bytes = await downloadBytes(o.url, o.feature, o.taskId);
	let mime = sniffImage(bytes);
	if (!mime) {
		throw new YouCamTaskError(
			'bad_result',
			'YouCam returned something that is not an image. Try again.',
			o.feature,
			{ taskId: o.taskId }
		);
	}
	if (o.flattenToJpeg && mime === 'image/png') {
		bytes = await sharp(Buffer.from(bytes))
			.flatten({ background: '#ffffff' })
			.jpeg({ quality: 92 })
			.toBuffer();
		mime = 'image/jpeg';
	}
	return saveAsset({
		bytes,
		mime,
		kind: o.kind,
		label: o.label,
		sessionId: o.sessionId
	});
}
