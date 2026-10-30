// Test-only: a fake YouCam server (file API, S3, tasks, polls, result downloads) behind a mocked
// fetch, plus tiny real images and a minimal Session.
import sharp from 'sharp';
import { saveAsset } from '#lib/server/store';
import type { Asset, Session } from '#lib/types';
import { setFetch, setPollSchedule } from './client';
import { resetFileCache, resetChainUrls } from './files';
import { configureLimiter, limiter } from './limiter';
import { resetReservations } from './ledger';
import { resetHairTemplateCache } from './hair-templates';

export async function jpeg(w = 64, h = 96, rgb = { r: 180, g: 60, b: 90 }): Promise<Buffer> {
	return sharp({ create: { width: w, height: h, channels: 3, background: rgb } })
		.jpeg()
		.toBuffer();
}

export async function pngAlpha(w = 32, h = 32): Promise<Buffer> {
	// Fully transparent red: flattening onto white must give white pixels.
	return sharp({
		create: { width: w, height: h, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } }
	})
		.png()
		.toBuffer();
}

export async function storeImage(bytes?: Buffer, kind: Asset['kind'] = 'upload'): Promise<Asset> {
	return saveAsset({ bytes: bytes ?? (await jpeg()), mime: 'image/jpeg', kind });
}

let sessionCounter = 0;
export function makeSession(cap = 60, spent = 0): Session {
	return {
		id: `00000000-0000-4000-8000-${String(++sessionCounter).padStart(12, '0')}`,
		createdAt: new Date().toISOString(),
		mode: 'live',
		stage: 'looks',
		photos: {},
		wardrobe: [],
		looks: [],
		messages: [],
		units: { spent, cap, ledger: [] }
	};
}

export interface FakeCall {
	method: string;
	url: URL;
	headers: Headers;
	body: any;
	raw?: unknown;
}

export interface FakeTask {
	id: string;
	path: string;
	body: any;
	polls: number;
}

export interface PollReply {
	status?: number;
	json: unknown;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});

export class FakeYouCam {
	calls: FakeCall[] = [];
	uploads = new Map<string, { bytes: Uint8Array; headers: Headers }>();
	tasks = new Map<string, FakeTask>();
	resultBytes = new Map<string, Uint8Array>();
	private fileCounter = 0;
	private taskCounter = 0;

	/** Decide the reply to a task create. Return undefined for the default (200 + task id). */
	onCreate?: (path: string, body: any, n: number) => Response | undefined;
	/** Decide the reply to a poll. Return undefined for the default (running once, then success). */
	onPoll?: (task: FakeTask, pollNo: number) => PollReply | 'network' | undefined;
	/** `data.results` for a successful task. Default: an image URL. */
	resultsFor?: (task: FakeTask) => unknown;
	/** Bytes served for the default result URL. */
	defaultResult: Uint8Array = new Uint8Array();
	/** Template pages for GET .../template/hair-transfer, by page index. */
	templatePages?: { templates: unknown[]; next_token: string | null }[] | 'error';

	creates(): FakeCall[] {
		return this.calls.filter((c) => c.method === 'POST' && c.url.pathname.includes('/task/'));
	}
	polls(): FakeCall[] {
		return this.calls.filter((c) => c.method === 'GET' && !c.url.pathname.includes('/template/'));
	}
	fileApiCalls(): FakeCall[] {
		return this.calls.filter((c) => c.url.pathname === '/s2s/v2.0/file');
	}
	apiCalls(): FakeCall[] {
		return this.calls.filter((c) => c.url.host === 'yce.test');
	}

	fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = new URL(typeof input === 'string' ? input : input.toString());
		const method = (init?.method ?? 'GET').toUpperCase();
		const headers = new Headers(init?.headers);
		let body: any;
		if (typeof init?.body === 'string') body = JSON.parse(init.body);
		const call: FakeCall = { method, url, headers, body, raw: init?.body };
		this.calls.push(call);

		if (url.host === 's3.test') {
			const id = url.pathname.split('/').pop()!;
			this.uploads.set(id, { bytes: init!.body as Uint8Array, headers });
			return new Response(null, { status: 200 });
		}
		if (url.host === 'results.test') {
			const bytes = this.resultBytes.get(url.pathname) ?? this.defaultResult;
			return new Response(bytes as BodyInit, {
				status: 200,
				headers: { 'content-type': 'binary/octet-stream' }
			});
		}
		if (url.host !== 'yce.test') throw new Error(`unexpected host ${url.host}`);
		if (headers.get('authorization') !== 'Bearer test-key') {
			return json({ status: 401, error: 'Unauthorized', error_code: 'InvalidAccessToken' }, 401);
		}

		if (url.pathname === '/s2s/v2.0/file' && method === 'POST') {
			const files = body.files.map((f: any) => {
				const file_id = `file-${++this.fileCounter}/${f.file_name}+x`;
				return {
					...f,
					file_id,
					requests: [
						{
							method: 'PUT',
							url: `https://s3.test/up/${encodeURIComponent(file_id)}`,
							headers: {
								'Content-Length': String(f.file_size),
								'Content-Type': f.content_type
							}
						}
					]
				};
			});
			return json({ status: 200, data: { files } });
		}

		if (url.pathname.includes('/template/hair-transfer')) {
			if (this.templatePages === 'error') return json({ status: 500, error: 'boom' }, 500);
			const idx = Number(url.searchParams.get('starting_token') ?? 0);
			const page = this.templatePages?.[idx];
			return json({ status: 200, data: page ?? { templates: [], next_token: null } });
		}

		if (method === 'POST') {
			const n = ++this.taskCounter;
			const custom = this.onCreate?.(url.pathname, body, n);
			if (custom) return custom;
			const id = `task/${n}+z`;
			this.tasks.set(id, { id, path: url.pathname, body, polls: 0 });
			return json({ status: 200, data: { task_id: id } });
		}

		// poll: the last path segment is the encoded task id
		const id = decodeURIComponent(url.pathname.split('/').pop()!);
		const task = this.tasks.get(id);
		if (!task) return json({ status: 404, error_code: 'InvalidTaskId', error: 'no task' }, 404);
		task.polls++;
		const custom = this.onPoll?.(task, task.polls);
		if (custom === 'network') throw new TypeError('fetch failed');
		if (custom) return json(custom.json, custom.status ?? 200);
		if (task.polls < 2) {
			return json({ status: 200, data: { task_status: 'running', error: null, results: null } });
		}
		const results = this.resultsFor?.(task) ?? {
			url: `https://results.test/${task.id.replace(/\W/g, '_')}.bin`
		};
		return json({ status: 200, data: { task_status: 'success', error: null, results } });
	};
}

/** Installs a fresh fake with fast polling and an unthrottled limiter. */
export function installFake(): FakeYouCam {
	const fake = new FakeYouCam();
	setFetch(fake.fetch as typeof fetch);
	setPollSchedule({
		firstMs: 1,
		earlyMs: 1,
		earlyUntilMs: 50,
		laterMs: 1,
		backoffMs: 1,
		backoffMaxMs: 4,
		downloadRetryMs: 1
	});
	configureLimiter({ ratePerSec: 10_000, burst: 10_000 });
	limiter.reset();
	resetFileCache({ clearDisk: true });
	resetChainUrls();
	resetReservations();
	resetHairTemplateCache();
	return fake;
}

export function uninstallFake(): void {
	setFetch(undefined);
	setPollSchedule({});
}
