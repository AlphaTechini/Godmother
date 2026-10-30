// HTTP client for the YouCam API: Bearer auth, JSON envelopes (API-NOTES §1.1), the shared rate
// limiter, and polling (§1.3). Create POSTs are never retried; polls survive 429/5xx/network blips.

import { config } from '#lib/server/config';
import {
	engineError,
	toTaskError,
	YouCamHttpError,
	YouCamNetworkError,
	YouCamTaskError
} from './errors';
import { limiter } from './limiter';

type FetchFn = typeof fetch;
let fetchImpl: FetchFn | undefined;

/** Injects a fetch (tests). Pass nothing to go back to the global fetch. */
export function setFetch(fn?: FetchFn): void {
	fetchImpl = fn;
}

/** Fetch for non-API hosts (S3 PUT, result download). Not rate limited, never sends our key. */
export function rawFetch(input: string | URL, init?: RequestInit): Promise<Response> {
	return (fetchImpl ?? globalThis.fetch)(input, init);
}

export interface PollSchedule {
	/** Delay before the first poll. */
	firstMs: number;
	/** Delay between polls until `earlyUntilMs` after task creation. */
	earlyMs: number;
	earlyUntilMs: number;
	/** Delay between polls afterwards. */
	laterMs: number;
	/** First backoff after a transient poll failure; doubles up to backoffMaxMs. */
	backoffMs: number;
	backoffMaxMs: number;
	/** Delay between result-download attempts. */
	downloadRetryMs: number;
}

const DEFAULT_SCHEDULE: PollSchedule = {
	firstMs: 2000,
	earlyMs: 3000,
	earlyUntilMs: 15_000,
	laterMs: 5000,
	backoffMs: 5000,
	backoffMaxMs: 30_000,
	downloadRetryMs: 1500
};
let scheduleOverride: Partial<PollSchedule> = {};

/** Overrides parts of the polling schedule (tests). */
export function setPollSchedule(s: Partial<PollSchedule>): void {
	scheduleOverride = s;
}

export function pollSchedule(): PollSchedule {
	const s = { ...DEFAULT_SCHEDULE, ...scheduleOverride };
	// config.youcam.pollIntervalMs is the early interval unless the schedule is overridden.
	if (scheduleOverride.earlyMs === undefined && config.youcam.pollIntervalMs) {
		s.earlyMs = config.youcam.pollIntervalMs;
	}
	s.laterMs = Math.max(s.laterMs, s.earlyMs);
	return s;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function requireKey(feature: string): string {
	const key = config.youcam.apiKey;
	if (!key) {
		throw new YouCamTaskError(
			'not_configured',
			'YouCam is not configured. Set YOUCAM_API_KEY and restart.',
			feature
		);
	}
	return key;
}

interface Envelope {
	status?: number;
	error?: string;
	error_code?: string;
	data?: Record<string, any>;
	[k: string]: any;
}

/**
 * One rate-limited call to the YouCam API. Throws YouCamHttpError / YouCamNetworkError;
 * callers decide whether that is retryable (polls) or fatal (creates).
 */
export async function apiRequest(
	method: 'GET' | 'POST',
	path: string,
	body: unknown,
	feature: string
): Promise<Envelope> {
	const key = requireKey(feature);
	await limiter.acquire();
	let res: Response;
	try {
		res = await rawFetch(`${config.youcam.baseUrl}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${key}`,
				...(body === undefined ? {} : { 'Content-Type': 'application/json' })
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(30_000)
		});
	} catch (err) {
		throw new YouCamNetworkError(err instanceof Error ? err.message : String(err));
	}
	let json: Envelope = {};
	try {
		const text = await res.text();
		json = text ? (JSON.parse(text) as Envelope) : {};
	} catch {
		json = {};
	}
	const status = Math.max(
		res.ok ? 0 : res.status,
		typeof json.status === 'number' ? json.status : 0
	);
	if (status >= 400 || !res.ok) {
		const ra = Number(res.headers?.get?.('retry-after'));
		throw new YouCamHttpError(
			status || res.status,
			typeof json.error_code === 'string' ? json.error_code : undefined,
			typeof json.error === 'string' ? json.error : undefined,
			Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : undefined
		);
	}
	return json;
}

