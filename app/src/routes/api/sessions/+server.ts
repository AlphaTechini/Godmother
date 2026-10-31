import { json } from '@sveltejs/kit';
import { spenderOf } from '#lib/server/auth/client-limit';
import { demoInitialSession } from '#lib/server/demo';
import { createSession, saveSession, waitForCloudCopies } from '#lib/server/store';
import { poolFor, walletsEnabled } from '#lib/server/units/wallets';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	const { request, locals } = event;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Body must be JSON like {"mode":"live"|"demo"}.' }, { status: 400 });
	}
	const mode = (body as { mode?: unknown } | null)?.mode;
	if (mode !== 'live' && mode !== 'demo') {
		return json({ error: '"mode" must be "live" or "demo".' }, { status: 400 });
	}
	const init = mode === 'demo' ? await demoInitialSession() : null;
	const owner = mode === 'live' && locals.user ? { ownerId: locals.user.id } : {};
	const session = createSession(mode, { ...init, ...owner });
	if (mode === 'live' && walletsEnabled()) {
		session.units.cap = (await poolFor(spenderOf(event))).available();
	}
	await saveSession(session);
	if (mode === 'live') await waitForCloudCopies(session.id);
	return json(session);
};
