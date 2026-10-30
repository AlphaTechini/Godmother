import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () => (await import('./test-config')).mockYouCamConfig());

import sharp from 'sharp';
import { config } from '#lib/server/config';
import { readAsset } from '#lib/server/store';
import { setPollSchedule } from './client';
import { flushFileCache, resetFileCache } from './files';
import {
	analyzeFace,
	applyHairstyle,
	applyMakeup,
	generateGarmentImage,
	listHairTemplates,
	tryOnAccessory,
	tryOnGarment,
	tryOnShoes,
	unitCost
} from './features';
import { UnitCapError, YouCamTaskError } from './errors';
import { reservedUnits } from './ledger';
import { tuning } from './tuning';
import {
	FakeYouCam,
	installFake,
	jpeg,
	makeSession,
	pngAlpha,
	storeImage,
	uninstallFake
} from './test-helpers';

let fake: FakeYouCam;
const youcam = config.youcam as { pollTimeoutMs: number; chainMode: string };

beforeEach(async () => {
	fake = installFake();
	fake.defaultResult = await jpeg(40, 60);
	youcam.pollTimeoutMs = 3000;
	youcam.chainMode = 'reupload';
});
afterEach(() => {
	uninstallFake();
	tuning.chargeOnTimeout = true;
	tuning.shoesEngine = 'cloth-v4';
});

async function inputs() {
	return { person: await storeImage(), garment: await storeImage(await jpeg(80, 80)) };
}

