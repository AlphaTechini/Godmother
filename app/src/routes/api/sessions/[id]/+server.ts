import { json } from '@sveltejs/kit';
import { canOpenSession } from '#lib/server/auth';
import { getSession } from '#lib/server/store';
import { publicSession } from '#lib/server/turn';
import { reconcileTurn } from '#lib/server/turn-recovery';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await getSession(params.id);
	if (!session || !canOpenSession(session, locals.user)) {
		return json({ error: 'Session not found.' }, { status: 404 });
	}
	await reconcileTurn(session);
	return json(publicSession(session));
};
