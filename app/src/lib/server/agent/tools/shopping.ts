// build_shopping_list: deterministic, from the chosen look's pieces that are not from the wardrobe.

import { convert, formatMoney } from '#lib/server/shop/fx';
import type { Money, PriceRange, Session, ShoppingItem, ShoppingList } from '#lib/types';
import { obj } from './schemas';
import { ToolError, type ToolDef, type ToolEnv } from './types';

export const SHOPPING_NOTE =
	"Only covers pieces you'd need to buy or have made. Anything from your own wardrobe isn't included.";

async function inCurrency(money: Money, currency: string): Promise<Money | undefined> {
	if (money.currency.toUpperCase() === currency.toUpperCase()) {
		return { amount: money.amount, currency: currency.toUpperCase() };
	}
	try {
		const { amount, currency: to } = await convert(money, currency);
		return { amount, currency: to };
	} catch {
		return undefined;
	}
}

/** Builds the list for the chosen look. Throws ToolError when there is nothing to build from. */
export async function buildShoppingList(session: Session): Promise<ShoppingList> {
	const look = session.looks.find((l) => l.id === session.chosenLookId);
	if (!look) throw new ToolError('No look has been chosen yet, so there is nothing to list.');

	const firstCurrency = look.pieces.flatMap((p) =>
		p.source.type === 'product' && p.source.product.price
			? [p.source.product.price.currency]
			: p.source.type === 'sew'
				? [p.source.design.estimate.min.currency]
				: []
	)[0];
	const currency = (session.location?.currency ?? firstCurrency ?? 'USD').toUpperCase();

	const items: ShoppingItem[] = [];
	let min = 0;
	let max = 0;
	const unpriced: string[] = [];
	const checked: string[] = [];

	for (const piece of look.pieces) {
		const src = piece.source;
		if (src.type === 'wardrobe') continue;
		if (src.type === 'product') {
			const { product } = src;
			const price = product.price ? await inCurrency(product.price, currency) : undefined;
			items.push({
				pieceId: piece.id,
				role: piece.role,
				name: product.title || piece.name,
				shop: product.shop,
				url: product.url,
				...(product.image ?? piece.image ? { image: (product.image ?? piece.image)! } : {}),
				kind: 'buy',
				...(price ? { price } : {})
			});
			if (price) {
				min += price.amount;
				max += price.amount;
			} else unpriced.push(piece.name);
			checked.push(product.checkedAt);
		} else {
			const { design } = src;
			const lo = await inCurrency(design.estimate.min, currency);
			const hi = await inCurrency(design.estimate.max, currency);
			const estimate: PriceRange | undefined = lo && hi ? { min: lo, max: hi } : undefined;
			items.push({
				pieceId: piece.id,
				role: piece.role,
				name: piece.name,
				image: design.image,
				kind: 'sew',
				...(estimate ? { estimate } : {})
			});
			if (estimate) {
				min += estimate.min.amount;
				max += estimate.max.amount;
			} else unpriced.push(piece.name);
		}
	}

	const round = (n: number) => Math.round(n * 100) / 100;
	const note = unpriced.length
		? `${SHOPPING_NOTE} No price was available for ${unpriced.join(', ')}, so the total leaves it out.`
		: SHOPPING_NOTE;
	return {
		currency,
		total: { min: { amount: round(min), currency }, max: { amount: round(max), currency } },
		items,
		checkedAt: checked.sort()[0] ?? new Date().toISOString(),
		note
	};
}

/** Builds, stores and announces the list. Shared by the tool and the shopping_list UI action. */
export async function publishShoppingList(env: Pick<ToolEnv, 'session' | 'ctx'>) {
	const list = await buildShoppingList(env.session);
	env.session.shoppingList = list;
	env.session.stage = 'done';
	env.ctx.block({ type: 'shopping_list' });
	await env.ctx.sessionChanged();
	return {
		ok: true,
		currency: list.currency,
		items: list.items.length,
		total: `${formatMoney(list.total.min)} to ${formatMoney(list.total.max)}`,
		lines: list.items.map((i) => ({
			name: i.name,
			kind: i.kind,
			shop: i.shop,
			price: i.price ? formatMoney(i.price) : i.estimate ? `${formatMoney(i.estimate.min)} to ${formatMoney(i.estimate.max)} (estimate)` : 'no price'
		}))
	};
}

export const buildShoppingListTool: ToolDef = {
	name: 'build_shopping_list',
	description:
		"Build the shopping list for the chosen look: everything the user would have to buy or have sewn, with prices in their currency and a total range. Wardrobe pieces are left out. Call it when the user asks for the list, or after finishing.",
	parameters: obj({}),
	strict: true,
	label: () => 'Adding up what you would need to buy',
	run: (_args, env) => publishShoppingList(env)
};
