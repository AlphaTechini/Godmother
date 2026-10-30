// One token bucket in front of every YouCam API call (task create, poll, file API).
// The account limit is 250 requests per 300 s per key and per IP (docs/API-NOTES.md §1.3).
// The S3 PUT and the result download are not YouCam API calls and bypass it.

export interface LimiterOptions {
	/** Sustained requests per second. */
	ratePerSec: number;
	/** Bucket size: how many calls may go out back to back. */
	burst: number;
}

export class TokenBucket {
	private tokens: number;
	private last: number;
	private tail: Promise<void> = Promise.resolve();

	constructor(private opts: LimiterOptions) {
		this.tokens = opts.burst;
		this.last = Date.now();
	}

	configure(opts: Partial<LimiterOptions>): void {
		this.opts = { ...this.opts, ...opts };
		this.tokens = Math.min(this.tokens, this.opts.burst);
	}

	/** Refills the bucket to full (tests). */
	reset(): void {
		this.tokens = this.opts.burst;
		this.last = Date.now();
		this.tail = Promise.resolve();
	}

	private refill(): void {
		const now = Date.now();
		const elapsed = Math.max(0, now - this.last) / 1000;
		this.last = now;
		this.tokens = Math.min(this.opts.burst, this.tokens + elapsed * this.opts.ratePerSec);
	}

	/** Resolves when a token is available. Callers are served first come, first served. */
	acquire(): Promise<void> {
		const turn = this.tail.then(async () => {
			for (;;) {
				this.refill();
				if (this.tokens >= 1) {
					this.tokens -= 1;
					return;
				}
				const waitMs = Math.ceil(((1 - this.tokens) / this.opts.ratePerSec) * 1000);
				await new Promise((r) => setTimeout(r, Math.max(1, waitMs)));
			}
		});
		this.tail = turn.catch(() => {});
		return turn;
	}
}

/** The process-wide limiter. */
export const limiter = new TokenBucket({ ratePerSec: 0.8, burst: 10 });

export function configureLimiter(opts: Partial<LimiterOptions>): void {
	limiter.configure(opts);
}
