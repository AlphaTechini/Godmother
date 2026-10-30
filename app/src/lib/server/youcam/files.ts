// File API upload with caching (API-NOTES §1.4) and the chain-by-URL registry.
//
// A file id is cached per (assetId, variant) in memory and in DATA_DIR/youcam-files.json for 29 days
// (YouCam keeps them 30), so restarts do not re-upload. Concurrent requests for the same key share
// one upload (several looks start from the same person photo).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '#lib/server/config';
import type { Asset } from '#lib/types';
import { apiRequest, pollSchedule, rawFetch, sleep } from './client';
import { toTaskError, YouCamHttpError, YouCamNetworkError, YouCamTaskError } from './errors';
import { prepareVariant, variantKey, type Variant, type VariantOptions } from './images';

export const FILE_ID_TTL_MS = 29 * 24 * 60 * 60 * 1000;
/** A YouCam result URL stays valid 2 h; reuse it for chaining only within 100 minutes. */
export const CHAIN_URL_TTL_MS = 100 * 60 * 1000;

interface CacheEntry {
	fileId: string;
	at: number;
}

let memory = new Map<string, CacheEntry>();
let loaded: Promise<void> | undefined;
let writeChain: Promise<void> = Promise.resolve();
const inflight = new Map<string, Promise<string>>();

const cachePath = () => join(config.dataDir, 'youcam-files.json');

function load(): Promise<void> {
	loaded ??= (async () => {
		try {
			const raw = JSON.parse(await readFile(cachePath(), 'utf8')) as Record<string, CacheEntry>;
			for (const [k, v] of Object.entries(raw)) {
				if (v && typeof v.fileId === 'string' && typeof v.at === 'number' && !memory.has(k)) {
					memory.set(k, v);
				}
			}
		} catch {
			/* no cache yet, or unreadable: start empty */
		}
	})();
	return loaded;
}

function persist(): Promise<void> {
	const now = Date.now();
	const snapshot: Record<string, CacheEntry> = {};
	for (const [k, v] of memory) if (now - v.at < FILE_ID_TTL_MS) snapshot[k] = v;
	writeChain = writeChain
		.then(async () => {
			const path = cachePath();
			await mkdir(dirname(path), { recursive: true });
			const tmp = `${path}.${process.pid}.tmp`;
			await writeFile(tmp, JSON.stringify(snapshot));
			await rename(tmp, path);
		})
		.catch(() => {
			/* a cache write failure only costs a re-upload */
		});
	return writeChain;
}

/** Forgets the in-memory state (tests, or to simulate a restart). The disk file is kept. */
export function resetFileCache(opts: { clearDisk?: boolean } = {}): void {
	memory = new Map();
	loaded = undefined;
	inflight.clear();
	if (opts.clearDisk)
		writeChain = writeChain.then(() => writeFile(cachePath(), '{}')).catch(() => {});
}

/** Waits for pending cache writes (tests). */
export function flushFileCache(): Promise<void> {
	return writeChain;
}

async function retryTransient<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
	let last: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			last = err;
			const transient =
				err instanceof YouCamNetworkError ||
				(err instanceof YouCamHttpError && (err.status === 429 || err.status >= 500)) ||
				(err instanceof UploadHttpError && (err.status === 429 || err.status >= 500));
			if (!transient || i === attempts - 1) break;
			await sleep(pollSchedule().downloadRetryMs * (i + 1));
		}
	}
	throw last;
}

class UploadHttpError extends Error {
	constructor(readonly status: number) {
		super(`Upload failed: HTTP ${status}`);
	}
}

