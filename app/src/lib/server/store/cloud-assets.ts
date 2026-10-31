// Copies live images to cloud storage, and their records to the database, in the background.
// The local file stays the working copy, so an outage only delays this. It also restores an image
// this server has no file for.

import { readFile } from 'node:fs/promises';
import { dbEnabled, query } from '#lib/server/db';
import { getImageStore } from '#lib/server/images';
import type { StoredAsset } from './assets';

// About a day of retries, so an outage doesn't lose images but one the provider refuses still stops.
const MAX_ATTEMPTS = 300;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 5 * 60_000;

async function upload(asset: StoredAsset, path: string): Promise<void> {
	const store = getImageStore();
	if (store) await store.put(asset.id, await readFile(path), asset.mime);
	if (dbEnabled()) {
		await query(
			`insert into assets (id, session_id, meta) values ($1, $2, $3::jsonb)
			 on conflict (id) do update set meta = excluded.meta`,
			[asset.id, asset.sessionId ?? null, JSON.stringify(asset)]
		);
	}
}

const inFlight = new Set<Promise<void>>();

/** Waits for the uploads running now. Failed ones carry on retrying afterwards. */
export async function settleAssetSync(): Promise<void> {
	await Promise.all(inFlight);
}

export function queueAssetSync(asset: StoredAsset, path: string): void {
	if (!getImageStore() && !dbEnabled()) return;
	const attempt = (n: number) => {
		const running: Promise<void> = upload(asset, path).catch((err: Error) => {
			if (n + 1 >= MAX_ATTEMPTS) {
				console.error(`[sync] gave up saving image ${asset.id} to the cloud: ${err.message}`);
				return;
			}
			console.warn(`[sync] image ${asset.id} not saved to the cloud yet: ${err.message}`);
			setTimeout(() => attempt(n + 1), Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** n)).unref?.();
		});
		inFlight.add(running);
		void running.finally(() => inFlight.delete(running));
	};
	attempt(0);
}

/** An image's record and bytes from the cloud. Null when unknown or unreachable. */
export async function loadRemoteAsset(
	id: string
): Promise<{ meta: StoredAsset; bytes: Uint8Array } | null> {
	const store = getImageStore();
	if (!store || !dbEnabled()) return null;
	try {
		const res = await query<{ meta: StoredAsset }>('select meta from assets where id = $1', [id]);
		const meta = res.rows[0]?.meta;
		if (!meta) return null;
		const bytes = await store.get(id, meta.mime);
		return bytes ? { meta, bytes } : null;
	} catch (err) {
		console.warn(`[sync] could not load image ${id}: ${(err as Error).message}`);
		return null;
	}
}
