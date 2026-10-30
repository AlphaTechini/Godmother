// Images on disk: DATA_DIR/assets/<id>.<ext> + <id>.json sidecar. Demo assets are read-only files under demo/assets.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { imageSize } from 'image-size';
import { config } from '#lib/server/config';
import type { Asset, AssetKind } from '#lib/types';
import { assetsDir, isDemoAssetId, isUuid } from './paths';

/** Error with an HTTP status the routes can pass on. */
export class AssetError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 413 | 415 | 502 = 400
	) {
		super(message);
		this.name = 'AssetError';
	}
}

/** Asset plus bookkeeping kept in the sidecar. */
export interface StoredAsset extends Asset {
	sessionId?: string;
	createdAt?: string;
}

const EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/heic': 'heic',
	'image/svg+xml': 'svg'
};
const MIME_BY_EXT: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	heic: 'image/heic',
	svg: 'image/svg+xml'
};
const DEMO_EXTS = ['svg', 'png', 'jpg', 'jpeg', 'webp'];

export const ALLOWED_MIMES = Object.keys(EXT_BY_MIME);

/** Lower-cases, strips parameters and folds common aliases. */
export function normalizeMime(mime: string): string {
	const m = mime.split(';')[0].trim().toLowerCase();
	if (m === 'image/jpg' || m === 'image/pjpeg') return 'image/jpeg';
	if (m === 'image/heif') return 'image/heic';
	return m;
}

/** Detects the real type from magic bytes. Null when it is none of the allowed types. */
export function sniffMime(b: Uint8Array): string | null {
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
		return 'image/png';
	const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
	if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
	if (
		b.length >= 12 &&
		ascii(4, 8) === 'ftyp' &&
		/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12))
	) {
		return 'image/heic';
	}
	const head = new TextDecoder().decode(b.subarray(0, 2048));
	if (/<svg[\s>]/i.test(head)) return 'image/svg+xml';
	return null;
}

function dimensions(bytes: Uint8Array): { width?: number; height?: number } {
	try {
		const { width, height } = imageSize(bytes);
		return { width, height };
	} catch {
		return {};
	}
}

export interface SaveAssetInput {
	bytes: Uint8Array;
	mime: string;
	kind: AssetKind;
	label?: string;
	sessionId?: string;
}

