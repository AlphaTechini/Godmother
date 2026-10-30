import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () =>
	(await import('../store/test-config')).mockConfigModule()
);
vi.mock('#lib/server/youcam', async () => (await import('./test-helpers')).youcamMockModule());
vi.mock('#lib/server/shop/product', () => ({ fetchProductPage: vi.fn() }));
vi.mock('#lib/server/shop/fx', async (orig) => ({
	...(await orig<typeof import('#lib/server/shop/fx')>()),
	convert: vi.fn(async (m: { amount: number; currency: string }, to: string) => ({
		amount: m.amount * 1500,
		currency: to,
		approximate: true
	}))
}));
vi.mock('#lib/server/store', async (orig) => ({
	...(await orig<typeof import('#lib/server/store')>()),
	saveAssetFromUrl: vi.fn()
}));

import * as youcam from '#lib/server/youcam';
import * as store from '#lib/server/store';
import { fetchProductPage } from '#lib/server/shop/product';
import { researchEvent, setLocation } from './tools/event';
import { designGarment, searchProducts } from './tools/products';
import { catalogWardrobe, requestPhotos } from './tools/wardrobe';
import { ToolError } from './tools/types';
import {
	FakeModel,
	blocksOf,
	installYoucamDefaults,
	jsonResponse,
	makeAsset,
	makeEnv,
	sessionWithPhotos
} from './test-helpers';

const yc = youcam as unknown as ReturnType<typeof import('./test-helpers').youcamMockModule>;
const fetchPage = vi.mocked(fetchProductPage);
const saveFromUrl = vi.mocked(store.saveAssetFromUrl);

beforeEach(() => {
	installYoucamDefaults(yc);
	fetchPage.mockReset();
	saveFromUrl.mockReset();
});

describe('research_event', () => {
	it('uses web search with the user location and returns normalized facts with deduped sources', async () => {
		const session = await sessionWithPhotos();
		session.location = {
			city: 'Lagos',
			country: 'Nigeria',
			countryCode: 'NG',
			currency: 'NGN',
			source: 'typed'
		};
		const model = new FakeModel();
		model.askQueue.push(
			jsonResponse(
				{
					found: true,
					name: 'Lagos Heritage Gala',
					date: 'Sat 14 Nov 2026',
					venue: null,
					city: 'Lagos',
					dressCode: 'Black tie',
					dressCodeNormalized: 'black_tie',
					theme: null,
					colors: [{ name: 'gold', hex: 'd4af37' }],
					setting: 'Ballroom',
					notes: ['Heritage attire welcome']
				},
				[
					{ url: 'https://gala.test/?utm_source=openai', title: 'Gala' },
					{ url: 'https://gala.test/?utm_source=openai', title: 'Gala again' }
				]
			)
		);
		const { env } = makeEnv(session, model);
		const out = (await researchEvent.run({ query: 'Lagos Heritage Gala' }, env)) as Record<
			string,
			unknown
		>;

		const req = model.askRequests[0];
		expect(req.tier).toBe('main');
		expect(req.webSearch).toEqual({ userLocation: { country: 'NG', city: 'Lagos' } });
		expect(out).toMatchObject({
			found: true,
			dressCode: 'Black tie',
			dressCodeNormalized: 'black_tie',
			colors: [{ name: 'gold', hex: '#D4AF37' }],
			sources: [{ title: 'Gala', url: 'https://gala.test/' }]
		});
		expect(session.event).toBeUndefined(); // research never saves
	});
});

describe('set_location and request_photos', () => {
	it('validates the currency and records how the location was learned', async () => {
		const session = await sessionWithPhotos([]);
		const { env, ctx } = makeEnv(session);
		session.messages.splice(0, 0, {
			id: 'a',
			role: 'assistant',
			createdAt: '',
			text: 'Where are you based?',
			attachments: [],
			blocks: []
		});
		await setLocation.run(
			{ city: 'Lagos', region: null, country: 'Nigeria', countryCode: 'NG', currency: 'ngn' },
			env
		);
		expect(session.location).toEqual({
			city: 'Lagos',
			country: 'Nigeria',
			countryCode: 'NG',
			currency: 'NGN',
			source: 'asked'
		});
		void ctx;
		await expect(
			setLocation.run(
				{ city: null, region: null, country: 'X', countryCode: null, currency: 'naira' },
				env
			)
		).rejects.toBeInstanceOf(ToolError);
	});

	it('only asks for photos that are still missing', async () => {
		const session = await sessionWithPhotos(['fullBody']);
		const { env, events } = makeEnv(session);
		const out = (await requestPhotos.run(
			{ slots: ['fullBody', 'portrait'], reason: 'For makeup.' },
			env
		)) as { missing: string[] };
		expect(out.missing).toEqual(['portrait']);
		expect(blocksOf(events, 'photo_request')).toEqual([
			{ type: 'photo_request', slots: ['portrait'], reason: 'For makeup.' }
		]);
		const none = (await requestPhotos.run({ slots: ['fullBody'], reason: 'x' }, env)) as {
			missing: string[];
		};
		expect(none.missing).toEqual([]);
		expect(blocksOf(events, 'photo_request')).toHaveLength(1);
	});
});

