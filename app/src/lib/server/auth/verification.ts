// The 6-digit code that proves someone owns the email they signed up with. Only a keyed hash is
// stored. A code expires quickly and allows few guesses, because six digits are easy to guess at.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '#lib/server/config';
import { query } from '#lib/server/db';
import { sendEmail } from '#lib/server/email';
import { findUser, type UserRow } from './accounts';

const CODE_MINUTES = 15;
const MAX_GUESSES = 5;

function hashCode(userId: string, code: string): string {
	return createHmac('sha256', config.auth.secret ?? '')
		.update(`${userId}:${code}`)
		.digest('hex');
}

/** Replaces any earlier code and emails a new one. Throws if the email can't be sent. */
export async function sendVerificationCode(user: UserRow): Promise<void> {
	const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
	await query(
		`insert into email_codes (user_id, code_hash, expires_at)
		 values ($1, $2, now() + make_interval(mins => $3))
		 on conflict (user_id) do update
		 set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`,
		[user.id, hashCode(user.id, code), CODE_MINUTES]
	);
	await sendEmail({
		to: user.email,
		subject: `${code} is your Godmother code`,
		text: `Your Godmother code is ${code}. It expires in ${CODE_MINUTES} minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
		html: `<p>Your Godmother code is:</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p><p>It expires in ${CODE_MINUTES} minutes.</p><p>If you didn't ask for this, you can ignore this email.</p>`
	});
}

/** Confirms the email if the code is right, and answers with the user. Null otherwise. */
export async function confirmCode(email: string, code: string): Promise<UserRow | null> {
	const user = await findUser(email);
	if (!user || user.email_verified_at) return null;
	const res = await query<{ code_hash: string }>(
		`update email_codes set attempts = attempts + 1
		 where user_id = $1 and expires_at > now() and attempts < $2
		 returning code_hash`,
		[user.id, MAX_GUESSES]
	);
	const saved = res.rows[0]?.code_hash;
	if (!saved) return null;
	const given = Buffer.from(hashCode(user.id, code));
	const want = Buffer.from(saved);
	if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
	await query('update users set email_verified_at = now() where id = $1', [user.id]);
	await query('delete from email_codes where user_id = $1', [user.id]);
	return user;
}
