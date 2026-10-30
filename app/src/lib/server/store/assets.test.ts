import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () => (await import('./test-config')).mockConfigModule());

import { testDirs } from './test-config';
import {
	AssetError,
	getAssetMeta,
	getAssetPath,
	readAsset,
	saveAsset,
	saveAssetFromUrl
} from './assets';

// 1x1 PNG
const PNG = Uint8Array.from(
	Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
		'base64'
	)
);
const SVG = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>'
);

afterEach(() => vi.unstubAllGlobals());

describe('assets', () => {
	it('saves and reads back an upload with metadata', async () => {
		const a = await saveAsset({ bytes: PNG, mime: 'image/png', kind: 'upload', sessionId: 's' });
		expect(a).toMatchObject({ kind: 'upload', mime: 'image/png', width: 1, height: 1 });
		expect(a.url).toBe(`/api/assets/${a.id}`);
		const read = await readAsset(a.id);
		expect(read?.mime).toBe('image/png');
		expect(Buffer.from(read!.bytes).equals(Buffer.from(PNG))).toBe(true);
		expect((await getAssetMeta(a.id))?.sessionId).toBe('s');
		expect(await getAssetPath(a.id)).toBe(join(testDirs.dataDir, 'assets', `${a.id}.png`));
		expect(
			JSON.parse(await readFile(join(testDirs.dataDir, 'assets', `${a.id}.json`), 'utf8')).id
		).toBe(a.id);
	});

	it('rejects disallowed mime types and mismatched content', async () => {
		await expect(
			saveAsset({ bytes: PNG, mime: 'application/pdf', kind: 'upload' })
		).rejects.toThrow(/Unsupported image type/);
		await expect(
			saveAsset({ bytes: PNG, mime: 'image/gif', kind: 'upload' })
		).rejects.toBeInstanceOf(AssetError);
		await expect(
			saveAsset({ bytes: new TextEncoder().encode('hello'), mime: 'image/png', kind: 'upload' })
		).rejects.toThrow(/not a valid/);
	});

	it('trusts the bytes over the declared mime', async () => {
		const a = await saveAsset({ bytes: PNG, mime: 'image/jpg', kind: 'upload' });
		expect(a.mime).toBe('image/png');
	});

	it('handles svg uploads', async () => {
		const a = await saveAsset({ bytes: SVG, mime: 'image/svg+xml', kind: 'generated' });
		expect(a).toMatchObject({ mime: 'image/svg+xml', width: 40, height: 20 });
	});

	it('returns null for unknown, malformed and traversal ids', async () => {
		expect(await readAsset('00000000-0000-4000-8000-000000000000')).toBeNull();
		expect(await readAsset('../../etc/passwd')).toBeNull();
		expect(await readAsset('demo-../../x')).toBeNull();
		expect(await getAssetPath('demo-nope')).toBeNull();
	});

	it('resolves demo-* ids to files in demo/assets (read-only)', async () => {
		await mkdir(join(testDirs.demoDir, 'assets'), { recursive: true });
		await writeFile(join(testDirs.demoDir, 'assets', 'look-1.svg'), SVG);
		await writeFile(join(testDirs.demoDir, 'assets', 'face.png'), PNG);
		const svg = await readAsset('demo-look-1');
		expect(svg?.mime).toBe('image/svg+xml');
		expect(svg?.bytes.byteLength).toBe(SVG.byteLength);
		expect((await readAsset('demo-face'))?.mime).toBe('image/png');
		expect(await getAssetPath('demo-face')).toBe(join(testDirs.demoDir, 'assets', 'face.png'));
		expect(await getAssetMeta('demo-face')).toMatchObject({
			id: 'demo-face',
			url: '/api/assets/demo-face',
			kind: 'demo',
			width: 1
		});
	});

	describe('saveAssetFromUrl', () => {
		const respond = (body: Uint8Array, type: string, extra: Record<string, string> = {}) =>
			vi.stubGlobal(
				'fetch',
				vi.fn(
					async () =>
						new Response(body as Uint8Array<ArrayBuffer>, {
							headers: { 'content-type': type, ...extra }
						})
				)
			);

		it('downloads an image', async () => {
			respond(PNG, 'image/png');
			const a = await saveAssetFromUrl('https://example.com/a.png', { kind: 'result', label: 'r' });
			expect(a).toMatchObject({ kind: 'result', label: 'r', mime: 'image/png' });
			expect((await readAsset(a.id))?.bytes.byteLength).toBe(PNG.byteLength);
		});

		it('rejects non-images, oversize bodies and bad protocols', async () => {
			respond(new TextEncoder().encode('<html>'), 'text/html');
			await expect(saveAssetFromUrl('https://example.com/x', { kind: 'result' })).rejects.toThrow(
				/did not return an image/
			);
			respond(PNG, 'image/png');
			await expect(
				saveAssetFromUrl('https://example.com/x', { kind: 'result', maxBytes: 10 })
			).rejects.toThrow(/larger than/);
			await expect(saveAssetFromUrl('file:///etc/passwd', { kind: 'result' })).rejects.toThrow(
				/protocol/
			);
		});

		it('rejects on HTTP errors', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => new Response('no', { status: 404 }))
			);
			await expect(saveAssetFromUrl('https://example.com/x', { kind: 'result' })).rejects.toThrow(
				/HTTP 404/
			);
		});
	});
});
