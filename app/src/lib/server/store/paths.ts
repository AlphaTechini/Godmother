import { join } from 'node:path';
import { config } from '#lib/server/config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: unknown): boolean {
	return typeof id === 'string' && UUID_RE.test(id);
}

export function isAssetId(id: unknown): boolean {
	return isUuid(id);
}

/** Directory of one session. Throws on anything that is not a uuid (path traversal guard). */
export function sessionDir(id: string): string {
	if (!isUuid(id))
		throw new Error(`Invalid session id: ${JSON.stringify(String(id).slice(0, 64))}`);
	return join(config.dataDir, 'sessions', id.toLowerCase());
}

export function assetsDir(): string {
	return join(config.dataDir, 'assets');
}
