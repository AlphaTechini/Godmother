import type { Handle } from '@sveltejs/kit/hooks';
import { currentUser } from '#lib/server/auth';
import { ensureDevice } from '#lib/server/auth/device';
import { cameThroughEdge } from '#lib/server/auth/edge';

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (path.startsWith('/api/') && !cameThroughEdge(event.request)) {
		return Response.json({ error: 'Not found.' }, { status: 404 });
	}
	event.locals.user = await currentUser(event.cookies);
	event.locals.device =
		path.startsWith('/api/auth/') || path.startsWith('/api/sessions')
			? ensureDevice(event.cookies)
			: null;
	return resolve(event);
};
