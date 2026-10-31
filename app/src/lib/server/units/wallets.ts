// YouCam unit allowances. Guests get one grant for good. Signed-in users get a grant and may claim a
// fresh one once a day, only when they ask. The database holds the balance; memory holds what is
// reserved right now, which is correct because the API runs as a single instance.

import { createHmac } from 'node:crypto';
import { config } from '#lib/server/config';
import { dbEnabled, query } from '#lib/server/db';
import type { UnitPool } from '#lib/server/youcam/ledger';

export type Spender =
	{ kind: 'user'; id: string } | { kind: 'guest'; deviceId?: string; address: string };

interface Row {
	id: string;
	granted: number;
	used: number;
	held: number;
	lastClaimAt: Date;
}

const rows = new Map<string, Row>();
const writes = new Set<Promise<void>>();

export function walletsEnabled(): boolean {
	return dbEnabled();
}

const hashed = (address: string) =>
	createHmac('sha256', config.auth.secret ?? 'no-secret')
		.update(address)
		.digest('hex')
		.slice(0, 32);

const left = (row: Row) => Math.max(0, row.granted - row.used - row.held);

/** Reads a row, creating it with its grant the first time. An outage falls back to memory. */
async function loadRow(id: string, grant: number): Promise<Row> {
	const row =
		rows.get(id) ??
		({ id, granted: grant, used: 0, held: 0, lastClaimAt: new Date() } satisfies Row);
	rows.set(id, row);
	try {
		await query(
			'insert into unit_wallets (id, granted) values ($1, $2) on conflict (id) do nothing',
			[id, grant]
		);
		const res = await query<{ granted: number; used: number; last_claim_at: Date }>(
			'select granted, used, last_claim_at from unit_wallets where id = $1',
			[id]
		);
		const saved = res.rows[0];
		if (saved) {
			row.granted = saved.granted;
			// A spend still being written isn't in the database yet.
			row.used = Math.max(row.used, saved.used);
			row.lastClaimAt = saved.last_claim_at;
		}
	} catch (err) {
		console.warn(`[units] could not read a wallet: ${(err as Error).message}`);
	}
	return row;
}

function spend(row: Row, units: number): void {
	row.used += units;
	const write = query('update unit_wallets set used = used + $2 where id = $1', [row.id, units])
		.then(() => undefined)
		.catch((err: Error) => console.warn(`[units] could not record a spend: ${err.message}`))
		.finally(() => writes.delete(write));
	writes.add(write);
}

/** Waits for recorded spends, so a throttled instance can't lose them. */
export async function settleWalletWrites(): Promise<void> {
	await Promise.all(writes);
}

/** What this person may spend. A guest is limited by both their browser and their address. */
export async function poolFor(spender: Spender): Promise<UnitPool> {
	const { guest, user } = config.units;
	const list =
		spender.kind === 'user'
			? [await loadRow(`user:${spender.id}`, user)]
			: [
					await loadRow(`ip:${hashed(spender.address)}`, guest),
					...(spender.deviceId ? [await loadRow(`device:${spender.deviceId}`, guest)] : [])
				];
	return {
		available: () => Math.min(...list.map(left)),
		hold: (units) => list.forEach((row) => (row.held += units)),
		release: (units) => list.forEach((row) => (row.held = Math.max(0, row.held - units))),
		spend: (units) => list.forEach((row) => spend(row, units))
	};
}

export interface UserUnits {
	balance: number;
	canClaim: boolean;
	/** When the next claim opens, if it isn't open now. */
	nextClaimAt?: string;
}

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

function describe(row: Row): UserUnits {
	const canClaim = utcDay(new Date()) > utcDay(row.lastClaimAt);
	return {
		balance: left(row),
		canClaim,
		...(canClaim
			? {}
			: { nextClaimAt: new Date(utcDay(row.lastClaimAt) + 86_400_000).toISOString() })
	};
}

export async function userUnits(userId: string): Promise<UserUnits> {
	return describe(await loadRow(`user:${userId}`, config.units.user));
}

/**
 * Sets the balance back to a full grant, once per UTC day. Unused units don't stack. Throws if the
 * database can't record it, so nobody receives a claim that wasn't saved.
 */
export async function claimUnits(userId: string): Promise<UserUnits> {
	const id = `user:${userId}`;
	const row = await loadRow(id, config.units.user);
	await settleWalletWrites();
	const res = await query<{ granted: number; used: number; last_claim_at: Date }>(
		`update unit_wallets set granted = used + $2, last_claim_at = now()
		 where id = $1 and (last_claim_at at time zone 'utc')::date < (now() at time zone 'utc')::date
		 returning granted, used, last_claim_at`,
		[id, config.units.user]
	);
	const saved = res.rows[0];
	if (saved) {
		row.granted = saved.granted;
		row.used = saved.used;
		row.lastClaimAt = saved.last_claim_at;
	}
	return describe(row);
}
