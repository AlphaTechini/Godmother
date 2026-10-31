// Proves a request came through Cloudflare. Cloudflare adds a secret header that only it knows; the
// server keeps just the hash. Without this, anyone calling the run.app address directly could write
// any visitor address they like. Off when EDGE_SECRET_HASH isn't set.

import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '#lib/server/config';

const HEADER = 'x-godmother-edge';

export function cameThroughEdge(request: Request): boolean {
	const expected = config.auth.edgeSecretHash;
	if (!expected) return true;
	const given = createHash('sha256')
		.update(request.headers.get(HEADER) ?? '')
		.digest();
	const want = Buffer.from(expected, 'hex');
	return given.length === want.length && timingSafeEqual(given, want);
}
