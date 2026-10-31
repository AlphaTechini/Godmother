// The browser's side of accounts: API calls, and the list of guest sessions to move in after sign-in.

import { fetchWithRetry } from './retry';

export interface AuthState {
	accounts: boolean;
	passwordReset: boolean;
	user: { email: string } | null;
}

export interface SavedSession {
	id: string;
	title: string | null;
	stage: string;
	updatedAt: string;
}

const GUEST_KEY = 'gm-guest-sessions';

async function post<T>(path: string, body: unknown = {}): Promise<T> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const data = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
	return data;
}

export async function getAuthState(): Promise<AuthState> {
	const res = await fetchWithRetry('/api/auth/me');
	if (!res.ok) return { accounts: false, passwordReset: false, user: null };
	return (await res.json()) as AuthState;
}

export const signUp = (email: string, password: string) =>
	post('/api/auth/signup', { email, password });
export const signIn = (email: string, password: string) =>
	post('/api/auth/login', { email, password });
export const signOut = () => post('/api/auth/logout');
export const requestPasswordReset = (email: string) => post('/api/auth/forgot', { email });
export const setNewPassword = (token: string, password: string) =>
	post('/api/auth/reset', { token, password });

export async function listSavedSessions(): Promise<SavedSession[]> {
	const res = await fetch('/api/account/sessions');
	if (!res.ok) throw new Error('Your sessions can’t be loaded right now.');
	return ((await res.json()) as { sessions: SavedSession[] }).sessions;
}

function guestIds(): string[] {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]');
		return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** Remembers a guest session in this browser, so signing in can move it into the account. */
export function rememberGuestSession(id: string): void {
	try {
		localStorage.setItem(GUEST_KEY, JSON.stringify([...new Set([id, ...guestIds()])].slice(0, 50)));
	} catch {
		/* private mode: it just won't be moved later */
	}
}

/** Moves this browser's guest sessions into the signed-in account. */
export async function claimGuestSessions(): Promise<void> {
	const sessionIds = guestIds();
	if (sessionIds.length === 0) return;
	await post('/api/account/claim', { sessionIds });
	try {
		localStorage.removeItem(GUEST_KEY);
	} catch {
		/* nothing to clean up */
	}
}
