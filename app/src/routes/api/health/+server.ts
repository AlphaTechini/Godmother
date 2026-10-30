import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { json } from '@sveltejs/kit';
import { config } from '#lib/server/config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json({
		ok: true,
		live: config.live,
		demo: existsSync(join(config.demoDir, 'script.json'))
	});
