import { json } from '@sveltejs/kit';
import { readBody } from '#lib/server/auth/routes';
import {
	getSession,
	isUuid,
	saveSession,
	syncSessionNow,
	withSessionLock
} from '#lib/server/store';
import type { RequestHandler } from './$types';

const MAX_CLAIM = 50;

/** Moves guest sessions into the signed-in account. Knowing a guest session's link is what grants this. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'Sign in first.' }, { status: 401 });
	const { sessionIds } = await readBody(request);
	const ids = (Array.isArray(sessionIds) ? sessionIds : [])
		.filter(isUuid)
		.slice(0, MAX_CLAIM) as string[];
	let claimed = 0;
	for (const id of ids) {
		const session = await getSession(id);
		if (!session || session.mode !== 'live' || session.ownerId) continue;
		const won = await withSessionLock(id, async () => {
			if (session.ownerId) return false;
			session.ownerId = user.id;
			await saveSession(session);
			return true;
		});
		if (!won) continue;
		await syncSessionNow(id);
		claimed += 1;
	}
	return json({ claimed });
};
