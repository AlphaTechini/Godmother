// A signed id kept in the browser, so rate limits follow the browser when its IP changes.
// Clearing cookies gets a new id, which is why limits also apply per address (see client-limit.ts).

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { config } from '#lib/server/config';

const COOKIE_NAME = 'gm_device';
const ONE_YEAR = 365 * 86_400;

export interface Device {
	id: string;
	/** False when this request arrived without a genuine id, so the id can't be trusted yet. */
	known: boolean;
}

const sign = (id: string, secret: string) =>
	createHmac('sha256', secret).update(`device:${id}`).digest();

function readDevice(value: string | undefined, secret: string): string | null {
	const [id, sig, extra] = value?.split('.') ?? [];
	if (!id || !sig || extra !== undefined) return null;
	const given = Buffer.from(sig, 'base64url');
	const expected = sign(id, secret);
	return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** The browser's id, issuing one if it has none. Null when accounts aren't configured. */
export function ensureDevice(cookies: Cookies): Device | null {
	const secret = config.auth.secret;
	if (!secret) return null;
	const existing = readDevice(cookies.get(COOKIE_NAME), secret);
	if (existing) return { id: existing, known: true };
	const id = randomUUID();
	cookies.set(COOKIE_NAME, `${id}.${sign(id, secret).toString('base64url')}`, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: ONE_YEAR
	});
	return { id, known: false };
}
