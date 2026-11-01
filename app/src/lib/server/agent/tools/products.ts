// search_products and design_garment: the buy path and the sew path.

import { assetInputPart } from '#lib/server/llm';
import { saveAssetFromUrl } from '#lib/server/store';
import { convert, formatMoney } from '#lib/server/shop/fx';
import { fetchProductPage } from '#lib/server/shop/product';
import { generateGarmentImage } from '#lib/server/youcam';
import type { WebSearchLocation } from '#lib/server/llm';
import type { Money, PieceRole, Product, Session } from '#lib/types';
import { newId, type RegisteredProduct } from '../state';
import { GARMENT_ROLES, PIECE_ROLES, arrayOf, nullableStr, obj } from './schemas';
import { failureMessage, plainAsset } from './youcam-errors';
import {
	Problems,
	ToolError,
	isRec,
	mapLimit,
	readEnum,
	readNumber,
	readString,
	type ToolDef,
	type ToolEnv
} from './types';

const MAX_ITEMS = 4;
const MAX_CANDIDATES = 5;
const WANTED_PER_ITEM = 2;

const ROLE_WORDS: Record<PieceRole, string> = {
	upper_body: 'top',
	lower_body: 'bottom (trousers or skirt)',
	full_body: 'dress or one-piece outfit',
	outer: 'jacket or outerwear',
	shoes: 'pair of shoes',
	earrings: 'pair of earrings',
	necklace: 'necklace',
	watch: 'watch',
	ring: 'ring',
	bracelet: 'bracelet'
};

const SEARCH_SCHEMA = obj({
	candidates: arrayOf(
		obj({
			url: {
				type: 'string',
				description: "The product's own page, not a category or search page."
			},
			title: { type: 'string' },
			shop: { type: 'string' }
		})
	)
});

const VET_SCHEMA = obj({
	showsRequestedItem: {
		type: 'boolean',
		description: 'The photo shows the kind of item requested.'
	},
	singleItem: {
		type: 'boolean',
		description: 'Exactly one item (or one pair) and not a collage or multi-product grid.'
	},
	suitsRequest: {
		type: 'boolean',
		description:
			'It is the right kind of item for the description and occasion. Trainers fail when formal shoes are asked for, a casual watch fails for black tie, and so on.'
	},
	frontFacing: { type: 'boolean', description: 'The item is shown front-on, upright.' },
	wornByPerson: {
		type: 'boolean',
		description: 'A person or model is wearing or holding the item.'
	},
	plainBackground: { type: 'boolean' },
	concern: { ...nullableStr, description: 'One short phrase if anything is off.' }
});

interface Vetting {
	vetted: boolean;
	concern?: string;
	/** The wrong kind of item, so it must never be offered even when nothing else turned up. */
	wrongKind?: boolean;
}

function decideVetting(role: PieceRole, raw: unknown): Vetting {
	if (!isRec(raw)) return { vetted: false, concern: 'The product photo could not be checked.' };
	const garment = (GARMENT_ROLES as readonly string[]).includes(role);
	const concern =
		typeof raw.concern === 'string' && raw.concern.trim() ? raw.concern.trim() : undefined;
	if (raw.showsRequestedItem === false)
		return {
			vetted: false,
			wrongKind: true,
			concern: concern ?? 'Not the requested kind of item.'
		};
	if (raw.suitsRequest === false)
		return { vetted: false, wrongKind: true, concern: concern ?? 'Wrong style for this outfit.' };
	if (raw.singleItem === false)
		return { vetted: false, concern: concern ?? 'Photo is a collage or shows several items.' };
	if (role === 'lower_body') {
		// YouCam: lower-body references must be worn photos.
		if (raw.wornByPerson !== true)
			return { vetted: false, concern: concern ?? 'Bottoms need a photo of them being worn.' };
		return { vetted: true };
	}
	if (raw.wornByPerson === true)
		return {
			vetted: false,
			concern: concern ?? 'Shown on a model; a plain product shot works better.'
		};
	if (garment && raw.frontFacing === false)
		return { vetted: false, concern: concern ?? 'Not front-facing.' };
	return { vetted: true };
}

