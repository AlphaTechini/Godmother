// Slows down password guessing and email abuse. In memory, so limits reset when the server restarts.

const hits = new Map<string, number[]>();
const MAX_KEYS = 20_000;

/** Counts one attempt. False when this key has used up its allowance for the window. */
export function allowAttempt(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
	if (recent.length >= limit) {
		hits.set(key, recent);
		return false;
	}
	recent.push(now);
	hits.set(key, recent);
	if (hits.size > MAX_KEYS) hits.clear();
	return true;
}
