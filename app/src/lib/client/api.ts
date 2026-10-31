// HTTP client for the Godmother API (see docs/ARCHITECTURE.md). Browser-side only.
import type { Asset, AttachmentPurpose, Id, Session, StreamEvent, UserAction } from '#lib/types';
import { fetchWithRetry } from './retry';

export interface TurnBody {
	/** Lets the same turn be sent again safely. */
	turnId?: Id;
	text: string;
	attachments: { assetId: Id; purpose: AttachmentPurpose }[];
	action?: UserAction;
}

/** How a SessionClient talks to a backend. The real one is HTTP; /studio/mock uses a simulator. */
export interface Transport {
	turn(sessionId: Id, body: TurnBody, signal?: AbortSignal): AsyncIterable<StreamEvent>;
	upload(sessionId: Id, file: File, purpose: AttachmentPurpose): Promise<Asset>;
	/** Follows the session's current turn. Absent on backends that have nothing to reattach to. */
	attach?(sessionId: Id, signal?: AbortSignal): AsyncIterable<StreamEvent>;
}

/** The server answered with an error, as opposed to the request never arriving. */
export class HttpFailure extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

export interface Health {
	ok: boolean;
	live: {
		llm: boolean;
		youcam: boolean;
		db: boolean;
		images: boolean;
		email: boolean;
		accounts: boolean;
	};
	demo: boolean;
}

async function failure(res: Response): Promise<HttpFailure> {
	let detail = '';
	try {
		const body = await res.text();
		try {
			const j = JSON.parse(body) as { message?: string; error?: string };
			detail = j.message ?? j.error ?? body;
		} catch {
			detail = body;
		}
	} catch {
		/* ignore */
	}
	return new HttpFailure(
		res.status,
		detail.trim().slice(0, 240) || `Request failed (${res.status})`
	);
}

/**
 * Parse an SSE body of `data: <json>\n\n` frames into StreamEvents.
 * Robust to frames split across chunks, CRLF line endings and multi-line data fields.
 */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buf = '';
	const parse = (frame: string): StreamEvent | null => {
		const data = frame
			.split('\n')
			.filter((l) => l.startsWith('data:'))
			.map((l) => l.slice(5).replace(/^ /, ''))
			.join('\n');
		if (!data) return null;
		try {
			return JSON.parse(data) as StreamEvent;
		} catch {
			return null;
		}
	};
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
			let i: number;
			while ((i = buf.indexOf('\n\n')) !== -1) {
				const ev = parse(buf.slice(0, i));
				buf = buf.slice(i + 2);
				if (ev) yield ev;
			}
		}
		buf += decoder.decode();
		const tail = parse(buf.trim());
		if (tail) yield tail;
	} finally {
		reader.releaseLock();
	}
}

export const httpTransport: Transport = {
	async *turn(sessionId, body, signal) {
		const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
			body: JSON.stringify(body),
			signal
		});
		if (!res.ok || !res.body) throw await failure(res);
		yield* readSSE(res.body);
	},
	async upload(sessionId, file, purpose) {
		const form = new FormData();
		form.append('file', file);
		form.append('purpose', purpose);
		const res = await fetchWithRetry(`/api/sessions/${encodeURIComponent(sessionId)}/assets`, {
			method: 'POST',
			body: form
		});
		if (!res.ok) throw await failure(res);
		return (await res.json()) as Asset;
	},
	async *attach(sessionId, signal) {
		const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/turn`, {
			headers: { accept: 'text/event-stream' },
			signal
		});
		if (!res.ok || !res.body) throw await failure(res);
		yield* readSSE(res.body);
	}
};

export async function createSession(mode: 'live' | 'demo'): Promise<Session> {
	const res = await fetchWithRetry('/api/sessions', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ mode })
	});
	if (!res.ok) throw await failure(res);
	return (await res.json()) as Session;
}

export async function getHealth(fetcher: typeof fetch = fetch): Promise<Health> {
	const res = await fetchWithRetry('/api/health', undefined, fetcher);
	if (!res.ok) throw await failure(res);
	return (await res.json()) as Health;
}