/** Pulls the image URL out of a success payload (live: data.results.url; docs: download_url). */
export function extractResultUrl(results: unknown): string | undefined {
	const r: any = Array.isArray(results) ? results[0] : results;
	const url = r?.url ?? r?.download_url;
	return typeof url === 'string' && url ? url : undefined;
}

/** Transient poll failures: the task is still running (and will be charged), so keep polling. */
function isTransientPollError(err: unknown): boolean {
	if (err instanceof YouCamNetworkError) return true;
	if (!(err instanceof YouCamHttpError)) return false;
	if (/tasktimeout/i.test(err.errorCode ?? '') || /timed out/i.test(err.serverMessage ?? '')) {
		return false;
	}
	return err.status === 429 || err.status >= 500;
}

export interface CreatedTask {
	taskId: string;
}

/** POST a task. NEVER retried: a timed-out create may already be running and will charge. */
export async function createTask(
	path: string,
	body: Record<string, unknown>,
	feature: string
): Promise<CreatedTask> {
	let res: Envelope;
	try {
		res = await apiRequest('POST', path, body, feature);
	} catch (err) {
		if (err instanceof YouCamNetworkError) {
			throw new YouCamTaskError(
				'network',
				'Lost the connection to YouCam while starting this step. It may have started; wait a moment before retrying.',
				feature
			);
		}
		throw toTaskError(err, feature);
	}
	const taskId = res.data?.task_id;
	if (typeof taskId !== 'string' || !taskId) {
		throw new YouCamTaskError(
			'bad_response',
			'YouCam did not return a task id. Try again.',
			feature
		);
	}
	return { taskId };
}

export interface PollOutcome {
	/** `data.results` of the success response. */
	results: unknown;
}

/**
 * Polls `GET <path>/<taskId>` until success or error. Unknown statuses count as running.
 * Throws YouCamTaskError (engine error / fatal HTTP error / code 'timeout').
 */
export async function pollTask(
	path: string,
	taskId: string,
	feature: string,
	startedAt: number
): Promise<PollOutcome> {
	const url = `${path}/${encodeURIComponent(taskId)}`;
	const timeout = config.youcam.pollTimeoutMs;
	const sched = pollSchedule();
	let failures = 0;
	let first = true;
	for (;;) {
		const elapsed = Date.now() - startedAt;
		let delay = first
			? sched.firstMs
			: elapsed < sched.earlyUntilMs
				? sched.earlyMs
				: sched.laterMs;
		first = false;
		let extra = 0;
		if (failures > 0) {
			extra = Math.min(sched.backoffMs * 2 ** (failures - 1), sched.backoffMaxMs);
		}
		delay += extra;
		await sleep(Math.max(0, Math.min(delay, timeout - elapsed)));
		try {
			const res = await apiRequest('GET', url, undefined, feature);
			failures = 0;
			const data = res.data ?? {};
			if (data.task_status === 'success') return { results: data.results };
			if (data.task_status === 'error') {
				throw engineError(data.error, data.error_message, feature, taskId);
			}
		} catch (err) {
			if (err instanceof YouCamTaskError) throw err;
			if (!isTransientPollError(err)) throw toTaskError(err, feature, taskId);
			failures++;
			if (err instanceof YouCamHttpError && err.retryAfterMs) {
				await sleep(Math.min(err.retryAfterMs, Math.max(0, timeout - (Date.now() - startedAt))));
			}
		}
		if (Date.now() - startedAt >= timeout) {
			throw new YouCamTaskError(
				'timeout',
				'YouCam is taking longer than expected on this step. It may still finish; try again in a few minutes.',
				feature,
				{ taskId }
			);
		}
	}
}
