// Copies live sessions to the database in the background. Local disk stays the working copy, so a
// database outage only delays this: the newest snapshot is kept and retried until it lands.

import { dbEnabled, query } from '#lib/server/db';
import type { Session } from '#lib/types';

const DEBOUNCE_MS = 1500;
const MAX_BACKOFF_MS = 5 * 60_000;

interface Pending {
	session?: Session;
	sessionJson?: string;
	agentJson?: string;
	attempt: number;
	timer?: ReturnType<typeof setTimeout>;
	running?: Promise<void>;
}

const queue = new Map<string, Pending>();

function entry(id: string): Pending {
	let p = queue.get(id);
	if (!p) {
		p = { attempt: 0 };
		queue.set(id, p);
	}
	return p;
}

function schedule(id: string, p: Pending, delay: number): void {
	if (p.timer) clearTimeout(p.timer);
	p.timer = setTimeout(() => void flush(id), delay);
	p.timer.unref?.();
}

async function write(
	session: Session | undefined,
	sessionJson: string | undefined,
	agentJson: string | undefined,
	id: string
) {
	if (session && sessionJson) {
		await query(
			`insert into sessions (id, owner_id, mode, stage, title, data, created_at, updated_at)
			 values ($1, $2, $3, $4, $5, $6::jsonb, $7, now())
			 on conflict (id) do update set
				owner_id = excluded.owner_id, stage = excluded.stage, title = excluded.title,
				data = excluded.data, updated_at = now()`,
			[
				id,
				session.ownerId ?? null,
				session.mode,
				session.stage,
				session.event?.name ?? null,
				sessionJson,
				session.createdAt
			]
		);
	}
	if (agentJson) {
		const res = await query('update sessions set agent = $2::jsonb where id = $1', [id, agentJson]);
		if (res.rowCount === 0) throw new Error('The session row is not there yet.');
	}
}

function flush(id: string): Promise<void> {
	const p = queue.get(id);
	if (!p) return Promise.resolve();
	if (p.running) return p.running;
	if (p.timer) clearTimeout(p.timer);
	const { session, sessionJson, agentJson } = p;
	p.session = p.sessionJson = p.agentJson = undefined;

	p.running = write(session, sessionJson, agentJson, id)
		.then(() => {
			p.attempt = 0;
		})
		.catch((err: Error) => {
			// Newer snapshots queued while this ran win; otherwise put these back for the retry.
			p.session ??= session;
			p.sessionJson ??= sessionJson;
			p.agentJson ??= agentJson;
			p.attempt += 1;
			console.warn(`[sync] session ${id} not saved to the database yet: ${err.message}`);
		})
		.finally(() => {
			p.running = undefined;
			if (p.sessionJson || p.agentJson) {
				schedule(id, p, p.attempt ? Math.min(MAX_BACKOFF_MS, 2000 * 2 ** p.attempt) : DEBOUNCE_MS);
			} else {
				queue.delete(id);
			}
		});
	return p.running;
}

export function queueSessionSync(session: Session, json: string): void {
	if (!dbEnabled() || session.mode !== 'live') return;
	const p = entry(session.id.toLowerCase());
	p.session = session;
	p.sessionJson = json;
	if (!p.attempt) schedule(session.id.toLowerCase(), p, DEBOUNCE_MS);
}

export function queueAgentSync(sessionId: string, json: string): void {
	if (!dbEnabled()) return;
	const p = entry(sessionId.toLowerCase());
	p.agentJson = json;
	if (!p.attempt) schedule(sessionId.toLowerCase(), p, DEBOUNCE_MS);
}

/** Saves a session now, for callers that read the database straight after. Never throws. */
export async function syncSessionNow(sessionId: string): Promise<void> {
	const id = sessionId.toLowerCase();
	await flush(id);
	// A save already under way may predate the caller's change, so send what's still waiting.
	if (queue.get(id)?.sessionJson && !queue.get(id)?.attempt) await flush(id);
}

/** The saved copy, for a session this server has no file for. Null when unknown or unreachable. */
export async function loadRemoteSession(id: string): Promise<Session | null> {
	if (!dbEnabled()) return null;
	try {
		const res = await query<{ data: Session }>('select data from sessions where id = $1', [id]);
		return res.rows[0]?.data ?? null;
	} catch (err) {
		console.warn(`[sync] could not load session ${id}: ${(err as Error).message}`);
		return null;
	}
}

export async function loadRemoteAgent(id: string): Promise<unknown> {
	if (!dbEnabled()) return null;
	try {
		const res = await query<{ agent: unknown }>('select agent from sessions where id = $1', [id]);
		return res.rows[0]?.agent ?? null;
	} catch {
		return null;
	}
}