interface Candidate {
	registered: RegisteredProduct;
	isNew: boolean;
}

interface ItemRequest {
	role: PieceRole;
	description: string;
	colors: string[];
	maxPrice?: number;
}

function parseItems(args: Record<string, unknown>): ItemRequest[] {
	const p = new Problems();
	if (!Array.isArray(args.items) || args.items.length === 0)
		p.add('items', 'must list at least one item.');
	else if (args.items.length > MAX_ITEMS) p.add('items', `at most ${MAX_ITEMS} items per call.`);
	const items: ItemRequest[] = [];
	(Array.isArray(args.items) ? args.items.slice(0, MAX_ITEMS) : []).forEach((it, i) => {
		if (!isRec(it)) return p.add(`items[${i}]`, 'must be an object.');
		const role = readEnum(p, it.role, `items[${i}].role`, PIECE_ROLES);
		const description = readString(p, it.description, `items[${i}].description`, { max: 240 });
		const colors = (Array.isArray(it.colors) ? it.colors : [])
			.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
			.slice(0, 4);
		const maxPrice = readNumber(p, it.maxPrice, `items[${i}].maxPrice`, {
			required: false,
			min: 1
		});
		if (role && description)
			items.push({ role, description, colors, ...(maxPrice ? { maxPrice } : {}) });
	});
	p.throwIfAny('Invalid product search.');
	return items;
}

async function convertPrice(
	price: Money | undefined,
	target: string | undefined
): Promise<Money | undefined> {
	if (!price || !target || price.currency.toUpperCase() === target.toUpperCase()) return price;
	try {
		const { amount, currency } = await convert(price, target);
		return { amount, currency };
	} catch {
		return price; // keep the shop's own price rather than inventing one
	}
}

/** What the item has to go with, so a search can pick the right kind rather than any of the kind. */
function outfitContext(session: Session, req: ItemRequest, others: ItemRequest[]): string {
	const event = session.event;
	const look = session.looks.find((l) => l.id === session.chosenLookId);
	const wornWith = [
		...(look?.pieces ?? []).filter((p) => p.role !== req.role).map((p) => p.name),
		...others.filter((o) => o !== req).map((o) => o.description)
	];
	return [
		event &&
			`Occasion: ${event.name}, dress code ${event.dressCode ?? event.dressCodeNormalized}${event.setting ? `, ${event.setting}` : ''}.`,
		wornWith.length > 0 && `It will be worn with: ${[...new Set(wornWith)].join('; ')}.`
	]
		.filter(Boolean)
		.join(' ');
}

interface SearchArea {
	label: string;
	/** Empty for a country-wide search, where shops only need to deliver there. */
	nearby: boolean;
	web?: WebSearchLocation;
}

/** Narrowest first: the city, then the state, then the country. */
function searchAreas(session: Session): SearchArea[] {
	const loc = session.location;
	if (!loc) return [{ label: 'the user', nearby: false }];
	const code = loc.countryCode && /^[A-Za-z]{2}$/.test(loc.countryCode);
	const country = code ? { country: (loc.countryCode as string).toUpperCase() } : {};
	const areas: SearchArea[] = [];
	if (loc.city) {
		areas.push({
			label: [loc.city, loc.region, loc.country].filter(Boolean).join(', '),
			nearby: true,
			web: { ...country, city: loc.city, ...(loc.region ? { region: loc.region } : {}) }
		});
	}
	if (loc.region) {
		areas.push({
			label: `${loc.region}, ${loc.country}`,
			nearby: true,
			web: { ...country, region: loc.region }
		});
	}
	areas.push({ label: loc.country, nearby: false, web: country });
	return areas;
}

