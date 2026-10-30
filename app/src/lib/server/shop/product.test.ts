import { describe, it, expect, vi } from 'vitest';
import { fetchProductPage, parseProductHtml } from './product';

const SHOPIFY_STYLE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Linen Shirt &amp; Tie | Acme Shop</title>
<link rel="canonical" href="https://acme.example/products/linen-shirt-tie">
<meta property="og:site_name" content="Acme Shop">
<meta property="og:title" content="Linen Shirt &amp; Tie | Acme Shop">
<meta property="og:image" content="https://cdn.acme.example/shirt-1.jpg">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Linen Shirt &amp; Tie",
  "brand": { "@type": "Brand", "name": "Acme" },
  "image": ["https://cdn.acme.example/shirt-1.jpg", "https://cdn.acme.example/shirt-2.jpg"],
  "offers": [
    { "@type": "Offer", "price": "89.00", "priceCurrency": "GBP", "availability": "https://schema.org/InStock" },
    { "@type": "Offer", "price": "79.00", "priceCurrency": "GBP", "availability": "https://schema.org/OutOfStock" }
  ]
}
</script>
</head>
<body><h1>Linen Shirt</h1></body>
</html>`;

const GRAPH_PAGE = `<html><head>
<title>SATIN MIDI DRESS | ZARA</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebSite","name":"Zara","url":"https://www.zara.com/"},
  {"@type":"WebPage","@id":"https://www.zara.com/ng/en/satin-midi-dress-p01234.html"},
  {"@type":"Product","name":"SATIN MIDI DRESS","brand":{"@type":"Brand","name":"ZARA"},
   "image":{"@type":"ImageObject","url":"https://static.zara.net/dress.jpg"},
   "offers":{"@type":"AggregateOffer","lowPrice":"1,299.00","highPrice":"1,599.00","priceCurrency":"NGN",
             "availability":"http://schema.org/InStock"}}
]}
</script>
</head></html>`;

const OG_ONLY = `<html><head>
<title>Ignored</title>
<meta content="Ankara Gele Headtie - Ochre" property="og:title">
<meta property='og:site_name' content='Shop Ochre'>
<meta name='og:image:secure_url' content='https://img.ochre.example/gele-secure.png'>
<meta property="og:image" content="https://img.ochre.example/gele.jpg">
<meta property="product:price:amount" content="15500">
<meta property="product:price:currency" content="ngn">
</head></html>`;

const INVALID_THEN_VALID = `<html><head>
<script type="application/ld+json">{"@type": "Product", "name": "Broken", }</script>
<script type='application/ld+json'>
<!--
//<![CDATA[
{"@context":"https://schema.org","@type":"Product","name":"Field Watch",
 "offers":{"@type":"Offer","price":1200,"priceCurrency":"usd"}}
//]]>
//-->
</script>
</head></html>`;

const RELATIVE_IMAGE = `<html><head>
<title>Oxford Shirt | Example</title>
<meta property="og:image" content="/media/hero/oxford-shirt.jpg">
</head></html>`;

const ENTITY_TITLE = `<html><head>
<meta property="og:site_name" content="Shoe Co">
<meta property="og:title" content="Men&#39;s Oxford &amp; Brogue Shoe | Shoe Co">
<meta property="og:url" content="https://shoeco.example/men/oxford-brogue">
</head></html>`;

const PRODUCT_GROUP = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ProductGroup","name":"Wool Coat",
 "hasVariant":[
   {"@type":"Product","name":"Wool Coat - Camel","image":"https://img.coat.example/camel.jpg",
    "offers":{"@type":"Offer","price":"249,90","priceCurrency":"EUR"}},
   {"@type":"Product","name":"Wool Coat - Black","offers":{"@type":"Offer","price":"259,90","priceCurrency":"EUR"}}
 ]}
</script>
</head></html>`;

const PAGE_URL = 'https://shop.example.com/products/linen-shirt';

