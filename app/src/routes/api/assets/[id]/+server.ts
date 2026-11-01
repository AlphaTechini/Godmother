import { json } from '@sveltejs/kit';
import { canOpenSession } from '#lib/server/auth';
import { getAssetMeta, getSession, isDemoAssetId, readAsset } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, request }) => {
	const notFound = () => json({ error: 'Asset not found.' }, { status: 404 });
	const meta = await getAssetMeta(params.id);
	const owner = meta?.sessionId ? await getSession(meta.sessionId) : null;
	// An image follows its session: one in an account's session opens only for that account.
	if (owner && !canOpenSession(owner, locals.user)) return notFound();
	const asset = await readAsset(params.id);
	if (!asset) return notFound();
	const headers: Record<string, string> = {
		'content-type': asset.mime,
		'content-length': String(asset.bytes.byteLength),
		// People's photos must never sit in a shared cache. Only the bundled demo images may.
		'cache-control': isDemoAssetId(params.id)
			? 'public, max-age=31536000, immutable'
			: 'private, max-age=3600',
		'x-content-type-options': 'nosniff'
	};
	if (asset.mime === 'image/svg+xml') {
		headers['content-security-policy'] =
			"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
	}
	// Video players ask for byte ranges, and Safari won't play a video without them.
	const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
	if (asset.mime.startsWith('video/')) {
		headers['accept-ranges'] = 'bytes';
		if (range && (range[1] || range[2])) {
			const size = asset.bytes.byteLength;
			const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
			const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
			if (start > end || start >= size) {
				return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
			}
			headers['content-range'] = `bytes ${start}-${end}/${size}`;
			headers['content-length'] = String(end - start + 1);
			return new Response(asset.bytes.subarray(start, end + 1) as Uint8Array<ArrayBuffer>, {
				status: 206,
				headers
			});
		}
	}
	return new Response(asset.bytes as Uint8Array<ArrayBuffer>, { headers });
};
