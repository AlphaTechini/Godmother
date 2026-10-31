import { json } from '@sveltejs/kit';
import { accountsEnabled, setLoginCookie } from '#lib/server/auth';
import { createLogin } from '#lib/server/auth/accounts';
import { allowClient } from '#lib/server/auth/client-limit';
import { accountsDown, accountsOff, readBody, tooMany } from '#lib/server/auth/routes';
import { confirmCode } from '#lib/server/auth/verification';
import type { RequestHandler } from './$types';

/** Checks the emailed code. On success the account is confirmed and signed in. */
export const POST: RequestHandler = async (event) => {
	if (!accountsEnabled()) return accountsOff();
	if (!allowClient(event, 'verify', 30, 60 * 60_000)) return tooMany();
	const { email, code } = await readBody(event.request);
	const wrong = () =>
		json({ error: 'That code isn’t right or has expired. Ask for a new one.' }, { status: 400 });
	if (typeof email !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
		return wrong();
	}
	try {
		const user = await confirmCode(email, code.trim());
		if (!user) return wrong();
		setLoginCookie(event.cookies, await createLogin(user.id), user);
		return json({ user: { email: user.email } });
	} catch (err) {
		console.error('[auth] verification failed', err);
		return accountsDown();
	}
};
