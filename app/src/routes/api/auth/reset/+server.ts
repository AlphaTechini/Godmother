import { json } from '@sveltejs/kit';
import { accountsEnabled } from '#lib/server/auth';
import { resetPassword } from '#lib/server/auth/accounts';
import { allowClient } from '#lib/server/auth/client-limit';
import {
	accountsDown,
	accountsOff,
	passwordProblem,
	readBody,
	tooMany
} from '#lib/server/auth/routes';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { request } = event;
	if (!accountsEnabled()) return accountsOff();
	if (!allowClient(event, 'reset', 20, 60 * 60_000)) return tooMany();
	const { token, password } = await readBody(request);
	const problem = passwordProblem(password);
	if (problem) return json({ error: problem }, { status: 400 });
	try {
		const changed =
			typeof token === 'string' &&
			token.length < 200 &&
			(await resetPassword(token, password as string));
		if (!changed) {
			return json(
				{ error: 'This reset link has expired or was already used. Ask for a new one.' },
				{ status: 400 }
			);
		}
		return json({ ok: true });
	} catch (err) {
		console.error('[auth] password reset failed', err);
		return accountsDown();
	}
};