/** Uploads bytes through the universal File API and returns the file id. */
async function uploadBytes(bytes: Buffer, fileName: string, feature: string): Promise<string> {
	const contentType = 'image/jpg'; // what the docs use; the PUT must repeat the returned headers
	try {
		const res = await retryTransient(() =>
			apiRequest(
				'POST',
				'/s2s/v2.0/file',
				{
					files: [{ content_type: contentType, file_name: fileName, file_size: bytes.byteLength }]
				},
				feature
			)
		);
		const file = res.data?.files?.[0];
		const req = file?.requests?.[0];
		if (!file?.file_id || !req?.url) {
			throw new YouCamTaskError(
				'bad_response',
				'YouCam did not accept the upload. Try again.',
				feature
			);
		}
		await retryTransient(async () => {
			let put: Response;
			try {
				// Exactly the returned headers; NO Authorization header to S3.
				put = await rawFetch(req.url, {
					method: req.method ?? 'PUT',
					headers: req.headers ?? {
						'Content-Type': contentType,
						'Content-Length': String(bytes.byteLength)
					},
					body: new Uint8Array(bytes)
				});
			} catch (err) {
				throw new YouCamNetworkError(err instanceof Error ? err.message : String(err));
			}
			if (!put.ok) throw new UploadHttpError(put.status);
		});
		return file.file_id as string;
	} catch (err) {
		if (err instanceof UploadHttpError) {
			throw new YouCamTaskError(
				'upload_failed',
				'Could not upload the photo to YouCam. Try again.',
				feature,
				{ details: [err.message] }
			);
		}
		throw toTaskError(err, feature);
	}
}

/** File id of (asset, variant): from cache, or prepared and uploaded once. */
export async function getFileId(
	asset: Asset,
	variant: Variant,
	feature: string,
	opts: VariantOptions = {}
): Promise<string> {
	await load();
	const key = `${asset.id}:${variantKey(variant, opts)}`;
	const hit = memory.get(key);
	if (hit && Date.now() - hit.at < FILE_ID_TTL_MS) return hit.fileId;
	const pending = inflight.get(key);
	if (pending) return pending;
	const job = (async () => {
		const img = await prepareVariant(asset, variant, feature, opts);
		const fileId = await uploadBytes(img.bytes, `${variant}-${asset.id.slice(0, 8)}.jpg`, feature);
		memory.set(key, { fileId, at: Date.now() });
		await persist();
		return fileId;
	})().finally(() => inflight.delete(key));
	inflight.set(key, job);
	return job;
}

/* ------------------------------------------------------------------ chaining */

const resultUrls = new Map<string, { url: string; at: number }>();

/** Remember the YouCam URL a stored result came from (for chainMode 'url'). */
export function rememberResultUrl(assetId: string, url: string): void {
	resultUrls.set(assetId, { url, at: Date.now() });
}

export function resetChainUrls(): void {
	resultUrls.clear();
}

/** A fresh YouCam URL for this asset when chainMode is 'url', else undefined. */
export function chainUrlFor(assetId: string): string | undefined {
	if (config.youcam.chainMode !== 'url') return undefined;
	const hit = resultUrls.get(assetId);
	if (!hit) return undefined;
	if (Date.now() - hit.at >= CHAIN_URL_TTL_MS) {
		resultUrls.delete(assetId);
		return undefined;
	}
	return hit.url;
}

export interface ImageRef {
	/** The value to send (file id or URL), also the `name` in 2D VTO bodies. */
	value: string;
	kind: 'id' | 'url';
}

/** How a task refers to one of our assets: a chained result URL, else an uploaded file id. */
export async function imageRef(
	asset: Asset,
	variant: Variant,
	feature: string,
	opts: VariantOptions = {}
): Promise<ImageRef> {
	const url = chainUrlFor(asset.id);
	if (url) return { value: url, kind: 'url' };
	return { value: await getFileId(asset, variant, feature, opts), kind: 'id' };
}

/** `{src_file_id}` or `{src_file_url}` etc. */
export function refField(prefix: 'src' | 'ref', ref: ImageRef): Record<string, string> {
	return { [`${prefix}_file_${ref.kind}`]: ref.value };
}
