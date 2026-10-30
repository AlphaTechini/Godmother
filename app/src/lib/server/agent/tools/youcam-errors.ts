import { UnitCapError, YouCamTaskError } from '#lib/server/youcam';
import type { Asset } from '#lib/types';

/** A message safe to show and to give the model for expected YouCam failures; undefined for anything else. */
export function youcamFailure(err: unknown): string | undefined {
	if (err instanceof YouCamTaskError) return err.userMessage;
	if (err instanceof UnitCapError) return err.message;
	return undefined;
}

/** Message for any failure: the expected ones verbatim, unexpected ones generic (and logged). */
export function failureMessage(err: unknown, what: string): string {
	const known = youcamFailure(err);
	if (known) return known;
	console.error(`[agent] ${what} failed`, err);
	return `${what} failed unexpectedly.`;
}

/** Strips store bookkeeping (sessionId, createdAt) from a stored asset. */
export function plainAsset(a: Asset & { sessionId?: string; createdAt?: string }): Asset {
	const { sessionId: _s, createdAt: _c, ...rest } = a;
	return rest;
}
