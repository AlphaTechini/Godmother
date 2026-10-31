import { json } from '@sveltejs/kit';
import { accountsEnabled, setLoginCookie } from '#lib/server/auth';
import { EmailTaken, createLogin, createUser } from '#lib/server/auth/accounts';
import { allowClient } from '#lib/server/auth/client-limit';
import {
	accountsDown,
	accountsOff,
	emailProblem,
	passwordProblem,
	readBody,
	tooMany
} from '#lib/server/auth/routes';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { request, cookies } = event;
	if (!accountsEnabled()) return accountsOff();
	if (!allowClient(event, 'signup', 10, 60 * 60_000)) return tooMany();
	const { email, password } = await readBody(request);
	const problem = emailProblem(email) ?? passwordProblem(password);
	if (problem) return json({ error: problem }, { status: 400 });
	try {
		const user = await createUser(email as string, password as string);
		setLoginCookie(cookies, await createLogin(user.id), user);
		return json({ user: { email: user.email } });
	} catch (err) {
		if (err instanceof EmailTaken) {
			return json(
				{ error: 'That email already has an account. Sign in instead.' },
				{ status: 409 }
			);
		}
		console.error('[auth] sign-up failed', err);
		return accountsDown();
	}
};