describe('catalog_wardrobe', () => {
	it('rejects asset ids that were not attached in this conversation', async () => {
		const session = await sessionWithPhotos();
		const { env } = makeEnv(session);
		await expect(
			catalogWardrobe.run({ assetIds: ['00000000-0000-4000-8000-000000000000'] }, env)
		).rejects.toBeInstanceOf(ToolError);
		expect(session.wardrobe).toHaveLength(0);
	});

	it('describes attached garments with the fast model and appends them to the wardrobe', async () => {
		const session = await sessionWithPhotos();
		const asset = await makeAsset(session);
		const model = new FakeModel();
		model.askQueue.push(
			jsonResponse({
				usable: true,
				role: 'lower_body',
				description: 'black pencil skirt',
				colors: [{ name: 'black', hex: '#000' }],
				formality: 'smart',
				wornOnPerson: false,
				issue: null
			})
		);
		const { env, events, userMessage } = makeEnv(session, model);
		userMessage.attachments.push({ asset, purpose: 'wardrobe' });

		const out = (await catalogWardrobe.run({ assetIds: [asset.id] }, env)) as {
			added: { id: string; note?: string }[];
		};
		expect(model.askRequests[0].tier).toBe('fast');
		expect(session.wardrobe).toHaveLength(1);
		expect(session.wardrobe[0]).toMatchObject({
			role: 'lower_body',
			description: 'black pencil skirt',
			colors: [{ name: 'black', hex: '#000000' }]
		});
		expect(out.added[0].note).toContain('worn photo');
		expect(blocksOf(events, 'wardrobe')).toEqual([
			{ type: 'wardrobe', itemIds: [session.wardrobe[0].id] }
		]);

		// A second call does not re-describe it.
		const again = (await catalogWardrobe.run({ assetIds: [asset.id] }, env)) as {
			added: unknown[];
			skipped: unknown[];
		};
		expect(again.added).toHaveLength(0);
		expect(again.skipped).toHaveLength(1);
		expect(model.askRequests).toHaveLength(1);
	});
});