describe('parseProductHtml', () => {
	it('reads a Shopify-style page: JSON-LD name, first offer price, canonical URL and shop suffix removed', () => {
		const page = parseProductHtml(SHOPIFY_STYLE, PAGE_URL);

		expect(page).toEqual({
			url: 'https://acme.example/products/linen-shirt-tie',
			title: 'Linen Shirt & Tie',
			brand: 'Acme',
			shop: 'Acme Shop',
			imageUrl: 'https://cdn.acme.example/shirt-1.jpg',
			price: { amount: 89, currency: 'GBP' },
			availability: 'InStock'
		});
	});

	it('reads a @graph page with a Product and an AggregateOffer, using lowPrice and the hostname as shop', () => {
		const pageUrl = 'https://www.zara.com/ng/en/satin-midi-dress-p01234.html';
		const page = parseProductHtml(GRAPH_PAGE, pageUrl);

		expect(page.title).toBe('SATIN MIDI DRESS');
		expect(page.brand).toBe('ZARA');
		expect(page.shop).toBe('Zara');
		expect(page.price).toEqual({ amount: 1299, currency: 'NGN' });
		expect(page.availability).toBe('InStock');
		expect(page.imageUrl).toBe('https://static.zara.net/dress.jpg');
		expect(page.url).toBe(pageUrl);
	});

	it('reads a page with only og: meta tags and product:price meta, in any attribute order and quote style', () => {
		const page = parseProductHtml(OG_ONLY, PAGE_URL);

		expect(page.title).toBe('Ankara Gele Headtie - Ochre');
		expect(page.shop).toBe('Shop Ochre');
		expect(page.price).toEqual({ amount: 15500, currency: 'NGN' });
		expect(page.imageUrl).toBe('https://img.ochre.example/gele.jpg');
		expect(page.url).toBe(PAGE_URL);
		expect(page.brand).toBeUndefined();
	});

	it('skips an invalid JSON-LD block and uses the next valid Product block', () => {
		const page = parseProductHtml(INVALID_THEN_VALID, 'https://www.fieldwatch.example/p/1');

		expect(page.title).toBe('Field Watch');
		expect(page.price).toEqual({ amount: 1200, currency: 'USD' });
	});

	it('resolves a relative og:image against the page URL and strips a hostname-derived shop suffix', () => {
		const page = parseProductHtml(RELATIVE_IMAGE, 'https://shop.example.co.uk/p/oxford-shirt-1');

		expect(page.imageUrl).toBe('https://shop.example.co.uk/media/hero/oxford-shirt.jpg');
		expect(page.shop).toBe('Example');
		expect(page.title).toBe('Oxford Shirt');
	});

	it('decodes entities in the title and strips the " | Shop" suffix', () => {
		const page = parseProductHtml(ENTITY_TITLE, PAGE_URL);

		expect(page.title).toBe("Men's Oxford & Brogue Shoe");
		expect(page.shop).toBe('Shoe Co');
		expect(page.url).toBe('https://shoeco.example/men/oxford-brogue');
	});

	it('reads ProductGroup variants for image and price, normalising European decimal prices', () => {
		const page = parseProductHtml(PRODUCT_GROUP, PAGE_URL);

		expect(page.title).toBe('Wool Coat');
		expect(page.imageUrl).toBe('https://img.coat.example/camel.jpg');
		expect(page.price).toEqual({ amount: 249.9, currency: 'EUR' });
	});

	it('parses price strings in US, European and symbol forms', () => {
		const withPrice = (price: string, currency: string) =>
			parseProductHtml(
				`<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":"${price}","priceCurrency":"${currency}"}}</script>`,
				PAGE_URL
			).price;

		expect(withPrice('1,299.00', 'USD')).toEqual({ amount: 1299, currency: 'USD' });
		expect(withPrice('1.299,00', 'EUR')).toEqual({ amount: 1299, currency: 'EUR' });
		expect(withPrice('1 299,50', 'EUR')).toEqual({ amount: 1299.5, currency: 'EUR' });
	});
});

describe('fetchProductPage', () => {
	it('rejects private, loopback and local hosts without making a request', async () => {
		const spy = vi.fn(async () => new Response('', { headers: { 'content-type': 'text/html' } }));
		const urls = [
			'http://localhost:3000/p',
			'http://127.0.0.1/p',
			'http://10.0.0.5/p',
			'http://192.168.1.20/p',
			'http://172.16.4.4/p',
			'http://172.31.255.1/p',
			'http://[::1]/p',
			'http://printer.local/p',
			'http://api.internal/p',
			'http://169.254.169.254/latest/meta-data'
		];

		for (const url of urls) {
			await expect(
				fetchProductPage(url, { fetchImpl: spy as unknown as typeof fetch })
			).rejects.toThrow(/private or local/);
		}
		expect(spy).not.toHaveBeenCalled();
	});

	it('rejects non-http(s) URLs', async () => {
		const spy = vi.fn(async () => new Response(''));
		await expect(
			fetchProductPage('file:///etc/passwd', { fetchImpl: spy as unknown as typeof fetch })
		).rejects.toThrow(/http and https/);
		expect(spy).not.toHaveBeenCalled();
	});

	it('rejects a redirect that leads to a private host', async () => {
		const spy = vi.fn(
			async () =>
				new Response(null, {
					status: 302,
					headers: { location: 'http://169.254.169.254/latest/meta-data' }
				})
		);
		await expect(
			fetchProductPage('https://shop.example.com/p/1', {
				fetchImpl: spy as unknown as typeof fetch
			})
		).rejects.toThrow(/private or local/);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('rejects a non-HTML response', async () => {
		const spy = vi.fn(
			async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })
		);
		await expect(
			fetchProductPage('https://shop.example.com/p/1', {
				fetchImpl: spy as unknown as typeof fetch
			})
		).rejects.toThrow(/Not an HTML product page/);
	});

	it('rejects a non-2xx response', async () => {
		const spy = vi.fn(
			async () =>
				new Response('<html></html>', { status: 404, headers: { 'content-type': 'text/html' } })
		);
		await expect(
			fetchProductPage('https://shop.example.com/p/gone', {
				fetchImpl: spy as unknown as typeof fetch
			})
		).rejects.toThrow(/HTTP 404/);
	});

	it('sends browser-like headers, follows a redirect and parses the final page', async () => {
		const finalUrl = 'https://shop.example.com/products/linen-shirt';
		const spy = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
			const href = String(input);
			if (href === 'https://shop.example.com/p/old') {
				return new Response(null, { status: 301, headers: { location: finalUrl } });
			}
			return new Response(
				SHOPIFY_STYLE.replace(
					'<link rel="canonical" href="https://acme.example/products/linen-shirt-tie">',
					''
				),
				{
					headers: { 'content-type': 'text/html; charset=utf-8' }
				}
			);
		});

		const page = await fetchProductPage('https://shop.example.com/p/old', {
			fetchImpl: spy as unknown as typeof fetch
		});

		expect(page.url).toBe(finalUrl);
		expect(page.title).toBe('Linen Shirt & Tie');
		expect(spy).toHaveBeenCalledTimes(2);
		const init = spy.mock.calls[0]?.[1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers['User-Agent']).toMatch(/Chrome\//);
		expect(headers.Accept).toMatch(/text\/html/);
		expect(headers['Accept-Language']).toMatch(/^en/);
	});
});
