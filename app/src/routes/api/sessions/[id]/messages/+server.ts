import { json } from '@sveltejs/kit';
import { executeTurn } from '#lib/server/runner';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Body must be JSON.' }, { status: 400 });
	}
	return executeTurn(params.id, body);
};
