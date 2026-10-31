import type { PageLoad } from './$types';
import type { Session, Stage } from '#lib/types';
import { STAGE_ORDER, sessionAt } from '#lib/client/fixtures';
import { fetchWithRetry } from '#lib/client/retry';

export type StudioData =
	| { kind: 'session'; session: Session; offline: boolean; speed: number; key: string }
	| { kind: 'error'; reason: 'not_found' | 'unreachable' | 'failed'; message: string; id: string };

export const load: PageLoad = async ({ params, url, fetch }): Promise<StudioData> => {
	// /studio/mock?stage=<stage>: fully client-side fixtures, no backend involved.
	if (params.id === 'mock') {
		const raw = url.searchParams.get('stage') as Stage | null;
		const stage: Stage = raw && STAGE_ORDER.includes(raw) ? raw : 'event';
		const speed = Number(url.searchParams.get('speed') ?? '1') || 1;
		return {
			kind: 'session',
			session: sessionAt(stage),
			offline: true,
			speed,
			key: `mock-${stage}`
		};
	}

	try {
		const res = await fetchWithRetry(
			`/api/sessions/${encodeURIComponent(params.id)}`,
			undefined,
			fetch
		);
		if (res.status === 404) {
			return {
				kind: 'error',
				reason: 'not_found',
				id: params.id,
				message:
					'This session doesn’t exist, or it belongs to an account. If it’s yours, sign in first.'
			};
		}
		if (!res.ok) {
			return {
				kind: 'error',
				reason: 'failed',
				id: params.id,
				message: `The server answered ${res.status}.`
			};
		}
		const session = (await res.json()) as Session;
		return { kind: 'session', session, offline: false, speed: 1, key: session.id };
	} catch {
		return {
			kind: 'error',
			reason: 'unreachable',
			id: params.id,
			message: 'Godmother’s server can’t be reached right now.'
		};
	}
};
