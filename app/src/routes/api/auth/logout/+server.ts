import { json } from '@sveltejs/kit';
import { clearLoginCookie } from '#lib/server/auth';
import { revokeLogin } from '#lib/server/auth/accounts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	clearLoginCookie(cookies);
	if (locals.user) {
		// The cookie is gone either way, so a database outage must not fail sign-out.
		await revokeLogin(locals.user.sid).catch((err) =>
			console.warn('[auth] could not record sign-out', (err as Error).message)
		);
	}
	return json({ ok: true });
};
