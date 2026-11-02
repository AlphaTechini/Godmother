import type { PageLoad } from './$types';
import type { Session } from '#lib/types';
import { fetchWithRetry } from '#lib/client/retry';

export type StudioData =
	| { kind: 'session'; session: Session; key: string }
	| { kind: 'error'; reason: 'not_found' | 'unreachable' | 'failed'; message: string; id: string };

export const load: PageLoad = async ({ params, fetch }): Promise<StudioData> => {
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
		return { kind: 'session', session, key: session.id };
	} catch {
		return {
			kind: 'error',
			reason: 'unreachable',
			id: params.id,
			message: 'Godmother’s server can’t be reached right now.'
		};
	}
};
