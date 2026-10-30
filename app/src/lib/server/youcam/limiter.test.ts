import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenBucket } from './limiter';

afterEach(() => vi.useRealTimers());

describe('TokenBucket', () => {
	it('lets a burst through, then throttles to the sustained rate', async () => {
		vi.useFakeTimers();
		const bucket = new TokenBucket({ ratePerSec: 0.8, burst: 10 });
		const t0 = Date.now();
		const done: number[] = [];
		const run = async () => {
			await bucket.acquire();
			done.push(Date.now() - t0);
		};
		const all = Promise.all(Array.from({ length: 13 }, run));
		await vi.advanceTimersByTimeAsync(0);
		expect(done).toHaveLength(10); // burst of 10 immediately
		expect(done.every((t) => t === 0)).toBe(true);
		await vi.advanceTimersByTimeAsync(1300);
		expect(done).toHaveLength(11); // 1 / 0.8 = 1.25 s per extra call
		await vi.advanceTimersByTimeAsync(2500);
		await all;
		expect(done).toHaveLength(13);
		expect(done[12]).toBeGreaterThanOrEqual(3700);
		expect(done[12]).toBeLessThan(3900);
	});

	it('serves callers first come first served and refills over time', async () => {
		vi.useFakeTimers();
		const bucket = new TokenBucket({ ratePerSec: 1, burst: 1 });
		const order: number[] = [];
		const ps = [0, 1, 2].map((i) => bucket.acquire().then(() => order.push(i)));
		await vi.advanceTimersByTimeAsync(2500);
		await Promise.all(ps);
		expect(order).toEqual([0, 1, 2]);
		await vi.advanceTimersByTimeAsync(5000);
		let got = false;
		void bucket.acquire().then(() => (got = true));
		await vi.advanceTimersByTimeAsync(0);
		expect(got).toBe(true); // refilled while idle, capped at the burst
	});

	it('is configurable', async () => {
		vi.useFakeTimers();
		const bucket = new TokenBucket({ ratePerSec: 0.8, burst: 10 });
		bucket.configure({ ratePerSec: 100, burst: 2 });
		const done: number[] = [];
		const all = Promise.all(
			[1, 2, 3].map(() => bucket.acquire().then(() => done.push(Date.now())))
		);
		await vi.advanceTimersByTimeAsync(50);
		await all;
		expect(done).toHaveLength(3);
	});
});
