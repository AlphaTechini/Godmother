import type { Handle } from '@sveltejs/kit/hooks';
import { currentUser } from '#lib/server/auth';
import { ensureDevice } from '#lib/server/auth/device';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await currentUser(event.cookies);
	event.locals.device = event.url.pathname.startsWith('/api/auth/')
		? ensureDevice(event.cookies)
		: null;
	return resolve(event);
};
