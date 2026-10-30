import type { Money } from '#lib/types';

const RATES_TTL_MS = 6 * 60 * 60 * 1000;
const RATES_TIMEOUT_MS = 5_000;

/**
 * Rough fallback rates: units of each currency per 1 USD, approximately as of late 2026.
 * Used only when the live rate service fails. These are rough fallbacks, not market quotes.
 */
const FALLBACK_PER_USD = new Map<string, number>([
	['USD', 1],
	['EUR', 0.92],
	['GBP', 0.79],
	['NGN', 1580],
	['GHS', 15.5],
	['KES', 129],
	['ZAR', 18.2],
	['INR', 88],
	['AED', 3.6725],
	['CAD', 1.37],
	['AUD', 1.52],
	['JPY', 152],
	['CNY', 7.2],
	['BRL', 5.5],
	['MXN', 18.5]
]);

/** Currencies whose unit is large enough that cents are noise. */
const WHOLE_UNIT_CURRENCIES = new Set(['JPY', 'KRW', 'NGN', 'IDR', 'VND', 'UGX', 'TZS', 'CLP']);

const cache = new Map<string, { fetchedAt: number; rates: Map<string, number> }>();

/** Clears the in-memory rate cache. Intended for tests. */
export function clearFxCache(): void {
	cache.clear();
}

function normaliseCode(code: string): string {
	const upper = code.trim().toUpperCase();
	if (!/^[A-Z]{3}$/.test(upper)) throw new Error(`Invalid currency code: ${code}`);
	return upper;
}

async function fetchRates(base: string, fetchImpl: typeof fetch): Promise<Map<string, number>> {
	const hit = cache.get(base);
	if (hit && Date.now() - hit.fetchedAt < RATES_TTL_MS) return hit.rates;

	const res = await fetchImpl(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(RATES_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`FX service returned HTTP ${res.status}`);

	const body = (await res.json()) as { result?: unknown; rates?: unknown };
	if (body.result !== 'success' || typeof body.rates !== 'object' || body.rates === null) {
		throw new Error('FX service returned an unexpected response');
	}

	const rates = new Map<string, number>();
	for (const [code, rate] of Object.entries(body.rates as Record<string, unknown>)) {
		if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) rates.set(code, rate);
	}
	cache.set(base, { fetchedAt: Date.now(), rates });
	return rates;
}

/** Live rate from -> to, or undefined when the service is unavailable. */
async function liveRate(
	from: string,
	to: string,
	fetchImpl: typeof fetch
): Promise<number | undefined> {
	try {
		return (await fetchRates(from, fetchImpl)).get(to);
	} catch {
		return undefined;
	}
}

/** Built-in rate from -> to via USD, or undefined when either currency is not in the table. */
function fallbackRate(from: string, to: string): number | undefined {
	const fromPerUsd = FALLBACK_PER_USD.get(from);
	const toPerUsd = FALLBACK_PER_USD.get(to);
	return fromPerUsd && toPerUsd ? toPerUsd / fromPerUsd : undefined;
}

function roundFor(amount: number, currency: string): number {
	const factor = WHOLE_UNIT_CURRENCIES.has(currency) ? 1 : 100;
	return Math.round(amount * factor) / factor;
}

/**
 * Converts money into another currency. Uses live rates (cached 6 hours per base currency),
 * and falls back to the built-in table when the rate service fails.
 * `approximate` is true whenever a conversion happened.
 */
export async function convert(
	money: Money,
	to: string,
	opts: { fetchImpl?: typeof fetch } = {}
): Promise<Money & { approximate: boolean }> {
	if (!Number.isFinite(money.amount)) throw new Error(`Invalid amount: ${money.amount}`);
	const from = normaliseCode(money.currency);
	const target = normaliseCode(to);

	if (from === target) return { amount: money.amount, currency: from, approximate: false };

	const fetchImpl = opts.fetchImpl ?? fetch;
	const rate = (await liveRate(from, target, fetchImpl)) ?? fallbackRate(from, target);
	if (rate === undefined) throw new Error(`No exchange rate available from ${from} to ${target}`);

	return {
		amount: roundFor(money.amount * rate, target),
		currency: target,
		approximate: true
	};
}

/** Locale-aware currency string, e.g. "$1,299.00" or "NGN 1,580,000". */
export function formatMoney(money: Money, locale = 'en-US'): string {
	const currency = money.currency.trim().toUpperCase();
	const digits = WHOLE_UNIT_CURRENCIES.has(currency) ? 0 : 2;
	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		}).format(money.amount);
	} catch {
		return `${money.amount.toFixed(digits)} ${currency}`;
	}
}
