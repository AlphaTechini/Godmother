import { json } from '@sveltejs/kit';
import { accountsEnabled } from '#lib/server/auth';
import { findUser, normalizeEmail } from '#lib/server/auth/accounts';
import { allowClient } from '#lib/server/auth/client-limit';
import { allowAttempt } from '#lib/server/auth/limiter';
import { accountsOff, emailProblem, readBody, tooMany } from '#lib/server/auth/routes';
import { sendVerificationCode } from '#lib/server/auth/verification';
import { emailEnabled } from '#lib/server/email';
import type { RequestHandler } from './$types';

/** Sends a new code. The answer is the same either way, so this can't be used to find accounts. */
export const POST: RequestHandler = async (event) => {
	if (!accountsEnabled() || !emailEnabled()) return accountsOff();
	const { email } = await readBody(event.request);
	const problem = emailProblem(email);
	if (problem) return json({ error: problem }, { status: 400 });
	if (!allowClient(event, 'resend', 10, 60 * 60_000)) return tooMany();
	const answer = json({ ok: true });
	const address = normalizeEmail(email as string);
	if (!allowAttempt(`resend:${address}`, 3, 60 * 60_000)) return answer;
	try {
		const user = await findUser(address);
		if (user && !user.email_verified_at) await sendVerificationCode(user);
	} catch (err) {
		console.error('[auth] could not resend a code', err);
	}
	return answer;
};
