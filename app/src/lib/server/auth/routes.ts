// What the account routes share: reading the body, and the answers they give.

import { json } from '@sveltejs/kit';
import { MAX_PASSWORD, MIN_PASSWORD } from './password';

export const accountsOff = () =>
	json(
		{ error: 'Accounts aren’t set up on this server. You can keep using Godmother as a guest.' },
		{ status: 503 }
	);

export const accountsDown = () =>
	json(
		{ error: 'Accounts are unavailable right now. You can keep using Godmother as a guest.' },
		{ status: 503 }
	);

export const tooMany = () =>
	json({ error: 'Too many attempts. Please wait a while and try again.' }, { status: 429 });

export async function readBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const body: unknown = await request.json();
		return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export function emailProblem(email: unknown): string | null {
	if (
		typeof email !== 'string' ||
		email.length > 254 ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
	) {
		return 'Enter a valid email address.';
	}
	return null;
}

export function passwordProblem(password: unknown): string | null {
	if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
		return `Use a password of at least ${MIN_PASSWORD} characters.`;
	}
	if (password.length > MAX_PASSWORD)
		return `Use a password of at most ${MAX_PASSWORD} characters.`;
	return null;
}
