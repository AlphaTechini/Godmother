import { json } from '@sveltejs/kit';
import { config } from '#lib/server/config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json({
		ok: true,
		live: config.live
	});
