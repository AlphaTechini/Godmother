import { json } from '@sveltejs/kit';
import { canOpenSession } from '#lib/server/auth';
import { spenderOf } from '#lib/server/auth/client-limit';
import { getSession } from '#lib/server/store';
import { publicSession } from '#lib/server/turn';
import { reconcileTurn } from '#lib/server/turn-recovery';
import { poolFor, walletsEnabled } from '#lib/server/units/wallets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { params, locals } = event;
	const session = await getSession(params.id);
	if (!session || !canOpenSession(session, locals.user)) {
		return json({ error: 'Session not found.' }, { status: 404 });
	}
	await reconcileTurn(session);
	const view = publicSession(session);
	if (view.mode === 'live' && walletsEnabled()) {
		// Show what this person can spend now, which changes when they sign in or claim.
		view.units.cap = view.units.spent + (await poolFor(spenderOf(event))).available();
	}
	return json(view);
};
