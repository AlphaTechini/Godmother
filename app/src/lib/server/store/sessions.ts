// Sessions on disk: DATA_DIR/sessions/<id>/session.json, with an in-memory cache.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '#lib/server/config';
import type { Session } from '#lib/types';
import { loadRemoteSession, queueSessionSync } from './cloud-sessions';
import { isUuid, sessionDir } from './paths';

const cache = new Map<string, Session>();

export function createSession(mode: Session['mode'], init?: Partial<Session>): Session {
	const session: Session = {
		stage: 'event',
		photos: {},
		wardrobe: [],
		looks: [],
		messages: [],
		units: { spent: 0, cap: config.unitCapPerSession, ledger: [] },
		...init,
		// Never taken from `init`.
		id: randomUUID(),
		mode,
		createdAt: new Date().toISOString()
	};
	cache.set(session.id, session);
	// Persist in the background; callers that need durability call saveSession.
	void saveSession(session).catch((err) => console.error('[store] initial save failed', err));
	return session;
}

/** Returns the live (cached) session object, or null if the id is invalid or unknown. */
export async function getSession(id: string): Promise<Session | null> {
	if (!isUuid(id)) return null;
	const key = id.toLowerCase();
	const hit = cache.get(key);
	if (hit) return hit;
	try {
		const raw = await readFile(join(sessionDir(key), 'session.json'), 'utf8');
		// Another caller may have loaded it while we were reading; keep a single instance.
		const existing = cache.get(key);
		if (existing) return existing;
		const session = JSON.parse(raw) as Session;
		cache.set(key, session);
		return session;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			console.error(`[store] could not read session ${key}`, err);
			return null;
		}
	}
	// No file on this server: restore the saved copy, if there is one.
	const remote = await loadRemoteSession(key);
	if (!remote) return null;
	const existing = cache.get(key);
	if (existing) return existing;
	await saveSession(remote, { sync: false }).catch((err) =>
		console.error(`[store] could not cache session ${key}`, err)
	);
	return remote;
}

// Writes for one session are chained so an older snapshot can never overwrite a newer one.
const writeChains = new Map<string, Promise<unknown>>();

/** Atomic write (tmp file + rename), then a background copy to the database. Also refreshes the cache. */
export async function saveSession(session: Session, opts: { sync?: boolean } = {}): Promise<void> {
	const dir = sessionDir(session.id); // validates the id
	const key = session.id.toLowerCase();
	cache.set(key, session);
	const json = JSON.stringify(session);
	if (opts.sync !== false) queueSessionSync(session, json);
	const prev = writeChains.get(key) ?? Promise.resolve();
	const next = prev
		.catch(() => {})
		.then(async () => {
			await mkdir(dir, { recursive: true });
			const tmp = join(dir, `session.json.${randomUUID()}.tmp`);
			try {
				await writeFile(tmp, json);
				await rename(tmp, join(dir, 'session.json'));
			} catch (err) {
				await rm(tmp, { force: true }).catch(() => {});
				throw err;
			}
		});
	writeChains.set(key, next);
	const cleanup = () => {
		if (writeChains.get(key) === next) writeChains.delete(key);
	};
	next.then(cleanup, cleanup);
	return next;
}

const locks = new Map<string, Promise<unknown>>();

/** Serialises async work per session so two turns never interleave. Errors propagate to the caller only. */
export function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
	const key = id.toLowerCase();
	const prev = locks.get(key) ?? Promise.resolve();
	const run = prev.catch(() => {}).then(fn);
	const tail = run.catch(() => {});
	locks.set(key, tail);
	tail.then(() => {
		if (locks.get(key) === tail) locks.delete(key);
	});
	return run;
}

/** Test helper: forget cached sessions (does not touch disk). */
export function clearSessionCache(): void {
	cache.clear();
}
