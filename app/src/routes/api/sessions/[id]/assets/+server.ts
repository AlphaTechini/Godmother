import { json } from '@sveltejs/kit';
import { canOpenSession } from '#lib/server/auth';
import { config } from '#lib/server/config';
import {
	AssetError,
	getSession,
	saveAsset,
	saveSession,
	waitForCloudCopies,
	withSessionLock
} from '#lib/server/store';
import type { AttachmentPurpose, PhotoSlot } from '#lib/types';
import type { RequestHandler } from './$types';

const PURPOSES: readonly AttachmentPurpose[] = [
	'fullBody',
	'portrait',
	'hand',
	'invitation',
	'wardrobe',
	'other'
];
const PHOTO_SLOTS: readonly PhotoSlot[] = ['fullBody', 'portrait', 'hand'];

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await getSession(params.id);
	if (!session || !canOpenSession(session, locals.user)) {
		return json({ error: 'Session not found.' }, { status: 404 });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json(
			{ error: 'Expected multipart/form-data with "file" and "purpose".' },
			{ status: 400 }
		);
	}
	const file = form.get('file');
	const purpose = form.get('purpose');
	if (!(file instanceof File)) return json({ error: '"file" is required.' }, { status: 400 });
	if (typeof purpose !== 'string' || !PURPOSES.includes(purpose as AttachmentPurpose)) {
		return json({ error: `"purpose" must be one of ${PURPOSES.join(', ')}.` }, { status: 400 });
	}
	if (file.size > config.maxUploadBytes) {
		return json(
			{ error: `File is too large (max ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB).` },
			{ status: 413 }
		);
	}

	try {
		const {
			sessionId: _s,
			createdAt: _c,
			...asset
		} = await saveAsset({
			bytes: new Uint8Array(await file.arrayBuffer()),
			mime: file.type,
			kind: 'upload',
			sessionId: session.id,
			sync: session.mode === 'live'
		});
		if (PHOTO_SLOTS.includes(purpose as PhotoSlot)) {
			await withSessionLock(session.id, async () => {
				session.photos[purpose as PhotoSlot] = asset;
				await saveSession(session);
			});
		}
		await waitForCloudCopies(session.id);
		return json(asset);
	} catch (err) {
		if (err instanceof AssetError) return json({ error: err.message }, { status: err.status });
		console.error('[assets] upload failed', err);
		return json({ error: 'Could not store the file.' }, { status: 500 });
	}
};