describe('garment try-on', () => {
	it('uploads, creates, polls, stores the result and records the ledger', async () => {
		const session = makeSession(10);
		const { person, garment } = await inputs();
		const out = await tryOnGarment({ session }, { person, garment, category: 'upper_body' });

		expect(out.units).toBe(2);
		expect(out.image.kind).toBe('result');
		expect(out.image.mime).toBe('image/jpeg'); // sniffed from bytes, not the octet-stream header
		expect((await readAsset(out.image.id))?.bytes.byteLength).toBeGreaterThan(0);
		expect(out.image.url).toBe(`/api/assets/${out.image.id}`);

		expect(session.units.spent).toBe(2);
		expect(session.units.ledger).toHaveLength(1);
		expect(session.units.ledger[0]).toMatchObject({ feature: 'garment', units: 2, ok: true });
		expect(session.units.ledger[0].taskId).toMatch(/^task\//);
		expect(session.units.ledger[0].seconds).toBeTypeOf('number');
		expect(reservedUnits(session.id)).toBe(0);

		// file API x2, S3 PUT x2, one create, polls with the encoded id, one download
		expect(fake.fileApiCalls()).toHaveLength(2);
		expect(fake.uploads.size).toBe(2);
		for (const call of fake.calls.filter((c) => c.url.host === 's3.test')) {
			expect(call.method).toBe('PUT');
			expect(call.headers.get('authorization')).toBeNull(); // never send our key to S3
			expect(call.headers.get('content-type')).toBe('image/jpg');
			expect(call.headers.get('content-length')).toBe(String((call.raw as Uint8Array).byteLength));
		}
		const create = fake.creates()[0];
		expect(create.url.pathname).toBe('/s2s/v2.0/task/cloth-v4');
		expect(create.headers.get('authorization')).toBe('Bearer test-key');
		expect(create.headers.get('content-type')).toBe('application/json');
		expect(create.body).toMatchObject({
			garment_category: 'upper_body',
			change_shoes: true
		});
		expect(create.body.src_file_id).toMatch(/^file-/);
		expect(create.body.ref_file_id).toMatch(/^file-/);
		expect(create.body.src_file_id).not.toBe(create.body.ref_file_id);
		const poll = fake.polls()[0];
		expect(poll.url.pathname).toBe(`/s2s/v2.0/task/cloth-v4/${encodeURIComponent('task/1+z')}`);
		expect(fake.calls.filter((c) => c.url.host === 'results.test')).toHaveLength(1);
	});

	it('passes change_shoes through', async () => {
		const { person, garment } = await inputs();
		await tryOnGarment(
			{ session: makeSession() },
			{ person, garment, category: 'full_body', changeShoes: false }
		);
		expect(fake.creates()[0].body).toMatchObject({
			garment_category: 'full_body',
			change_shoes: false
		});
	});

	it('maps an engine error to a friendly YouCamTaskError and an ok:false ledger entry', async () => {
		fake.onPoll = () => ({
			json: {
				status: 200,
				data: { task_status: 'error', error: 'error_no_shoulder', error_message: 'x' }
			}
		});
		const session = makeSession(10);
		const { person, garment } = await inputs();
		const err = await tryOnGarment({ session }, { person, garment, category: 'upper_body' }).catch(
			(e) => e
		);
		expect(err).toBeInstanceOf(YouCamTaskError);
		expect(err.code).toBe('error_no_shoulder');
		expect(err.feature).toBe('garment');
		expect(err.userMessage).toBe(
			'YouCam needs your shoulders in the portrait. Try a photo framed from the chest up.'
		);
		expect(session.units.spent).toBe(0);
		expect(session.units.ledger).toHaveLength(1);
		expect(session.units.ledger[0]).toMatchObject({ ok: false, units: 0, feature: 'garment' });
		expect(reservedUnits(session.id)).toBe(0);
		expect(fake.calls.filter((c) => c.url.host === 'results.test')).toHaveLength(0);
	});

	it('throws UnitCapError before any network call', async () => {
		const session = makeSession(3, 2); // 1 unit left, garment costs 2
		const { person, garment } = await inputs();
		fake.calls.length = 0;
		const err = await tryOnGarment({ session }, { person, garment, category: 'upper_body' }).catch(
			(e) => e
		);
		expect(err).toBeInstanceOf(UnitCapError);
		expect(err).toMatchObject({ needed: 2, remaining: 1 });
		expect(fake.calls).toHaveLength(0);
		expect(session.units.ledger).toHaveLength(0);
		expect(session.units.spent).toBe(2);
	});

	it('cannot overshoot the cap when looks render in parallel', async () => {
		const session = makeSession(4);
		const { person, garment } = await inputs();
		const runs = [0, 1, 2].map(() =>
			tryOnGarment({ session }, { person, garment, category: 'full_body' })
		);
		const settled = await Promise.allSettled(runs);
		expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(2);
		const rejected = settled.filter((s) => s.status === 'rejected') as PromiseRejectedResult[];
		expect(rejected).toHaveLength(1);
		expect(rejected[0].reason).toBeInstanceOf(UnitCapError);
		expect(session.units.spent).toBe(4);
		expect(session.units.spent).toBeLessThanOrEqual(session.units.cap);
		expect(fake.creates()).toHaveLength(2);
		expect(reservedUnits(session.id)).toBe(0);
		// shared photos were uploaded once, not once per parallel look
		expect(fake.fileApiCalls()).toHaveLength(2);
	});

	it('gives reserved units back when a failure happens before the task is created', async () => {
		const session = makeSession(2);
		const person = await storeImage();
		const missing = { ...person, id: '11111111-1111-4111-8111-111111111111' };
		await expect(
			tryOnGarment({ session }, { person, garment: missing, category: 'upper_body' })
		).rejects.toMatchObject({ code: 'asset_missing' });
		expect(reservedUnits(session.id)).toBe(0);
		expect(session.units.ledger).toHaveLength(0);
		// the full cap is still usable
		const garment = await storeImage();
		await tryOnGarment({ session }, { person, garment, category: 'upper_body' });
		expect(session.units.spent).toBe(2);
	});

	it('rejects an unreadable (HEIC) photo with a friendly message and no network calls', async () => {
		const heic = Buffer.concat([
			Buffer.from([0, 0, 0, 24]),
			Buffer.from('ftypheic'),
			Buffer.alloc(40)
		]);
		const { saveAsset } = await import('#lib/server/store');
		const person = await saveAsset({ bytes: heic, mime: 'image/heic', kind: 'upload' });
		const garment = await storeImage();
		const session = makeSession();
		fake.calls.length = 0;
		const err = await tryOnGarment({ session }, { person, garment, category: 'upper_body' }).catch(
			(e) => e
		);
		expect(err).toBeInstanceOf(YouCamTaskError);
		expect(err.code).toBe('unsupported_image');
		expect(err.userMessage).toMatch(/JPEG or PNG/);
		expect(fake.creates()).toHaveLength(0);
		expect(session.units.spent).toBe(0);
	});
});

describe('polling and retries', () => {
	it('keeps polling through 429, 5xx and network failures', async () => {
		fake.onPoll = (_t, n) => {
			if (n === 1) return { status: 429, json: { status: 429, error: 'Too many requests' } };
			if (n === 2) return 'network';
			if (n === 3) return { status: 503, json: { status: 503, error: 'unavailable' } };
			if (n === 4) return { json: { status: 200, data: { task_status: 'queued_weirdly' } } }; // unknown = running
			return undefined; // default: success from the 5th poll
		};
		const session = makeSession();
		const { person, garment } = await inputs();
		await tryOnGarment({ session }, { person, garment, category: 'upper_body' });
		expect(fake.creates()).toHaveLength(1);
		expect(fake.polls().length).toBeGreaterThanOrEqual(5);
		expect(session.units.ledger[0]).toMatchObject({ ok: true, units: 2 });
	});

	it('never retries a create POST (HTTP 500)', async () => {
		fake.onCreate = () =>
			new Response(JSON.stringify({ status: 500, error: 'oops' }), { status: 500 });
		const session = makeSession();
		const { person, garment } = await inputs();
		const err = await tryOnGarment({ session }, { person, garment, category: 'upper_body' }).catch(
			(e) => e
		);
		expect(err).toBeInstanceOf(YouCamTaskError);
		expect(fake.creates()).toHaveLength(1);
		expect(session.units.ledger[0]).toMatchObject({ ok: false, units: 0 });
	});

	it('never retries a create POST (network failure) and says it may have started', async () => {
		fake.onCreate = () => {
			throw new TypeError('fetch failed');
		};
		const session = makeSession();
		const { person, garment } = await inputs();
		const err = await tryOnGarment({ session }, { person, garment, category: 'upper_body' }).catch(
			(e) => e
		);
		expect(err.code).toBe('network');
		expect(err.userMessage).toMatch(/may have started/);
		expect(fake.creates()).toHaveLength(1);
	});

	it('maps CreditInsufficiency and 401 on create', async () => {
		const { person, garment } = await inputs();
		fake.onCreate = () =>
			new Response(
				JSON.stringify({ status: 400, error: 'no credit', error_code: 'CreditInsufficiency' }),
				{ status: 400 }
			);
		await expect(
			tryOnGarment({ session: makeSession() }, { person, garment, category: 'upper_body' })
		).rejects.toMatchObject({ code: 'credit_insufficiency' });
		fake.onCreate = () =>
			new Response(JSON.stringify({ status: 401, error_code: 'InvalidApiKey' }), { status: 401 });
		await expect(
			tryOnGarment({ session: makeSession() }, { person, garment, category: 'upper_body' })
		).rejects.toMatchObject({ code: 'unauthorized' });
	});

	it('times out, counts the possibly-charged units, and keeps the task id', async () => {
		youcam.pollTimeoutMs = 40;
		fake.onPoll = () => ({ json: { status: 200, data: { task_status: 'running' } } });
		const session = makeSession();
		const { person, garment } = await inputs();
		const err = await tryOnGarment({ session }, { person, garment, category: 'upper_body' }).catch(
			(e) => e
		);
		expect(err.code).toBe('timeout');
		expect(err.taskId).toMatch(/^task\//);
		expect(session.units.ledger[0]).toMatchObject({ ok: false, units: 2 });
		expect(session.units.spent).toBe(2);

		tuning.chargeOnTimeout = false;
		const s2 = makeSession();
		await tryOnGarment({ session: s2 }, { person, garment, category: 'upper_body' }).catch(
			() => {}
		);
		expect(s2.units.spent).toBe(0);
	});

	it('uses the default schedule: first poll ~2 s, then 3 s, then 5 s', async () => {
		setPollSchedule({});
		const { pollSchedule } = await import('./client');
		const s = pollSchedule();
		expect(s).toMatchObject({ firstMs: 2000, earlyUntilMs: 15_000, laterMs: 5000 });
		expect(s.earlyMs).toBe(1); // config.youcam.pollIntervalMs in the test config
	});
});

describe('file id cache', () => {
	it('does not upload the same (asset, variant) twice, also after a restart', async () => {
		const { person, garment } = await inputs();
		const a = makeSession();
		await tryOnGarment({ session: a }, { person, garment, category: 'upper_body' });
		expect(fake.fileApiCalls()).toHaveLength(2);

		await tryOnGarment({ session: a }, { person, garment, category: 'lower_body' });
		expect(fake.fileApiCalls()).toHaveLength(2); // memory hit

		await flushFileCache();
		resetFileCache(); // "restart": memory gone, JSON file stays
		await tryOnGarment({ session: a }, { person, garment, category: 'outer' });
		expect(fake.fileApiCalls()).toHaveLength(2); // disk hit

		// another variant of the same asset is a different key
		const makeupSession = makeSession();
		fake.defaultResult = await pngAlpha();
		await applyMakeup({ session: makeupSession }, { portrait: person, effects: [simpleLip()] });
		expect(fake.fileApiCalls()).toHaveLength(3);
	});

	it('ignores expired entries (29 days)', async () => {
		const { person, garment } = await inputs();
		const s = makeSession();
		await tryOnGarment({ session: s }, { person, garment, category: 'upper_body' });
		const realNow = Date.now;
		await flushFileCache();
		resetFileCache();
		const later = realNow() + 30 * 24 * 3600 * 1000;
		vi.spyOn(Date, 'now').mockImplementation(() => later);
		try {
			await tryOnGarment({ session: s }, { person, garment, category: 'upper_body' });
		} finally {
			vi.restoreAllMocks();
		}
		expect(fake.fileApiCalls()).toHaveLength(4);
	});
});

describe('chaining', () => {
	it('re-uploads our stored result by default', async () => {
		const { person, garment } = await inputs();
		const s = makeSession();
		const first = await tryOnGarment({ session: s }, { person, garment, category: 'upper_body' });
		await tryOnGarment({ session: s }, { person: first.image, garment, category: 'lower_body' });
		const second = fake.creates()[1].body;
		expect(second.src_file_id).toMatch(/^file-/);
		expect(second.src_file_url).toBeUndefined();
	});

	it("passes src_file_url in chainMode 'url' for a fresh YouCam result", async () => {
		youcam.chainMode = 'url';
		const { person, garment } = await inputs();
		const s = makeSession();
		const first = await tryOnGarment({ session: s }, { person, garment, category: 'upper_body' });
		await tryOnGarment({ session: s }, { person: first.image, garment, category: 'lower_body' });
		const second = fake.creates()[1].body;
		expect(second.src_file_url).toMatch(/^https:\/\/results\.test\//);
		expect(second.src_file_id).toBeUndefined();
		expect(second.ref_file_id).toMatch(/^file-/);

		// older than 100 minutes -> back to re-upload
		const realNow = Date.now();
		vi.spyOn(Date, 'now').mockImplementation(() => realNow + 101 * 60 * 1000);
		try {
			await tryOnGarment({ session: s }, { person: first.image, garment, category: 'outer' });
		} finally {
			vi.restoreAllMocks();
		}
		expect(fake.creates()[2].body.src_file_id).toMatch(/^file-/);
	});
});

describe('shoes', () => {
	it('uses cloth-v4 with garment_category "shoes" by default', async () => {
		const { person, garment: shoes } = await inputs();
		await tryOnShoes({ session: makeSession() }, { person, shoes });
		const c = fake.creates()[0];
		expect(c.url.pathname).toBe('/s2s/v2.0/task/cloth-v4');
		expect(c.body.garment_category).toBe('shoes');
	});

	it('switches to shoes-transfer in one place', async () => {
		tuning.shoesEngine = 'shoes-transfer';
		const { person, garment: shoes } = await inputs();
		const s = makeSession();
		await tryOnShoes({ session: s }, { person, shoes });
		const c = fake.creates()[0];
		expect(c.url.pathname).toBe('/s2s/v2.0/task/shoes-transfer');
		expect(Object.keys(c.body).sort()).toEqual(['ref_file_id', 'src_file_id']);
		expect(s.units.ledger[0]).toMatchObject({ feature: 'shoes', units: 2 });
	});
});

function simpleLip() {
	return {
		category: 'lip_color',
		shape: { name: 'original' },
		style: { type: 'full' },
		palettes: [{ color: '#8E1B2C', texture: 'matte', colorIntensity: 85 }]
	};
}

describe('makeup', () => {
	it('validates first: an invalid plan spends nothing and makes no request', async () => {
		const s = makeSession();
		const portrait = await storeImage();
		fake.calls.length = 0;
		const bad = { ...simpleLip(), shape: { name: 'duckface' } };
		const err = await applyMakeup({ session: s }, { portrait, effects: [bad] }).catch((e) => e);
		expect(err).toBeInstanceOf(YouCamTaskError);
		expect(err.code).toBe('invalid_makeup');
		expect(err.details?.join(' ')).toMatch(/duckface/);
		expect(fake.calls).toHaveLength(0);
		expect(s.units.spent).toBe(0);
		expect(s.units.ledger).toHaveLength(0);
	});

	it('adds skin_smooth, sends version 1.0, flattens the PNG result onto white as JPEG', async () => {
		fake.defaultResult = await pngAlpha(24, 24);
		const s = makeSession();
		const portrait = await storeImage();
		const out = await applyMakeup({ session: s }, { portrait, effects: [simpleLip()] });
		const body = fake.creates()[0].body;
		expect(fake.creates()[0].url.pathname).toBe('/s2s/v2.0/task/makeup-vto');
		expect(body.version).toBe('1.0');
		expect(body.effects[0]).toMatchObject({ category: 'skin_smooth' });
		expect(body.effects).toHaveLength(2);
		expect(out.units).toBe(1);
		expect(out.image.mime).toBe('image/jpeg');
		const stored = await readAsset(out.image.id);
		const px = await sharp(Buffer.from(stored!.bytes)).raw().toBuffer();
		expect([...px.subarray(0, 3)].every((v) => v >= 250)).toBe(true); // white, not red/black
		expect(s.units.ledger[0]).toMatchObject({ feature: 'makeup', units: 1, ok: true });
	});

	it('keeps an existing skin_smooth and strips nulls', async () => {
		const s = makeSession();
		const portrait = await storeImage();
		const lip = { ...simpleLip(), morphology: null };
		await applyMakeup(
			{ session: s },
			{
				portrait,
				effects: [
					{ category: 'skin_smooth', skinSmoothStrength: 10, skinSmoothColorIntensity: 5 },
					lip
				]
			}
		);
		const effects = fake.creates()[0].body.effects;
		expect(effects).toHaveLength(2);
		expect(effects[0]).toEqual({
			category: 'skin_smooth',
			skinSmoothStrength: 10,
			skinSmoothColorIntensity: 5
		});
		expect(effects[1]).not.toHaveProperty('morphology');
	});
});

describe('hair', () => {
	it('sends the hair variant (jpeg <= 1024) and the template id to v2.1', async () => {
		const big = await sharp({
			create: { width: 2400, height: 1800, channels: 3, background: '#a33' }
		})
			.jpeg()
			.toBuffer();
		const portrait = await storeImage(big);
		const s = makeSession();
		const out = await applyHairstyle(
			{ session: s },
			{ portrait, templateId: 'all_classic_hollywood_waves' }
		);
		const c = fake.creates()[0];
		expect(c.url.pathname).toBe('/s2s/v2.1/task/hair-transfer');
		expect(c.body).toMatchObject({ template_id: 'all_classic_hollywood_waves' });
		expect(Object.keys(c.body).sort()).toEqual(['src_file_id', 'template_id']);
		const uploaded = [...fake.uploads.values()][0].bytes;
		const meta = await sharp(Buffer.from(uploaded)).metadata();
		expect(meta.format).toBe('jpeg');
		expect(Math.max(meta.width!, meta.height!)).toBe(1024);
		expect(out.units).toBe(2);
		expect(s.units.spent).toBe(2);
	});

	it('pages the template list, maps genders, caches it', async () => {
		fake.templatePages = [
			{
				templates: [
					{
						id: 'a_one',
						thumb: 'https://t/1.jpg',
						title: 'One',
						category_name: 'Female',
						keep_users_color: true
					}
				],
				next_token: '1'
			},
			{
				templates: [{ id: 'b_two', title: 'Two', category_name: 'Male', keep_users_color: false }],
				next_token: '2'
			},
			{ templates: [{ id: 'c_three', title: 'Three', category_name: 'Other' }], next_token: null }
		];
		const list = await listHairTemplates();
		expect(list).toEqual([
			{
				id: 'a_one',
				title: 'One',
				gender: 'female',
				thumbUrl: 'https://t/1.jpg',
				keepUsersColor: true
			},
			{ id: 'b_two', title: 'Two', gender: 'male', keepUsersColor: false },
			{ id: 'c_three', title: 'Three', gender: 'unisex', keepUsersColor: false }
		]);
		const pageCalls = fake.calls.filter((c) => c.url.pathname.includes('/template/hair-transfer'));
		expect(pageCalls).toHaveLength(3);
		expect(pageCalls[0].url.searchParams.get('page_size')).toBe('20');
		expect(pageCalls[1].url.searchParams.get('starting_token')).toBe('1');
		await listHairTemplates();
		expect(
			fake.calls.filter((c) => c.url.pathname.includes('/template/hair-transfer'))
		).toHaveLength(3); // cached
	});

	it('falls back to the gala template ids when the list cannot be fetched', async () => {
		fake.templatePages = 'error';
		const list = await listHairTemplates();
		const ids = list.map((t) => t.id);
		expect(ids).toContain('all_classic_hollywood_waves');
		expect(ids).toContain('male_textured_comma');
		expect(list.find((t) => t.id === 'female_messy_bun')).toMatchObject({
			gender: 'female',
			title: 'Messy Bun',
			keepUsersColor: true
		});
		expect(list.find((t) => t.id === 'male_afro')?.gender).toBe('male');
	});
});

describe('accessories', () => {
	it('earrings: 2D VTO body with ref_file_urls for a public product URL', async () => {
		const person = await storeImage();
		const product = await storeImage();
		const s = makeSession();
		const out = await tryOnAccessory(
			{ session: s },
			{ person, category: 'earrings', product, productUrl: 'https://shop.example/e.jpg' }
		);
		const c = fake.creates()[0];
		expect(c.url.pathname).toBe('/s2s/v2.0/task/2d-vto/earring');
		expect(c.body.src_file_id).toMatch(/^file-/);
		expect(c.body.source_info).toEqual({ name: c.body.src_file_id });
		expect(c.body.ref_file_urls).toEqual(['https://shop.example/e.jpg']);
		expect(c.body.ref_file_ids).toBeUndefined();
		expect(c.body.object_infos).toEqual([
			{ name: 'https://shop.example/e.jpg', parameter: { earring_need_remove_background: true } }
		]);
		expect(fake.fileApiCalls()).toHaveLength(1); // only the person was uploaded
		expect(fake.polls()[0].url.pathname).toContain('/2d-vto/earring/');
		expect(out.units).toBe(1);
		expect(s.units.ledger[0]).toMatchObject({ feature: 'accessory', units: 1 });
	});

	it('uploads the stored product when the URL is not public', async () => {
		const person = await storeImage();
		const product = await storeImage(await jpeg(50, 50));
		for (const productUrl of [
			undefined,
			'/api/assets/abc',
			'http://localhost:3000/p.jpg',
			'http://192.168.1.4/p.jpg'
		]) {
			fake.calls.length = 0;
			await tryOnAccessory(
				{ session: makeSession() },
				{ person, category: 'necklace', product, productUrl }
			);
			const c = fake.creates()[0];
			expect(c.url.pathname).toBe('/s2s/v2.0/task/2d-vto/necklace');
			expect(c.body.ref_file_urls).toBeUndefined();
			expect(c.body.ref_file_ids).toHaveLength(1);
			expect(c.body.object_infos[0].name).toBe(c.body.ref_file_ids[0]);
			expect(c.body.object_infos).toHaveLength(1);
			expect(c.body.object_infos[0].parameter).toEqual({ necklace_need_remove_background: true });
		}
	});
});

describe('face analysis', () => {
	it('runs skin tone then face attributes on the analysis crop and maps the FaceProfile', async () => {
		fake.resultsFor = (task) =>
			task.path.includes('skin-tone-analysis')
				? {
						color: {
							skin_color: '#bc9d88',
							eye_color: '#342724',
							eye_color_name: 'Brown',
							lip_color: '#be8782',
							eyebrow_color: '#805d47',
							hair_color: '#B56637',
							hair_color_name: 'Auburn'
						},
						face_quality: { has_face: true }
					}
				: {
						faceshape: 'Oval',
						eyelid: {
							left_eyelid: 'Double-lid',
							right_eyelid: 'Double-lid',
							left_shape: 'Almond',
							right_shape: 'Almond',
							left_angle: 'Upturned',
							right_angle: 'Average',
							setting: 'Wide-Set',
							size: 'Average'
						},
						eyebrow: { left_shape: 'Soft Angled', right_shape: 'Soft Angled', gap: 'Average' },
						lipshape: ['Full', 'Heavy Lower Lip']
					};
		const big = await sharp({
			create: { width: 1600, height: 2400, channels: 3, background: '#c96' }
		})
			.jpeg()
			.toBuffer();
		const portrait = await storeImage(big);
		const s = makeSession(60);
		const profile = await analyzeFace({ session: s }, { portrait });

		const creates = fake.creates();
		expect(creates.map((c) => c.url.pathname)).toEqual([
			'/s2s/v2.0/task/skin-tone-analysis',
			'/s2s/v2.0/task/face-attr-analysis'
		]);
		expect(creates[0].body.face_angle_strictness_level).toBe('medium');
		expect(creates[1].body.features).toEqual([
			'faceShape',
			'eyeShape',
			'eyelid',
			'lipShape',
			'eyebrowShape'
		]);
		// sequential: the second create happens after the first task finished polling
		const order = fake.calls.filter(
			(c) => c.url.host === 'yce.test' && c.url.pathname.includes('/task/')
		);
		const firstAttr = order.findIndex((c) => c.url.pathname.includes('face-attr'));
		expect(order.slice(0, firstAttr).some((c) => c.method === 'GET')).toBe(true);
		// one upload, and it is a face-filling crop: 55% of 1600 = 880 wide
		expect(fake.fileApiCalls()).toHaveLength(1);
		const meta = await sharp(Buffer.from([...fake.uploads.values()][0].bytes)).metadata();
		expect(meta.width).toBe(880);
		expect(meta.height).toBe(1100);

		expect(profile.skinTone).toEqual({ name: 'Medium', hex: '#BC9D88' });
		expect(profile.undertone).toBe('warm');
		expect(profile.eyeColor).toEqual({ name: 'Brown', hex: '#342724' });
		expect(profile.hairColor).toEqual({ name: 'Auburn', hex: '#B56637' });
		expect(profile.lipColor?.hex).toBe('#BE8782');
		expect(profile.faceShape).toBe('Oval');
		expect(profile.features).toMatchObject({
			face_shape: 'oval',
			eye_shape: 'almond',
			eyelid_type: 'double-lid',
			eye_angle: 'upturned / average',
			eye_setting: 'wide-set',
			eyebrow_shape: 'soft angled',
			lip_shape: 'full, heavy lower lip',
			eyebrow_color: '#805D47'
		});
		expect(s.units.spent).toBe(30);
		expect(s.units.ledger.map((e) => [e.feature, e.units, e.ok])).toEqual([
			['skin_tone', 20, true],
			['face_attributes', 10, true]
		]);
	});

	it('needs all 30 units up front', async () => {
		const s = makeSession(40, 20);
		const portrait = await storeImage();
		fake.calls.length = 0;
		await expect(analyzeFace({ session: s }, { portrait })).rejects.toBeInstanceOf(UnitCapError);
		expect(fake.calls).toHaveLength(0);
	});

	it('returns the paid-for skin tone when the attribute task fails', async () => {
		fake.resultsFor = () => ({ color: { skin_color: '#e0a8a8' } });
		fake.onPoll = (task, n) =>
			task.path.includes('face-attr') && n >= 1
				? {
						json: {
							status: 200,
							data: { task_status: 'error', error: 'error_face_not_forward_facing' }
						}
					}
				: undefined;
		const s = makeSession(60);
		const profile = await analyzeFace({ session: s }, { portrait: await storeImage() });
		expect(profile.skinTone?.hex).toBe('#E0A8A8');
		expect(profile.undertone).toBe('cool');
		expect(s.units.spent).toBe(20);
		expect(s.units.ledger[1]).toMatchObject({ feature: 'face_attributes', ok: false, units: 0 });
	});
});

describe('text to image', () => {
	it('sends the documented body and stores a generated asset', async () => {
		const s = makeSession();
		const out = await generateGarmentImage({ session: s }, { prompt: 'emerald satin gown' });
		expect(fake.creates()[0].url.pathname).toBe('/s2s/v2.0/task/text-to-image/youcam');
		expect(fake.creates()[0].body).toMatchObject({
			model: 'youcam-image-v2',
			prompt: 'emerald satin gown',
			size: '1104*1472',
			prompt_extend: false
		});
		expect(fake.fileApiCalls()).toHaveLength(0);
		expect(out.image.kind).toBe('generated');
		expect(out.units).toBe(1);
	});
});

describe('unitCost', () => {
	it('matches the price list', () => {
		expect(
			(
				[
					'garment',
					'shoes',
					'makeup',
					'hair',
					'accessory',
					'skin_tone',
					'face_attributes',
					'image_generation'
				] as const
			).map(unitCost)
		).toEqual([2, 2, 1, 2, 1, 20, 10, 1]);
	});
});