async function vetImage(
	env: ToolEnv,
	req: ItemRequest,
	context: string,
	title: string,
	assetId: string
): Promise<Vetting> {
	const { role } = req;
	const part = await assetInputPart(assetId, { detail: 'low' });
	if (!part) return { vetted: false, concern: 'The product photo could not be read.' };
	try {
		const res = await env.model.ask({
			tier: 'fast',
			system:
				'You check a shop product photo for use as a virtual try-on reference. Answer strictly from what is visible.',
			input: [
				{
					type: 'text',
					text: `Requested item: ${ROLE_WORDS[role]}: ${req.description}. ${context} Listing title: ${title}. Check this photo.`
				},
				part
			],
			schema: VET_SCHEMA
		});
		return decideVetting(role, res.json);
	} catch (err) {
		console.error('[agent] product vetting failed', err);
		return { vetted: false, concern: 'The product photo could not be checked.' };
	}
}

async function searchOne(env: ToolEnv, req: ItemRequest, index: number, others: ItemRequest[]) {
	const { session, ctx, agent, model } = env;
	const actId = `search:${Date.now()}:${index}`;
	ctx.activity(actId, `Looking for ${req.description.slice(0, 70)}`, 'running');
	const loc = session.location;
	const budget = req.maxPrice && loc ? ` Budget: up to ${req.maxPrice} ${loc.currency}.` : '';
	const context = outfitContext(session, req, others);
	const promptFor = (area: SearchArea) =>
		`Find ${MAX_CANDIDATES} real product pages for a ${ROLE_WORDS[req.role]}: ${req.description}.` +
		(req.colors.length ? ` Colours: ${req.colors.join(', ')}.` : '') +
		(context ? ` ${context}` : '') +
		' First work out the exact type of item that suits this outfit and occasion, for this wearer, then search for that type by its proper name, in the words shops use. Never search the bare category. "Shoes" for a suit means something like black leather oxfords or derbies, and for an evening gown something like strappy heeled sandals, never trainers. Apply the same thinking to any item: name its kind, cut, material and colour. If a search finds little, reword it with other names for the same type before giving up. Leave out anything that would look wrong with this outfit, even if it is the right category.' +
		` Only shops that ship to ${loc?.country ?? 'the user'}${area.nearby ? `, based in or delivering to ${area.label}` : ''}.` +
		budget +
		' Each URL must be the page of one specific product (not a category, search or brand home page), and the item must be in stock if the page says so.' +
		' Report the exact product title and the shop name. Never invent URLs: only return pages you actually found.';

	const found: Candidate[] = [];
	const rejected: string[] = [];
	let searchedIn: string | undefined;
	try {
		const target = session.location?.currency;
		let fallback: Candidate | undefined;

		for (const area of searchAreas(session)) {
			searchedIn = area.label;
			ctx.activity(
				actId,
				`Looking in ${area.label} for ${req.description.slice(0, 60)}`,
				'running'
			);
			const res = await model.ask({
				tier: 'main',
				input: promptFor(area),
				schema: SEARCH_SCHEMA,
				webSearch: area.web ? { userLocation: area.web } : {}
			});
			const raw = res.json;
			const urls = isRec(raw) && Array.isArray(raw.candidates) ? raw.candidates : [];

			for (const c of urls.slice(0, MAX_CANDIDATES)) {
				if (found.length >= WANTED_PER_ITEM) break;
				if (!isRec(c) || typeof c.url !== 'string') continue;
				const known = Object.values(agent.products).find(
					(r) => r.product.url === c.url && r.role === req.role
				);
				if (known) {
					if (known.vetted) found.push({ registered: known, isNew: false });
					continue;
				}
				let page;
				try {
					page = await fetchProductPage(c.url);
				} catch (err) {
					rejected.push(`${hostLabel(c.url)}: page could not be read`);
					continue;
				}
				if (!page.imageUrl) {
					rejected.push(`${page.shop}: no product photo found`);
					continue;
				}
				let image;
				try {
					image = await saveAssetFromUrl(page.imageUrl, {
						kind: 'product',
						sessionId: session.id,
						label: page.title
					});
				} catch {
					rejected.push(`${page.shop}: product photo could not be downloaded`);
					continue;
				}
				const price = await convertPrice(page.price, target);
				if (
					req.maxPrice &&
					price &&
					(!target || price.currency === target.toUpperCase()) &&
					price.amount > req.maxPrice
				) {
					rejected.push(`${page.shop}: over budget`);
					continue;
				}
				const vetting = await vetImage(env, req, context, page.title, image.id);
				const product: Product = {
					title: page.title,
					...(page.brand ? { brand: page.brand } : {}),
					shop: page.shop || (typeof c.shop === 'string' ? c.shop : hostLabel(c.url)),
					url: page.url,
					imageUrl: page.imageUrl,
					image: plainAsset(image),
					...(price ? { price } : {}),
					checkedAt: new Date().toISOString()
				};
				const registered: RegisteredProduct = {
					id: newId('prod'),
					role: req.role,
					product,
					...(page.price && price && page.price.currency !== price.currency
						? { originalPrice: page.price }
						: {}),
					vetted: vetting.vetted,
					...(vetting.concern ? { concern: vetting.concern } : {})
				};
				if (vetting.vetted) {
					agent.products[registered.id] = registered;
					found.push({ registered, isNew: true });
				} else {
					rejected.push(`${product.shop}: ${vetting.concern ?? 'photo not suitable'}`);
					// Bottoms without a worn photo cannot be tried on at all, so never offer them.
					if (req.role !== 'lower_body' && !vetting.wrongKind && !fallback) {
						fallback = { registered, isNew: true };
					}
				}
			}
			// Found something properly suitable here, so there's no need to look further away.
			if (found.length > 0) break;
		}
		if (found.length === 0 && fallback) {
			agent.products[fallback.registered.id] = fallback.registered;
			found.push(fallback);
		}
		ctx.activity(
			actId,
			found.length
				? `Found ${found.length} for ${req.description.slice(0, 60)}`
				: `No usable listing for ${req.description.slice(0, 60)}`,
			found.length ? 'done' : 'failed'
		);
	} catch (err) {
		console.error('[agent] product search failed', err);
		ctx.activity(actId, `Could not search for ${req.description.slice(0, 60)}`, 'failed');
		rejected.push('The product search failed.');
	}
	return { req, found, rejected, searchedIn };
}

