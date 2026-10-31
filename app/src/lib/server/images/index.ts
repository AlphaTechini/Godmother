// The one place that picks the image provider. Null when none is configured.

import { config } from '#lib/server/config';
import { createCloudinaryStore } from './cloudinary';
import type { ImageStore } from './types';

export type { ImageStore } from './types';

let store: ImageStore | null | undefined;

export function getImageStore(): ImageStore | null {
	if (store === undefined) {
		const { cloudName, apiKey, apiSecret } = config.images;
		store =
			cloudName && apiKey && apiSecret
				? createCloudinaryStore({ cloudName, apiKey, apiSecret })
				: null;
	}
	return store;
}
