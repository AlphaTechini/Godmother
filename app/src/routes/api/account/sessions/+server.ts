import { json } from '@sveltejs/kit';
import { listSessions } from '#lib/server/auth/accounts';
import { accountsDown } from '#lib/server/auth/routes';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Sign in first.' }, { status: 401 });
	try {
		const rows = await listSessions(locals.user.id);
		return json({
			sessions: rows.map((r) => ({
				id: r.id,
				title: r.title,
				stage: r.stage,
				updatedAt: r.updated_at
			}))
		});
	} catch (err) {
		console.error('[account] could not list sessions', err);
		return accountsDown();
	}
};
