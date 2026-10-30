import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearFxCache, convert, formatMoney } from './fx';

function ratesResponse(rates: Record<string, number>): Response {
	return new Response(JSON.stringify({ result: 'success', base_code: 'USD', rates }), {
		headers: { 'content-type': 'application/json' }
	});
}

beforeEach(() => {
	clearFxCache();
});

describe('convert', () => {
	it('returns the same currency unchanged and does not call the rate service', async () => {
		const spy = vi.fn(async () => ratesResponse({}));

		const result = await convert({ amount: 42, currency: 'NGN' }, 'NGN', {
			fetchImpl: spy as unknown as typeof fetch
		});

		expect(result).toEqual({ amount: 42, currency: 'NGN', approximate: false });
		expect(spy).not.toHaveBeenCalled();
	});

	it('converts with live rates and marks the result approximate', async () => {
		const spy = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
			ratesResponse({ NGN: 1600.5, EUR: 0.9 })
		);

		const result = await convert({ amount: 2, currency: 'usd' }, 'NGN', {
			fetchImpl: spy as unknown as typeof fetch
		});

		expect(result).toEqual({ amount: 3201, currency: 'NGN', approximate: true });
		expect(String(spy.mock.calls[0]?.[0])).toBe('https://open.er-api.com/v6/latest/USD');
	});

	it('caches rates per base currency so a second conversion does not refetch', async () => {
		const spy = vi.fn(async () => ratesResponse({ NGN: 1600.5, EUR: 0.9 }));
		const fetchImpl = spy as unknown as typeof fetch;

		const first = await convert({ amount: 2, currency: 'USD' }, 'NGN', { fetchImpl });
		const second = await convert({ amount: 2, currency: 'USD' }, 'EUR', { fetchImpl });

		expect(first.amount).toBe(3201);
		expect(second).toEqual({ amount: 1.8, currency: 'EUR', approximate: true });
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('falls back to the built-in table when fetch throws', async () => {
		const spy = vi.fn(async (): Promise<Response> => {
			throw new TypeError('fetch failed');
		});

		const result = await convert({ amount: 100, currency: 'USD' }, 'NGN', {
			fetchImpl: spy as unknown as typeof fetch
		});

		expect(result).toEqual({ amount: 158000, currency: 'NGN', approximate: true });
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('falls back via USD when the service returns an error payload', async () => {
		const spy = vi.fn(
			async () => new Response(JSON.stringify({ result: 'error' }), { status: 200 })
		);

		const result = await convert({ amount: 100, currency: 'EUR' }, 'GBP', {
			fetchImpl: spy as unknown as typeof fetch
		});

		// 100 EUR -> USD -> GBP using the fallback table: 100 * 0.79 / 0.92
		expect(result).toEqual({ amount: 85.87, currency: 'GBP', approximate: true });
	});

	it('rejects when neither the service nor the fallback table has the currency', async () => {
		const spy = vi.fn(async (): Promise<Response> => {
			throw new TypeError('fetch failed');
		});

		await expect(
			convert({ amount: 1, currency: 'USD' }, 'XYZ', { fetchImpl: spy as unknown as typeof fetch })
		).rejects.toThrow(/No exchange rate available/);
	});

	it('rejects malformed currency codes', async () => {
		await expect(convert({ amount: 1, currency: 'US$' }, 'NGN')).rejects.toThrow(
			/Invalid currency code/
		);
	});
});

describe('formatMoney', () => {
	it('formats USD with two decimals', () => {
		expect(formatMoney({ amount: 1299, currency: 'USD' })).toBe('$1,299.00');
	});

	it('formats NGN in whole units', () => {
		const formatted = formatMoney({ amount: 158000.4, currency: 'NGN' });

		expect(formatted).toContain('158,000');
		expect(formatted).not.toContain('.');
		expect(formatted).toMatch(/NGN|₦/);
	});
});
