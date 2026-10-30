import { json } from '@sveltejs/kit';
import { getSession } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const session = await getSession(params.id);
	if (!session) return json({ error: 'Session not found.' }, { status: 404 });
	return json(session);
};
