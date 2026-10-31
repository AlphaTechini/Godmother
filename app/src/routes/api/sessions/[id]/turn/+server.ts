import { json } from '@sveltejs/kit';
import { canOpenSession } from '#lib/server/auth';
import { followTurn } from '#lib/server/runner';
import { getSession } from '#lib/server/store';
import { reconcileTurn } from '#lib/server/turn-recovery';
import type { RequestHandler } from './$types';

/** Attaches to the session's current turn: the state now, then live events until it ends. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await getSession(params.id);
	if (!session || !canOpenSession(session, locals.user)) {
		return json({ error: 'Session not found.' }, { status: 404 });
	}
	await reconcileTurn(session);
	return followTurn(session);
};
