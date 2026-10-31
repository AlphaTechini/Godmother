// Password hashing with Argon2id, at the OWASP minimum settings (19 MiB, 2 passes, 1 thread).

import { hash, verify } from '@node-rs/argon2';

const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const MIN_PASSWORD = 10;
/** Hashing cost grows with input, so a huge password must not reach Argon2. */
export const MAX_PASSWORD = 200;

export function hashPassword(password: string): Promise<string> {
	return hash(password, OPTIONS);
}

let dummy: Promise<string> | undefined;

/** Checks a password. With no stored hash it does the same work, so timing doesn't reveal which emails exist. */
export async function checkPassword(
	stored: string | undefined,
	password: string
): Promise<boolean> {
	if (stored) return verify(stored, password);
	dummy ??= hash('not a real password', OPTIONS);
	await verify(await dummy, password);
	return false;
}
