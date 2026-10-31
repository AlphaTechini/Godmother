// The login cookie: a signed record, so it can be checked even while the database is down.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '#lib/server/config';

export const COOKIE_NAME = 'gm_auth';
export const LOGIN_DAYS = 30;

export interface LoginClaims {
	/** The auth_sessions row, which sign-out revokes. */
	sid: string;
	uid: string;
	email: string;
	/** Expiry, in seconds since the epoch. */
	exp: number;
}

function signature(payload: string, secret: string): Buffer {
	return createHmac('sha256', secret).update(payload).digest();
}

export function signClaims(claims: LoginClaims): string {
	const secret = config.auth.secret;
	if (!secret) throw new Error('AUTH_SECRET is not configured.');
	const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
	return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

/** The claims of a genuine, unexpired cookie. Null otherwise. */
export function readClaims(value: string | undefined): LoginClaims | null {
	const secret = config.auth.secret;
	if (!value || !secret) return null;
	const [payload, sig, extra] = value.split('.');
	if (!payload || !sig || extra !== undefined) return null;
	const expected = signature(payload, secret);
	const given = Buffer.from(sig, 'base64url');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as LoginClaims;
		return claims.exp > Date.now() / 1000 ? claims : null;
	} catch {
		return null;
	}
}
