import { json } from '@sveltejs/kit';
import { accountsEnabled, setLoginCookie } from '#lib/server/auth';
import { createLogin, findUser, normalizeEmail } from '#lib/server/auth/accounts';
import { allowClient } from '#lib/server/auth/client-limit';
import { allowAttempt } from '#lib/server/auth/limiter';
import { MAX_PASSWORD, checkPassword } from '#lib/server/auth/password';
import { accountsDown, accountsOff, readBody, tooMany } from '#lib/server/auth/routes';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { request, cookies } = event;
	if (!accountsEnabled()) return accountsOff();
	const { email, password } = await readBody(request);
	const wrong = () => json({ error: 'That email and password don’t match.' }, { status: 401 });
	if (typeof email !== 'string' || typeof password !== 'string' || password.length > MAX_PASSWORD) {
		return wrong();
	}
	const perEmail = allowAttempt(`login:${normalizeEmail(email)}`, 8, 15 * 60_000);
	const perClient = allowClient(event, 'login', 40, 15 * 60_000);
	if (!perEmail || !perClient) return tooMany();
	try {
		const user = await findUser(email);
		if (!(await checkPassword(user?.password_hash, password)) || !user) return wrong();
		setLoginCookie(cookies, await createLogin(user.id), user);
		return json({ user: { email: user.email } });
	} catch (err) {
		console.error('[auth] sign-in failed', err);
		return accountsDown();
	}
};