export async function saveAsset(input: SaveAssetInput): Promise<StoredAsset> {
	const declared = normalizeMime(input.mime);
	if (!EXT_BY_MIME[declared]) {
		throw new AssetError(
			`Unsupported image type "${input.mime}". Use JPEG, PNG, WebP, HEIC or SVG.`,
			415
		);
	}
	if (input.bytes.byteLength === 0) throw new AssetError('The file is empty.');
	const mime = sniffMime(input.bytes);
	if (!mime) {
		throw new AssetError('The file is not a valid JPEG, PNG, WebP, HEIC or SVG image.', 415);
	}
	const id = randomUUID();
	const asset: StoredAsset = {
		id,
		url: `/api/assets/${id}`,
		kind: input.kind,
		mime,
		...dimensions(input.bytes),
		...(input.label ? { label: input.label } : {}),
		...(input.sessionId ? { sessionId: input.sessionId } : {}),
		createdAt: new Date().toISOString()
	};
	const dir = assetsDir();
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${id}.${EXT_BY_MIME[mime]}`), input.bytes);
	await writeFile(join(dir, `${id}.json`), JSON.stringify(asset));
	return asset;
}

export interface SaveFromUrlOptions {
	kind: AssetKind;
	label?: string;
	sessionId?: string;
	maxBytes?: number;
}

export async function saveAssetFromUrl(
	url: string,
	opts: SaveFromUrlOptions
): Promise<StoredAsset> {
	const maxBytes = opts.maxBytes ?? config.maxUploadBytes;
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new AssetError(`Invalid image URL: ${url.slice(0, 120)}`);
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		throw new AssetError(`Unsupported URL protocol: ${parsed.protocol}`);
	}
	let res: Response;
	try {
		res = await fetch(parsed, { signal: AbortSignal.timeout(30_000), redirect: 'follow' });
	} catch (err) {
		throw new AssetError(`Could not download image: ${(err as Error).message}`, 502);
	}
	if (!res.ok) throw new AssetError(`Could not download image: HTTP ${res.status}`, 502);
	const type = res.headers.get('content-type') ?? '';
	if (!type.toLowerCase().startsWith('image/')) {
		await res.body?.cancel().catch(() => {});
		throw new AssetError(`URL did not return an image (content-type "${type || 'missing'}").`, 415);
	}
	const declaredLength = Number(res.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		await res.body?.cancel().catch(() => {});
		throw new AssetError(`Image is larger than ${maxBytes} bytes.`, 413);
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	if (res.body) {
		const reader = res.body.getReader();
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				total += value.byteLength;
				if (total > maxBytes) {
					await reader.cancel().catch(() => {});
					throw new AssetError(`Image is larger than ${maxBytes} bytes.`, 413);
				}
				chunks.push(value);
			}
		} catch (err) {
			if (err instanceof AssetError) throw err;
			throw new AssetError(`Could not download image: ${(err as Error).message}`, 502);
		}
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		bytes.set(c, offset);
		offset += c.byteLength;
	}
	return saveAsset({
		bytes,
		mime: type,
		kind: opts.kind,
		label: opts.label,
		sessionId: opts.sessionId
	});
}

/** Finds the on-disk file of a demo asset. */
async function findDemoFile(id: string): Promise<{ path: string; mime: string } | null> {
	const stem = id.slice('demo-'.length);
	for (const ext of DEMO_EXTS) {
		const path = join(config.demoDir, 'assets', `${stem}.${ext}`);
		try {
			if ((await stat(path)).isFile()) return { path, mime: MIME_BY_EXT[ext] };
		} catch {
			/* try next extension */
		}
	}
	return null;
}

async function readMeta(id: string): Promise<StoredAsset | null> {
	try {
		return JSON.parse(await readFile(join(assetsDir(), `${id}.json`), 'utf8')) as StoredAsset;
	} catch {
		return null;
	}
}

/** Metadata for an asset id (uploaded or demo). Null if unknown. */
export async function getAssetMeta(id: string): Promise<StoredAsset | null> {
	if (isDemoAssetId(id)) {
		const file = await findDemoFile(id);
		if (!file) return null;
		let dims: { width?: number; height?: number } = {};
		try {
			dims = dimensions(await readFile(file.path));
		} catch {
			/* ignore */
		}
		return { id, url: `/api/assets/${id}`, kind: 'demo', mime: file.mime, ...dims };
	}
	if (!isUuid(id)) return null;
	return readMeta(id.toLowerCase());
}

/** Absolute path of the asset's file (for code that must upload it elsewhere). Null if unknown. */
export async function getAssetPath(id: string): Promise<string | null> {
	if (isDemoAssetId(id)) return (await findDemoFile(id))?.path ?? null;
	if (!isUuid(id)) return null;
	const meta = await readMeta(id.toLowerCase());
	if (!meta) return null;
	const ext = EXT_BY_MIME[normalizeMime(meta.mime)];
	return ext ? join(assetsDir(), `${meta.id}.${ext}`) : null;
}

export async function readAsset(id: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
	if (isDemoAssetId(id)) {
		const file = await findDemoFile(id);
		if (!file) return null;
		try {
			return { bytes: await readFile(file.path), mime: file.mime };
		} catch {
			return null;
		}
	}
	if (!isUuid(id)) return null;
	const meta = await readMeta(id.toLowerCase());
	const path = meta ? await getAssetPath(id) : null;
	if (!meta || !path) return null;
	try {
		return { bytes: await readFile(path), mime: meta.mime };
	} catch {
		return null;
	}
}