describe('search_products', () => {
	const vet = (over: Record<string, unknown> = {}) =>
		jsonResponse({
			showsRequestedItem: true,
			singleItem: true,
			frontFacing: true,
			wornByPerson: false,
			plainBackground: true,
			concern: null,
			...over
		});

	it('finds real pages, vets the photo, converts the price and registers products without inventing anything', async () => {
		const session = await sessionWithPhotos();
		session.location = {
			city: 'Lagos',
			country: 'Nigeria',
			countryCode: 'NG',
			currency: 'NGN',
			source: 'typed'
		};
		const model = new FakeModel();
		model.askQueue.push(
			jsonResponse({
				candidates: [
					{ url: 'https://dead.test/a', title: 'Dead', shop: 'Dead' },
					{ url: 'https://shop.test/collage', title: 'Collage', shop: 'Shop' },
					{ url: 'https://shop.test/gown', title: 'Emerald gown', shop: 'Shop' },
					{ url: 'https://shop.test/noprice', title: 'Plain gown', shop: 'Shop' }
				]
			})
		);
		fetchPage.mockImplementation(async (url: string) => {
			if (url.includes('dead')) throw new Error('HTTP 404');
			return {
				url,
				title: url.includes('collage')
					? 'Collage set'
					: url.includes('noprice')
						? 'Plain gown'
						: 'Emerald satin gown',
				shop: 'Shop',
				imageUrl: `${url}.jpg`,
				...(url.includes('noprice') ? {} : { price: { amount: 100, currency: 'USD' } })
			};
		});
		saveFromUrl.mockImplementation(async () => ({
			...(await makeAsset(session, 'product')),
			sessionId: session.id
		}));
		// vetting order: collage fails, gown passes, noprice passes.
		model.askQueue.push(vet({ singleItem: false, concern: 'collage' }), vet(), vet());

		const { env, events } = makeEnv(session, model);
		const out = (await searchProducts.run(
			{
				items: [
					{
						role: 'full_body',
						description: 'emerald satin gown',
						colors: ['emerald'],
						maxPrice: null
					}
				]
			},
			env
		)) as {
			ok: boolean;
			results: {
				products: { productId: string; price: string | null; vetted: boolean }[];
				rejected: string[];
			}[];
		};

		const search = model.askRequests[0];
		expect(search.webSearch).toEqual({ userLocation: { country: 'NG', city: 'Lagos' } });
		expect(String(search.input)).toContain('ship to Nigeria');
		expect(model.askRequests[1].tier).toBe('fast');

		const products = out.results[0].products;
		expect(products).toHaveLength(2);
		expect(products[0].price).toContain('150,000');
		expect(products[1].price).toBeNull(); // unknown price stays unknown
		expect(products.every((p) => p.vetted)).toBe(true);
		expect(out.results[0].rejected.join(' ')).toMatch(/dead\.test: page could not be read/);
		expect(out.results[0].rejected.join(' ')).toMatch(/collage/);

		const registered = env.agent.products[products[0].productId];
		expect(registered.product).toMatchObject({
			url: 'https://shop.test/gown',
			price: { amount: 150_000, currency: 'NGN' }
		});
		expect(registered.originalPrice).toEqual({ amount: 100, currency: 'USD' });
		expect(registered.product.image?.kind).toBe('product');
		expect(blocksOf(events, 'products')).toHaveLength(1);
	});

	it('never offers bottoms without a worn photo', async () => {
		const session = await sessionWithPhotos();
		const model = new FakeModel();
		model.askQueue.push(
			jsonResponse({
				candidates: [{ url: 'https://shop.test/skirt', title: 'Skirt', shop: 'Shop' }]
			}),
			vet({ wornByPerson: false })
		);
		fetchPage.mockResolvedValue({
			url: 'https://shop.test/skirt',
			title: 'Skirt',
			shop: 'Shop',
			imageUrl: 'https://shop.test/skirt.jpg'
		});
		saveFromUrl.mockImplementation(async () => ({
			...(await makeAsset(session, 'product')),
			sessionId: session.id
		}));
		const { env, events } = makeEnv(session, model);
		const out = (await searchProducts.run(
			{ items: [{ role: 'lower_body', description: 'black skirt', colors: [], maxPrice: null }] },
			env
		)) as { ok: boolean; results: { products: unknown[] }[] };
		expect(out.ok).toBe(false);
		expect(out.results[0].products).toHaveLength(0);
		expect(Object.keys(env.agent.products)).toHaveLength(0);
		expect(blocksOf(events, 'products')).toHaveLength(0);
	});

	it('limits a call to four items', async () => {
		const session = await sessionWithPhotos();
		const { env } = makeEnv(session);
		const item = { role: 'shoes', description: 'heels', colors: [], maxPrice: null };
		await expect(searchProducts.run({ items: Array(5).fill(item) }, env)).rejects.toBeInstanceOf(
			ToolError
		);
	});
});

describe('design_garment', () => {
	it('generates a flat product shot, registers the sew design and shows it', async () => {
		const session = await sessionWithPhotos();
		const { env, events } = makeEnv(session);
		const out = (await designGarment.run(
			{
				role: 'full_body',
				description: 'emerald satin column gown',
				prompt: 'boat neck, long sleeves',
				estimateMin: 90_000,
				estimateMax: 150_000,
				currency: 'ngn'
			},
			env
		)) as { designId: string };
		const prompt = (yc.generateGarmentImage.mock.calls[0][1] as { prompt: string }).prompt;
		expect(prompt).toContain(
			'Front-facing e-commerce product photo of a single emerald satin column gown'
		);
		expect(prompt).toContain('Plain white background');
		const reg = env.agent.sewDesigns[out.designId];
		expect(reg.design.estimate).toEqual({
			min: { amount: 90_000, currency: 'NGN' },
			max: { amount: 150_000, currency: 'NGN' }
		});
		expect(blocksOf(events, 'sew_design')).toHaveLength(1);
	});

	it('returns the YouCam message when generation fails', async () => {
		const session = await sessionWithPhotos();
		const { env } = makeEnv(session);
		yc.generateGarmentImage.mockRejectedValue(new youcam.UnitCapError(1, 0));
		const err = await designGarment
			.run(
				{
					role: 'outer',
					description: 'cape',
					prompt: 'x',
					estimateMin: 1,
					estimateMax: 2,
					currency: 'USD'
				},
				env
			)
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ToolError);
		expect((err as ToolError).message).toContain('needs 1');
	});
});
