import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () => (await import('./test-config')).mockYouCamConfig());

import sharp from 'sharp';
import { analysisCropRect, prepareVariant, variantKey } from './images';
import { jpeg, storeImage } from './test-helpers';
import { deriveUndertone, describeColor, describeSkinTone, hexToLab, normalizeHex } from './color';
import { engineErrorMessage, toTaskError, YouCamHttpError } from './errors';

async function meta(b: Buffer) {
	const m = await sharp(b).metadata();
	return { w: m.width!, h: m.height!, format: m.format };
}

describe('image variants', () => {
	it('clothes: jpeg, long side <= 2048; hair <= 1024; makeup <= 1536; accessory <= 2048', async () => {
		const png = await sharp({
			create: {
				width: 3000,
				height: 2000,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0.5 }
			}
		})
			.png()
			.toBuffer();
		const { saveAsset } = await import('#lib/server/store');
		const asset = await saveAsset({ bytes: png, mime: 'image/png', kind: 'upload' });
		const limits = { clothes: 2048, hair: 1024, makeup: 1536, accessory: 2048 } as const;
		for (const [variant, long] of Object.entries(limits)) {
			const out = await prepareVariant(asset, variant as keyof typeof limits, 'test');
			const m = await meta(out.bytes);
			expect(m.format).toBe('jpeg');
			expect(Math.max(m.w, m.h)).toBe(long);
			expect(m.w / m.h).toBeCloseTo(1.5, 1);
		}
	});

	it('never upscales small images', async () => {
		const asset = await storeImage(await jpeg(300, 200));
		const out = await prepareVariant(asset, 'clothes', 'test');
		expect(await meta(out.bytes)).toMatchObject({ w: 300, h: 200 });
	});

	it('applies EXIF orientation first', async () => {
		// 200x100 stored with orientation 6 (rotate 90 cw) -> displayed 100x200
		const raw = await sharp({
			create: { width: 200, height: 100, channels: 3, background: '#55a' }
		})
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toBuffer();
		const asset = await storeImage(raw);
		const out = await prepareVariant(asset, 'clothes', 'test');
		expect(await meta(out.bytes)).toMatchObject({ w: 100, h: 200 });
		// and the analysis crop is computed on the rotated image (100x200 -> 55 wide)
		const a = await prepareVariant(asset, 'analysis', 'test');
		expect(Math.min(a.width, a.height)).toBe(320); // 55x69 crop upscaled to the 320 px minimum
	});

	it('analysis: upper-centre crop with the face > 60% of the width', async () => {
		expect(analysisCropRect(1000, 1500)).toEqual({ left: 225, top: 0, width: 550, height: 688 });
		// landscape: full height, centred horizontally
		expect(analysisCropRect(2000, 1000)).toEqual({ left: 600, top: 0, width: 800, height: 1000 });
	});

	it('analysis: a faceBox centres the crop on the face, face ~64% of width', () => {
		const r = analysisCropRect(2000, 3000, { x: 0.3, y: 0.2, width: 0.3, height: 0.2 });
		expect(r.width).toBeCloseTo((0.3 * 2000) / 0.64, -1);
		expect(r.left + r.width / 2).toBeCloseTo(0.45 * 2000, -1);
		// near the edge: clamped inside the image
		const edge = analysisCropRect(1000, 1000, { x: 0, y: 0, width: 0.3, height: 0.3 });
		expect(edge.left).toBe(0);
		expect(edge.top).toBe(0);
		expect(variantKey('analysis', { faceBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } })).toBe(
			'analysis@0.100,0.200,0.300,0.400'
		);
		expect(variantKey('hair', { faceBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } })).toBe(
			'hair'
		);
	});

	it('reports missing assets', async () => {
		await expect(
			prepareVariant(
				{ id: '22222222-2222-4222-8222-222222222222', url: '', kind: 'upload', mime: 'image/jpeg' },
				'hair',
				'test'
			)
		).rejects.toMatchObject({ code: 'asset_missing' });
	});
});

describe('colour helpers', () => {
	it('derives undertone from skin hex (our estimate)', () => {
		expect(deriveUndertone('#bc9d88')).toBe('warm');
		expect(deriveUndertone('#e0a8a8')).toBe('cool');
		expect(deriveUndertone('#d2a98f')).toBe('neutral');
		expect(deriveUndertone('#a89a6a')).toBe('olive');
		const lab = hexToLab('#ffffff');
		expect(lab.L).toBeCloseTo(100, 0);
		expect(Math.abs(lab.a)).toBeLessThan(0.5);
	});

	it('names colours and skin depth', () => {
		expect(describeSkinTone('#f1d9c8')).toBe('Fair');
		expect(describeSkinTone('#8d5a3b')).toBe('Deep');
		expect(describeColor('#000000')).toBe('Black');
		expect(describeColor('#be8782')).toBe('Rose');
		expect(describeColor('#1e90ff')).toBe('Blue');
		expect(normalizeHex('bc9d88')).toBe('#BC9D88');
		expect(normalizeHex('nope')).toBeUndefined();
	});
});

describe('error messages', () => {
	it('maps engine codes, including upper-case jewellery codes', () => {
		expect(engineErrorMessage('error_no_shoulder')).toMatch(/shoulders/);
		expect(engineErrorMessage('PHOTO_DETECTION_FAIL')).toMatch(/back of the hand/);
		expect(engineErrorMessage('error_something_new')).toMatch(/error_something_new/);
	});

	it('maps HTTP failures', () => {
		const t = (status: number, code?: string, msg?: string) =>
			toTaskError(new YouCamHttpError(status, code, msg), 'garment').code;
		expect(t(400, 'CreditInsufficiency')).toBe('credit_insufficiency');
		expect(t(400, 'InvalidParameters', 'noisy')).toBe('invalid_parameters');
		expect(t(401, 'InvalidAccessToken')).toBe('unauthorized');
		expect(t(401, 'ExpiredApiKey')).toBe('unauthorized');
		expect(t(429)).toBe('rate_limited');
		expect(t(404, 'InvalidTaskId')).toBe('invalid_task_id');
		expect(t(500, 'TaskTimeout')).toBe('task_timeout');
		expect(t(502)).toBe('server_error');
	});
});
