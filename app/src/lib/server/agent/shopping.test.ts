import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () =>
	(await import('../store/test-config')).mockConfigModule()
);
vi.mock('#lib/server/youcam', async () => (await import('./test-helpers')).youcamMockModule());
vi.mock('#lib/server/shop/fx', async (orig) => ({
	...(await orig<typeof import('#lib/server/shop/fx')>()),
	// 1 USD = 1500 NGN, deterministic and offline.
	convert: vi.fn(async (m: { amount: number; currency: string }, to: string) =>
		m.currency === to
			? { ...m, approximate: false }
			: { amount: m.amount * 1500, currency: to, approximate: true }
	)
}));

import { buildShoppingListTool } from './tools/shopping';
import { suggestReplies } from './tools/wardrobe';
import { ToolError } from './tools/types';
import { blocksOf, makeAsset, makeEnv, renderedLook, sessionWithPhotos } from './test-helpers';

async function chosenLook() {
	const session = await sessionWithPhotos();
	session.location = { country: 'Nigeria', countryCode: 'NG', currency: 'NGN', source: 'asked' };
	const look = renderedLook(session, 1, 'look_1');
	const image = await makeAsset(session, 'product');
	look.pieces = [
		{
			id: 'p_gown',
			role: 'full_body',
			name: 'Own gown',
			source: { type: 'wardrobe', wardrobeItemId: 'wd_1' }
		},
		{
			id: 'p_shoes',
			role: 'shoes',
			name: 'Gold heels',
			source: {
				type: 'product',
				product: {
					title: 'Gold block heels',
					shop: 'Zuri',
					url: 'https://zuri.test/heels',
					image,
					price: { amount: 45_000, currency: 'NGN' },
					checkedAt: '2026-10-29T09:00:00.000Z'
				}
			}
		},
		{
			id: 'p_wrap',
			role: 'outer',
			name: 'Beaded wrap',
			source: {
				type: 'sew',
				design: {
					prompt: 'p',
					image,
					estimate: {
						min: { amount: 80_000, currency: 'NGN' },
						max: { amount: 120_000, currency: 'NGN' }
					}
				}
			}
		},
		{
			id: 'p_ring',
			role: 'ring',
			name: 'Imported ring',
			source: {
				type: 'product',
				product: {
					title: 'Sapphire ring',
					shop: 'Gems',
					url: 'https://gems.test/r',
					image,
					price: { amount: 20, currency: 'USD' },
					checkedAt: '2026-10-30T09:00:00.000Z'
				}
			}
		}
	];
	session.chosenLookId = look.id;
	return { session, ...makeEnv(session) };
}

describe('build_shopping_list', () => {
	it('lists buy and sew items, leaves wardrobe pieces out, and totals the ranges in the local currency', async () => {
		const { session, env, events } = await chosenLook();
		const out = (await buildShoppingListTool.run({}, env)) as { ok: boolean; items: number };

		const list = session.shoppingList!;
		expect(out.items).toBe(3);
		expect(list.items.map((i) => [i.name, i.kind])).toEqual([
			['Gold block heels', 'buy'],
			['Beaded wrap', 'sew'],
			['Sapphire ring', 'buy']
		]);
		expect(list.items.some((i) => i.pieceId === 'p_gown')).toBe(false);
		expect(list.currency).toBe('NGN');
		// heels 45,000 + ring 20 USD = 30,000 NGN; wrap 80,000..120,000.
		expect(list.items[2].price).toEqual({ amount: 30_000, currency: 'NGN' });
		expect(list.total.min.amount).toBe(45_000 + 30_000 + 80_000);
		expect(list.total.max.amount).toBe(45_000 + 30_000 + 120_000);
		expect(list.items[1].estimate!.max.amount).toBe(120_000);
		expect(list.items[1].price).toBeUndefined();
		expect(list.checkedAt).toBe('2026-10-29T09:00:00.000Z');
		expect(list.note).toBe(
			"Only covers pieces you'd need to buy or have made. Anything from your own wardrobe isn't included."
		);
		expect(session.stage).toBe('done');
		expect(blocksOf(events, 'shopping_list')).toHaveLength(1);
	});

	it('leaves unpriced items out of the total and says so', async () => {
		const { session, env } = await chosenLook();
		const shoes = session.looks[0].pieces[1];
		if (shoes.source.type === 'product') delete shoes.source.product.price;
		await buildShoppingListTool.run({}, env);
		const list = session.shoppingList!;
		expect(list.total.min.amount).toBe(30_000 + 80_000);
		expect(list.items[0].price).toBeUndefined();
		expect(list.note).toContain('No price was available for Gold heels');
	});

	it('needs a chosen look', async () => {
		const { session, env } = await chosenLook();
		delete session.chosenLookId;
		await expect(buildShoppingListTool.run({}, env)).rejects.toBeInstanceOf(ToolError);
	});
});

describe('suggest_replies', () => {
	it('caps at four options and only shows one block per turn', async () => {
		const { env, events } = await chosenLook();
		await suggestReplies.run({ options: ['a', 'b', 'c', 'd', 'e'] }, env);
		const second = (await suggestReplies.run({ options: ['x'] }, env)) as { ok: boolean };
		const blocks = blocksOf(events, 'suggestions');
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toEqual({ type: 'suggestions', options: ['a', 'b', 'c', 'd'] });
		expect(second.ok).toBe(false);
	});
});
