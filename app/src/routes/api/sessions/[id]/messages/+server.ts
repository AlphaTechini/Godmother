import { json } from '@sveltejs/kit';
import { canOpenSession } from '#lib/server/auth';
import { executeTurn } from '#lib/server/runner';
import { getSession } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await getSession(params.id);
	if (session && !canOpenSession(session, locals.user)) {
		return json({ error: 'Session not found.' }, { status: 404 });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Body must be JSON.' }, { status: 400 });
	}
	return executeTurn(params.id, body);
};
