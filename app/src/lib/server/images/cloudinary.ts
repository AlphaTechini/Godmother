// The Cloudinary adapter. Images use the "authenticated" type: public links don't work, and only
// this server can fetch them, with a signed download URL. Browsers get them through /api/assets.

import { v2 as cloudinary } from 'cloudinary';
import type { ImageStore } from './types';

const FOLDER = 'godmother';

const FORMAT_BY_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/heic': 'heic',
	'image/svg+xml': 'svg'
};

export function createCloudinaryStore(settings: {
	cloudName: string;
	apiKey: string;
	apiSecret: string;
}): ImageStore {
	cloudinary.config({
		cloud_name: settings.cloudName,
		api_key: settings.apiKey,
		api_secret: settings.apiSecret,
		secure: true
	});

	return {
		put(id, bytes) {
			return new Promise((resolve, reject) => {
				const upload = cloudinary.uploader.upload_stream(
					{
						public_id: `${FOLDER}/${id}`,
						resource_type: 'image',
						type: 'authenticated',
						overwrite: false
					},
					(err) => (err ? reject(new Error(err.message)) : resolve())
				);
				upload.end(Buffer.from(bytes));
			});
		},

		async get(id, mime) {
			const url = cloudinary.utils.private_download_url(
				`${FOLDER}/${id}`,
				FORMAT_BY_MIME[mime] ?? 'jpg',
				{ resource_type: 'image', type: 'authenticated' }
			);
			const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
			if (res.status === 404) return null;
			if (!res.ok) throw new Error(`Cloudinary answered ${res.status}`);
			return new Uint8Array(await res.arrayBuffer());
		}
	};
}
