import type { Money } from '#lib/types';

export interface ProductPage {
	/** Canonical URL if the page declares one, else the final fetched URL. */
	url: string;
	/** Exact product title as the shop shows it, without the shop-name suffix. */
	title: string;
	brand?: string;
	/** Shop name, e.g. "Zara". */
	shop: string;
	/** Absolute URL of the main product photo. */
	imageUrl?: string;
	price?: Money;
	/** Short schema.org availability, e.g. "InStock". */
	availability?: string;
}

type Obj = Record<string, unknown>;

const MAX_BODY_BYTES = 3 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 5_000;

const BROWSER_HEADERS: Record<string, string> = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
	Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.9'
};

const NAMED_ENTITIES = new Map<string, string>([
	['amp', '&'],
	['quot', '"'],
	['apos', "'"],
	['lt', '<'],
	['gt', '>'],
	['nbsp', ' '],
	['ndash', '–'],
	['mdash', '—'],
	['lsquo', '‘'],
	['rsquo', '’'],
	['ldquo', '“'],
	['rdquo', '”'],
	['hellip', '…'],
	['copy', '©'],
	['reg', '®'],
	['trade', '™']
]);

// Attribute / tag regexes. Quoted values may contain '>' so they are matched as units.
const META_RE = /<meta\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const LINK_RE = /<link\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const SCRIPT_RE = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi;
const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/* ---------------------------------------------------------------- text utils */

function decodeEntities(text: string): string {
	return text.replace(
		/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g,
		(match: string, body: string) => {
			if (body[0] === '#') {
				const code =
					body[1] === 'x' || body[1] === 'X'
						? parseInt(body.slice(2), 16)
						: parseInt(body.slice(1), 10);
				return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
			}
			return NAMED_ENTITIES.get(body.toLowerCase()) ?? match;
		}
	);
}

function cleanText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** Decodes entities and tidies whitespace; undefined when nothing is left. */
function textOf(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const cleaned = cleanText(decodeEntities(value));
	return cleaned || undefined;
}

function parseAttrs(src: string): Map<string, string> {
	const attrs = new Map<string, string>();
	for (const m of src.matchAll(ATTR_RE)) {
		const name = m[1].toLowerCase();
		if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? '');
	}
	return attrs;
}

/* ------------------------------------------------------------- URL and host */

function isPrivateHost(rawHost: string): boolean {
	const host = rawHost
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.$/, '');
	if (
		host === 'localhost' ||
		host.endsWith('.localhost') ||
		host.endsWith('.local') ||
		host.endsWith('.internal')
	) {
		return true;
	}
	// IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10), IPv4-mapped.
	if (host.includes(':')) {
		return (
			host === '::1' ||
			host === '::' ||
			/^f[cd][0-9a-f]{0,2}:/.test(host) ||
			/^fe[89ab][0-9a-f]:/.test(host) ||
			host.startsWith('::ffff:')
		);
	}
	const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (ipv4) {
		const a = Number(ipv4[1]);
		const b = Number(ipv4[2]);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168)
		);
	}
	return false;
}

/** Parses an http(s) URL that does not point at a private or local host. */
function toSafeUrl(input: string): URL {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new Error(`Invalid product URL: ${input}`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`Only http and https product URLs are allowed (got ${url.protocol})`);
	}
	if (isPrivateHost(url.hostname)) {
		throw new Error(`Refusing to fetch a private or local address: ${url.hostname}`);
	}
	return url;
}

function absolutize(raw: string | undefined, base: string): string | undefined {
	if (!raw) return undefined;
	try {
		const url = new URL(raw.trim(), base);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
	} catch {
		return undefined;
	}
}

const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu']);

/** "www.zara.com" -> "Zara", "shop.example.co.uk" -> "Example". */
function shopFromHostname(pageUrl: string): string {
	let host: string;
	try {
		host = new URL(pageUrl).hostname;
	} catch {
		return '';
	}
	if (!host || host.includes(':') || /^[\d.]+$/.test(host)) return host;

	const labels = host.replace(/^www\d*\./, '').split('.');
	const n = labels.length;
	let index = n - 2;
	if (n >= 3 && labels[n - 1].length === 2 && SECOND_LEVEL_LABELS.has(labels[n - 2])) index = n - 3;
	const name = labels[Math.max(index, 0)] ?? host;

	return name
		.split(/[-_]+/)
		.filter(Boolean)
		.map((word) =>
			word.length <= 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()
		)
		.join(' ');
}

