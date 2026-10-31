import { json } from '@sveltejs/kit';
import { accountsEnabled } from '#lib/server/auth';
import { EmailTaken, createUser, findUser, setPassword } from '#lib/server/auth/accounts';
import { allowClient } from '#lib/server/auth/client-limit';
import {
	accountsDown,
	accountsOff,
	emailProblem,
	passwordProblem,
	readBody,
	tooMany
} from '#lib/server/auth/routes';
import { sendVerificationCode } from '#lib/server/auth/verification';
import { emailEnabled } from '#lib/server/email';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	if (!accountsEnabled() || !emailEnabled()) return accountsOff();
	if (!allowClient(event, 'signup', 5, 24 * 60 * 60_000)) return tooMany();
	const { email, password } = await readBody(event.request);
	const problem = emailProblem(email) ?? passwordProblem(password);
	if (problem) return json({ error: problem }, { status: 400 });
	try {
		let user;
		try {
			user = await createUser(email as string, password as string);
		} catch (err) {
			if (!(err instanceof EmailTaken)) throw err;
			const existing = await findUser(email as string);
			if (!existing || existing.email_verified_at) {
				return json(
					{ error: 'That email already has an account. Sign in instead.' },
					{ status: 409 }
				);
			}
			// Never confirmed, so nobody has proved it's theirs: a stranger can't hold the address.
			await setPassword(existing.id, password as string);
			user = existing;
		}
		await sendVerificationCode(user);
		return json({ verify: true, email: user.email });
	} catch (err) {
		console.error('[auth] sign-up failed', err);
		return accountsDown();
	}
};