function hostLabel(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return 'a shop';
	}
}

export const searchProducts: ToolDef = {
	name: 'search_products',
	description:
		'Find real products to buy for up to 4 items at once. Searches shops that ship to the user, checks each product photo is usable for try-on, and registers the best 1-2 per item with a product id and price in the local currency. Never invent products: use only ids returned here.',
	parameters: obj({
		items: arrayOf(
			obj({
				role: { type: 'string', enum: [...PIECE_ROLES] },
				description: {
					type: 'string',
					description:
						'The exact type, never a bare category, and who it is for: "men\'s black leather cap-toe oxfords" or "women\'s gold strappy heeled sandals", not "shoes". It must suit the rest of the outfit and the dress code.'
				},
				colors: {
					type: 'array',
					items: { type: 'string' },
					description: 'Colour names that fit the event.'
				},
				maxPrice: {
					type: ['number', 'null'],
					description: "Optional budget per item in the user's currency."
				}
			})
		)
	}),
	strict: true,
	label: () => null,
	async run(args, env) {
		const items = parseItems(args);
		const results = await mapLimit(items, 3, (req, i) => searchOne(env, req, i, items));
		await env.saveAgent();

		const shown: Product[] = [];
		for (const r of results) for (const f of r.found) shown.push(f.registered.product);
		if (shown.length > 0) env.ctx.block({ type: 'products', products: shown });

		return {
			ok: shown.length > 0,
			currency: env.session.location?.currency ?? null,
			results: results.map((r) => ({
				role: r.req.role,
				description: r.req.description,
				searchedIn: r.searchedIn ?? null,
				products: r.found.map(({ registered: x }) => ({
					productId: x.id,
					role: x.role,
					title: x.product.title,
					shop: x.product.shop,
					price: x.product.price ? formatMoney(x.product.price) : null,
					url: x.product.url,
					vetted: x.vetted,
					...(x.concern ? { concern: x.concern } : {})
				})),
				...(r.found.length === 0
					? {
							note: 'Nothing usable found. Try different wording, another shop type, or offer the sew path.'
						}
					: {}),
				rejected: r.rejected.slice(0, 4)
			}))
		};
	}
};

