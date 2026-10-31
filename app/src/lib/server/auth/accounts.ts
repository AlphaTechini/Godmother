// Accounts, login records and password resets in the database.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { query, transaction } from '#lib/server/db';
import { LOGIN_DAYS } from './cookie';
import { hashPassword } from './password';

const RESET_MINUTES = 60;
/** How long a sign-out can take to reach other servers. */
const REVOKE_CHECK_MS = 60_000;

export class EmailTaken extends Error {}

export interface UserRow {
	id: string;
	email: string;
	password_hash: string;
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export async function findUser(email: string): Promise<UserRow | undefined> {
	const res = await query<UserRow>('select id, email, password_hash from users where email = $1', [
		normalizeEmail(email)
	]);
	return res.rows[0];
}

export async function createUser(email: string, password: string): Promise<UserRow> {
	const row: UserRow = {
		id: randomUUID(),
		email: normalizeEmail(email),
		password_hash: await hashPassword(password)
	};
	try {
		await query('insert into users (id, email, password_hash) values ($1, $2, $3)', [
			row.id,
			row.email,
			row.password_hash
		]);
	} catch (err) {
		if ((err as { code?: string }).code === '23505') throw new EmailTaken();
		throw err;
	}
	return row;
}

export async function createLogin(userId: string): Promise<{ sid: string; exp: number }> {
	const sid = randomUUID();
	const exp = Math.floor(Date.now() / 1000) + LOGIN_DAYS * 86_400;
	await query(
		'insert into auth_sessions (id, user_id, expires_at) values ($1, $2, to_timestamp($3))',
		[sid, userId, exp]
	);
	return { sid, exp };
}

const revokeChecks = new Map<string, { revoked: boolean; at: number }>();

export async function revokeLogin(sid: string): Promise<void> {
	revokeChecks.set(sid, { revoked: true, at: Date.now() });
	await query('update auth_sessions set revoked_at = now() where id = $1', [sid]);
}

/** Whether a login was signed out. If the database can't answer, the signed cookie stands. */
export async function isRevoked(sid: string): Promise<boolean> {
	const known = revokeChecks.get(sid);
	if (known && (known.revoked || Date.now() - known.at < REVOKE_CHECK_MS)) return known.revoked;
	try {
		const res = await query<{ revoked_at: Date | null }>(
			'select revoked_at from auth_sessions where id = $1',
			[sid]
		);
		const revoked = res.rows.length === 0 || res.rows[0].revoked_at !== null;
		revokeChecks.set(sid, { revoked, at: Date.now() });
		return revoked;
	} catch {
		// Remember the outage too, so each request doesn't wait for a connection timeout.
		revokeChecks.set(sid, { revoked: false, at: Date.now() });
		return false;
	}
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** A one-time reset token. Only its hash is stored. */
export async function createPasswordReset(userId: string): Promise<string> {
	const token = randomBytes(32).toString('base64url');
	await query(
		`insert into password_resets (token_hash, user_id, expires_at)
		 values ($1, $2, now() + make_interval(mins => $3))`,
		[tokenHash(token), userId, RESET_MINUTES]
	);
	return token;
}

/** Sets the new password and signs out everywhere. False when the token is invalid, expired or used. */
export async function resetPassword(token: string, password: string): Promise<boolean> {
	const newHash = await hashPassword(password);
	const changed = await transaction(async (client) => {
		const used = await client.query<{ user_id: string }>(
			`update password_resets set used_at = now()
			 where token_hash = $1 and used_at is null and expires_at > now()
			 returning user_id`,
			[tokenHash(token)]
		);
		const userId = used.rows[0]?.user_id;
		if (!userId) return false;
		await client.query('update users set password_hash = $2 where id = $1', [userId, newHash]);
		await client.query(
			'update auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null',
			[userId]
		);
		return true;
	});
	if (changed) revokeChecks.clear();
	return changed;
}

export interface SavedSessionRow {
	id: string;
	title: string | null;
	stage: string;
	updated_at: Date;
}

export async function listSessions(userId: string): Promise<SavedSessionRow[]> {
	const res = await query<SavedSessionRow>(
		`select id, title, stage, updated_at from sessions
		 where owner_id = $1 order by updated_at desc limit 50`,
		[userId]
	);
	return res.rows;
}
