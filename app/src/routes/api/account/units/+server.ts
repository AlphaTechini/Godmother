import { json } from '@sveltejs/kit';
import { accountsDown } from '#lib/server/auth/routes';
import { claimUnits, userUnits } from '#lib/server/units/wallets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Sign in first.' }, { status: 401 });
	return json(await userUnits(locals.user.id));
};

/** Claims today's fresh units. Only ever happens when the person asks. */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Sign in first.' }, { status: 401 });
	try {
		return json(await claimUnits(locals.user.id));
	} catch (err) {
		console.error('[units] claim failed', err);
		return accountsDown();
	}
};
