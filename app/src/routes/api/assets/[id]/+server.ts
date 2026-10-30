import { json } from '@sveltejs/kit';
import { readAsset } from '#lib/server/store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const asset = await readAsset(params.id);
	if (!asset) return json({ error: 'Asset not found.' }, { status: 404 });
	const headers: Record<string, string> = {
		'content-type': asset.mime,
		'content-length': String(asset.bytes.byteLength),
		'cache-control': 'public, max-age=31536000, immutable',
		'x-content-type-options': 'nosniff'
	};
	if (asset.mime === 'image/svg+xml') {
		headers['content-security-policy'] =
			"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
	}
	return new Response(asset.bytes as Uint8Array<ArrayBuffer>, { headers });
};