/* ----------------------------------------------------------------- HTML meta */

/** First value per property/name key, decoded. */
function collectMeta(html: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of html.matchAll(META_RE)) {
		const attrs = parseAttrs(m[1]);
		const value = textOf(attrs.get('content'));
		if (!value) continue;
		for (const attr of ['property', 'name']) {
			const key = attrs.get(attr)?.trim().toLowerCase();
			if (key && !out.has(key)) out.set(key, value);
		}
	}
	return out;
}

function findCanonicalHref(html: string): string | undefined {
	for (const m of html.matchAll(LINK_RE)) {
		const attrs = parseAttrs(m[1]);
		const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
		const href = attrs.get('href');
		if (rel.includes('canonical') && href) return decodeEntities(href);
	}
	return undefined;
}

function findTitleTag(html: string): string | undefined {
	const raw = TITLE_RE.exec(html)?.[1];
	return raw === undefined ? undefined : textOf(raw.replace(/<[^>]*>/g, ''));
}

/* -------------------------------------------------------------- JSON-LD */

function parseJsonLd(raw: string): unknown {
	let text = raw.trim();
	// Strip "<!--", "//<![CDATA[" and their closing forms, in any nesting order.
	for (let i = 0; i < 3; i++) {
		text = text
			.replace(/^(?:<!--|(?:\/\/\s*)?<!\[CDATA\[)\s*/, '')
			.replace(/\s*(?:(?:\/\/\s*)?-->|(?:\/\/\s*)?\]\]>)$/, '')
			.trim();
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

function toList(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [value];
}

function toObjects(value: unknown): Obj[] {
	return toList(value).filter(
		(item): item is Obj => item !== null && typeof item === 'object' && !Array.isArray(item)
	);
}

function hasType(node: Obj, type: string): boolean {
	return toList(node['@type']).some(
		(t) => typeof t === 'string' && t.replace(/^.*[/#]/, '') === type
	);
}

/** Every object reachable from the roots, parents before children (covers @graph). */
function collectObjects(roots: unknown[]): Obj[] {
	const out: Obj[] = [];
	const visit = (value: unknown, depth: number): void => {
		if (out.length >= MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return;
		if (value === null || typeof value !== 'object') return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item, depth + 1);
			return;
		}
		const obj = value as Obj;
		out.push(obj);
		for (const child of Object.values(obj)) visit(child, depth + 1);
	};
	for (const root of roots) visit(root, 0);
	return out;
}

function findJsonLdProduct(html: string): Obj | undefined {
	const roots: unknown[] = [];
	for (const m of html.matchAll(SCRIPT_RE)) {
		const type = (parseAttrs(m[1]).get('type') ?? '').trim().toLowerCase();
		if (type !== 'application/ld+json') continue;
		const data = parseJsonLd(m[2]);
		if (data !== undefined) roots.push(data);
	}
	const nodes = collectObjects(roots);

	// Variants listed under a ProductGroup belong to the group, so prefer the group over them.
	const groupVariants = new Set<Obj>();
	for (const node of nodes) {
		if (hasType(node, 'ProductGroup'))
			toObjects(node.hasVariant).forEach((v) => groupVariants.add(v));
	}

	return (
		nodes.find((n) => hasType(n, 'Product') && !groupVariants.has(n)) ??
		nodes.find((n) => hasType(n, 'ProductGroup')) ??
		nodes.find((n) => hasType(n, 'Product'))
	);
}

/** Offers of a product, plus those of its variants (ProductGroup), flattened. */
function collectOffers(value: unknown, depth = 0): Obj[] {
	if (depth > 3) return [];
	return toObjects(value).flatMap((offer) => [
		offer,
		...(offer.offers !== undefined ? collectOffers(offer.offers, depth + 1) : [])
	]);
}

function productOffers(product: Obj): Obj[] {
	const variants = toObjects(product.hasVariant);
	return [
		...collectOffers(product.offers),
		...variants.flatMap((variant) => collectOffers(variant.offers))
	];
}

/**
 * Normalises a price from a number or a string such as "1,299.00", "1.299,00" or "1 299,50".
 * The later of the two separators is treated as the decimal mark when both are present.
 */
function parsePrice(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
	if (typeof value !== 'string') return undefined;

	const cleaned = value.replace(/[^\d.,]/g, '');
	if (!/\d/.test(cleaned)) return undefined;

	const lastComma = cleaned.lastIndexOf(',');
	const lastDot = cleaned.lastIndexOf('.');
	let normalised: string;
	if (lastComma !== -1 && lastDot !== -1) {
		normalised =
			lastComma > lastDot
				? cleaned.replace(/\./g, '').replace(',', '.')
				: cleaned.replace(/,/g, '');
	} else if (lastComma !== -1) {
		const parts = cleaned.split(',');
		normalised =
			parts.length === 2 && parts[1].length !== 3
				? cleaned.replace(',', '.')
				: cleaned.replace(/,/g, '');
	} else if (lastDot !== -1) {
		const parts = cleaned.split('.');
		normalised = parts.length === 2 ? cleaned : cleaned.replace(/\./g, '');
	} else {
		normalised = cleaned;
	}

	const amount = Number(normalised);
	return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

function parseCurrency(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const code = value.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

/** "https://schema.org/InStock" -> "InStock". */
function shortAvailability(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	return value.trim().replace(/^https?:\/\/schema\.org\//i, '') || undefined;
}

function jsonLdPrice(offers: Obj[]): { money?: Money; availability?: string } {
	let pricedOffer: Obj | undefined;
	let money: Money | undefined;

	for (const offer of offers) {
		const spec = toObjects(offer.priceSpecification)[0];
		const amount = parsePrice(offer.price) ?? parsePrice(offer.lowPrice) ?? parsePrice(spec?.price);
		const currency = parseCurrency(offer.priceCurrency) ?? parseCurrency(spec?.priceCurrency);
		if (amount !== undefined && currency) {
			pricedOffer = offer;
			money = { amount, currency };
			break;
		}
	}

	const availability =
		shortAvailability(pricedOffer?.availability) ??
		offers.map((offer) => shortAvailability(offer.availability)).find(Boolean);

	return { money, availability };
}

function brandOf(value: unknown): string | undefined {
	const first = toList(value)[0];
	if (typeof first === 'string') return textOf(first);
	if (first !== null && typeof first === 'object') return textOf((first as Obj).name);
	return undefined;
}

/** Image URL candidates in order, from string | string[] | {url} | {contentUrl}. */
function imageCandidates(value: unknown, depth = 0): string[] {
	if (depth > 3) return [];
	return toList(value).flatMap((item) => {
		if (typeof item === 'string') return [item];
		if (item !== null && typeof item === 'object') {
			const obj = item as Obj;
			return [
				...imageCandidates(obj.url, depth + 1),
				...imageCandidates(obj.contentUrl, depth + 1)
			];
		}
		return [];
	});
}

/* ------------------------------------------------------------------ parsing */

const SUFFIX_SEPARATOR = '[|\\-–—:·»]';
const SUFFIX_RE = new RegExp(`^(.*\\S)\\s+${SUFFIX_SEPARATOR}\\s+([^|\\-–—:·»]+?)$`);

function normaliseName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Removes a trailing " | Shop Name" when it names the shop. */
function stripShopSuffix(title: string, shopNames: string[]): string {
	const names = new Set(shopNames.map(normaliseName).filter(Boolean));
	const match = SUFFIX_RE.exec(title);
	if (match && names.has(normaliseName(match[2]))) return match[1];
	return title;
}

export function parseProductHtml(html: string, pageUrl: string): ProductPage {
	const metas = collectMeta(html);
	const ld = findJsonLdProduct(html);
	const variants = ld ? toObjects(ld.hasVariant) : [];

	const shop = metas.get('og:site_name') || shopFromHostname(pageUrl);
	const hostShop = shopFromHostname(pageUrl);

	const url =
		absolutize(findCanonicalHref(html), pageUrl) ??
		absolutize(metas.get('og:url'), pageUrl) ??
		pageUrl;

	const rawTitle = textOf(ld?.name) ?? metas.get('og:title') ?? findTitleTag(html) ?? '';
	const title = cleanText(stripShopSuffix(rawTitle, [shop, hostShop]));

	const imageRaw = [
		...(ld ? imageCandidates(ld.image) : []),
		...variants.flatMap((variant) => imageCandidates(variant.image)),
		metas.get('og:image'),
		metas.get('og:image:secure_url'),
		metas.get('twitter:image'),
		metas.get('twitter:image:src')
	];
	const imageUrl = imageRaw
		.map((candidate) => absolutize(candidate, pageUrl))
		.find((candidate): candidate is string => candidate !== undefined);

	const ldOffer = jsonLdPrice(ld ? productOffers(ld) : []);
	const metaAmount = parsePrice(metas.get('product:price:amount') ?? metas.get('og:price:amount'));
	const metaCurrency = parseCurrency(
		metas.get('product:price:currency') ?? metas.get('og:price:currency')
	);
	const metaMoney =
		metaAmount !== undefined && metaCurrency
			? { amount: metaAmount, currency: metaCurrency }
			: undefined;

	const page: ProductPage = { url, title, shop };

	const brand = (ld ? brandOf(ld.brand) : undefined) ?? metas.get('product:brand');
	if (brand) page.brand = brand;
	if (imageUrl) page.imageUrl = imageUrl;

	const price = ldOffer.money ?? metaMoney;
	if (price) page.price = price;

	const availability = ldOffer.availability ?? shortAvailability(metas.get('product:availability'));
	if (availability) page.availability = availability;

	return page;
}

/* ------------------------------------------------------------------- fetch */

function transportError(url: string, err: unknown, signal: AbortSignal): Error {
	if (signal.aborted) return new Error(`Timed out fetching ${url}`);
	const message = err instanceof Error ? err.message : String(err);
	return new Error(`Could not fetch ${url}: ${message}`, { cause: err });
}

/** Fetches a URL, following redirects by hand so each hop is checked for SSRF. */
async function fetchFollowingRedirects(
	start: string,
	fetchImpl: typeof fetch,
	signal: AbortSignal
): Promise<{ res: Response; finalUrl: string }> {
	let target = toSafeUrl(start);
	for (let hop = 0; ; hop++) {
		let res: Response;
		try {
			res = await fetchImpl(target.href, {
				method: 'GET',
				headers: BROWSER_HEADERS,
				redirect: 'manual',
				signal
			});
		} catch (err) {
			throw transportError(target.href, err, signal);
		}

		const location = res.headers.get('location');
		if (!REDIRECT_STATUSES.has(res.status) || !location) {
			return { res, finalUrl: target.href };
		}
		if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects fetching ${start}`);
		await res.body?.cancel().catch(() => undefined);
		target = toSafeUrl(new URL(location, target).href);
	}
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
	if (!res.body) return new Uint8Array(await res.arrayBuffer()).subarray(0, max);

	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (total < max) {
			const { done, value } = await reader.read();
			if (done) break;
			const slice = value.subarray(0, max - total);
			chunks.push(slice);
			total += slice.byteLength;
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}

	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

function charsetOf(contentType: string): string {
	const label = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
	try {
		new TextDecoder(label);
		return label;
	} catch {
		return 'utf-8';
	}
}

export async function fetchProductPage(
	url: string,
	opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<ProductPage> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

	const { res, finalUrl } = await fetchFollowingRedirects(url, fetchImpl, signal);

	if (!res.ok) {
		await res.body?.cancel().catch(() => undefined);
		throw new Error(`Product page returned HTTP ${res.status} for ${finalUrl}`);
	}

	const contentType = res.headers.get('content-type') ?? '';
	if (contentType && !/\btext\/html\b|\bapplication\/xhtml\+xml\b/i.test(contentType)) {
		await res.body?.cancel().catch(() => undefined);
		const mime = contentType.split(';')[0].trim();
		throw new Error(`Not an HTML product page (content-type ${mime}) at ${finalUrl}`);
	}

	let bytes: Uint8Array;
	try {
		bytes = await readCapped(res, MAX_BODY_BYTES);
	} catch (err) {
		throw transportError(finalUrl, err, signal);
	}
	const html = new TextDecoder(charsetOf(contentType)).decode(bytes);

	return parseProductHtml(html, finalUrl);
}
