// Who is signed in, and what they may open.

import type { Cookies } from '@sveltejs/kit';
import { config } from '#lib/server/config';
import type { Session } from '#lib/types';
import { isRevoked } from './accounts';
import { COOKIE_NAME, LOGIN_DAYS, readClaims, signClaims } from './cookie';

export interface AuthUser {
	id: string;
	email: string;
	/** This login's record, which sign-out revokes. */
	sid: string;
}

export function accountsEnabled(): boolean {
	return config.live.accounts;
}

export async function currentUser(cookies: Cookies): Promise<AuthUser | null> {
	const claims = readClaims(cookies.get(COOKIE_NAME));
	if (!claims || (await isRevoked(claims.sid))) return null;
	return { id: claims.uid, email: claims.email, sid: claims.sid };
}

export function setLoginCookie(
	cookies: Cookies,
	login: { sid: string; exp: number },
	user: { id: string; email: string }
): void {
	cookies.set(
		COOKIE_NAME,
		signClaims({ sid: login.sid, uid: user.id, email: user.email, exp: login.exp }),
		{
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: LOGIN_DAYS * 86_400
		}
	);
}

export function clearLoginCookie(cookies: Cookies): void {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

/** A session with no owner opens with its private link. One with an owner opens only for them. */
export function canOpenSession(session: Session, user: AuthUser | null): boolean {
	return !session.ownerId || session.ownerId === user?.id;
}