/* ------------------------------------------------------------------- sew path */

export function garmentPrompt(role: PieceRole, description: string, prompt: string): string {
	if (role === 'lower_body') {
		// YouCam needs lower-body references to be worn, with the legs fully visible.
		return (
			`Studio fashion photo of one model standing front-facing, full body from head to toe, wearing a plain fitted top and ${description}. ` +
			`${prompt}. The bottom garment is the focus, fully visible down to the hem. Plain white background, even soft lighting, no text, no watermark.`
		);
	}
	return (
		`Front-facing e-commerce product photo of a single ${description}, shown flat or on an invisible mannequin, centered, upright, ` +
		`${prompt}. Plain white background, soft even studio lighting, no person, no model, no hands, no text, no watermark, not cropped.`
	);
}

export const designGarment: ToolDef = {
	name: 'design_garment',
	description:
		'Sew path: design a garment image the user could take to a tailor. Produces a front-facing design picture and registers it as a sew design with a price estimate. Costs 1 YouCam unit. Prefer full_body, upper_body or outer designs; avoid lower_body.',
	parameters: obj({
		role: { type: 'string', enum: [...GARMENT_ROLES] },
		description: {
			type: 'string',
			description: 'The garment in a few words, e.g. "emerald satin column gown".'
		},
		prompt: {
			type: 'string',
			description:
				'Design details: fabric, cut, neckline, sleeves, length, colour, embellishment, cultural elements.'
		},
		estimateMin: {
			type: 'number',
			description: 'Low end of a realistic tailoring price in the given currency.'
		},
		estimateMax: { type: 'number', description: 'High end.' },
		currency: { type: 'string', description: "ISO 4217 code, normally the user's local currency." }
	}),
	strict: true,
	label: (a) =>
		`Designing ${typeof a.description === 'string' ? a.description.slice(0, 70) : 'your garment'}`,
	async run(args, env) {
		const p = new Problems();
		const role = readEnum(p, args.role, 'role', GARMENT_ROLES);
		const description = readString(p, args.description, 'description', { max: 200 });
		const prompt = readString(p, args.prompt, 'prompt', { max: 700 });
		const min = readNumber(p, args.estimateMin, 'estimateMin', { min: 0 });
		const max = readNumber(p, args.estimateMax, 'estimateMax', { min: 0 });
		const currency = typeof args.currency === 'string' ? args.currency.trim().toUpperCase() : '';
		if (!/^[A-Z]{3}$/.test(currency)) p.add('currency', 'must be a 3-letter ISO 4217 code.');
		if (min !== undefined && max !== undefined && max < min)
			p.add('estimateMax', 'must be at least estimateMin.');
		p.throwIfAny('Invalid garment design.');

		let result;
		try {
			result = await generateGarmentImage(
				{ session: env.session },
				{ prompt: garmentPrompt(role!, description!, prompt!) }
			);
		} catch (err) {
			await env.ctx.sessionChanged(); // unit ledger may have changed
			throw new ToolError(failureMessage(err, 'The garment design'));
		}
		const design = {
			prompt: prompt!,
			image: result.image,
			estimate: { min: { amount: min!, currency }, max: { amount: max!, currency } },
			notes: description!
		};
		const id = newId('sew');
		env.agent.sewDesigns[id] = { id, role: role!, description: description!, design };
		await env.saveAgent();
		env.ctx.block({ type: 'sew_design', design });
		await env.ctx.sessionChanged();
		return {
			ok: true,
			designId: id,
			role,
			description,
			estimate: `${formatMoney(design.estimate.min)} to ${formatMoney(design.estimate.max)}`,
			note:
				role === 'lower_body'
					? 'Bottoms may try on poorly: prefer a full_body or upper_body design.'
					: undefined
		};
	}
};
