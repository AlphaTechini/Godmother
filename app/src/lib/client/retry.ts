// Retries for requests that are safe to repeat. Only use it on those.

const DELAYS_MS = [500, 1500, 4000];

export const wait = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(new DOMException('Aborted', 'AbortError'));
			},
			{ once: true }
		);
	});

export const isRetryableStatus = (status: number) => status === 429 || status >= 500;

/** Repeats on a network failure, a 429 or a 5xx. Answers with the last response. */
export async function fetchWithRetry(
	url: string,
	init?: RequestInit,
	fetcher: typeof fetch = fetch
): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		try {
			const res = await fetcher(url, init);
			if (!isRetryableStatus(res.status) || attempt >= DELAYS_MS.length) return res;
		} catch (err) {
			if (!(err instanceof TypeError) || attempt >= DELAYS_MS.length) throw err;
		}
		await wait(DELAYS_MS[attempt]);
	}
}
