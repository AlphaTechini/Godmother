import { json } from '@sveltejs/kit';
import { canOpenSession } from '#lib/server/auth';
import { getAssetMeta, getSession, isDemoAssetId, readAsset } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
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
	return new Response(asset.bytes as Uint8Array<ArrayBuffer>, { headers });
};
