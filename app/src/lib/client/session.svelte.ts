// Browser-side session state: one instance per open studio.
// Applies the turn stream exactly as docs/ARCHITECTURE.md "Turn stream" describes.
import type {
	Asset,
	Attachment,
	AttachmentPurpose,
	ChatMessage,
	Id,
	PhotoSlot,
	Session,
	StreamEvent,
	UserAction
} from '#lib/types';
import { HttpFailure, httpTransport, type Transport } from './api';
import { isRetryableStatus, wait } from './retry';

export interface Activity {
	id: Id;
	label: string;
	status: 'running' | 'done' | 'failed';
	detail?: string;
	/** The assistant message that was streaming when the activity started. */
	messageId: Id | null;
	startedAt: number;
	endedAt?: number;
}

export interface SendInput {
	text: string;
	attachments?: { assetId: Id; purpose: AttachmentPurpose }[];
	action?: UserAction;
	/** Set when retrying, so a turn that did reach the server isn't run twice. */
	turnId?: Id;
}

const PHOTO_SLOTS: readonly string[] = ['fullBody', 'portrait', 'hand'];
const isPhotoSlot = (p: AttachmentPurpose): p is PhotoSlot => PHOTO_SLOTS.includes(p);
const SEND_RETRY_MS = [1000, 3000];
/** About two minutes of trying to reach a turn that's still running. */
const REATTACH_MS = [
	1000, 2000, 4000, 8000, 15_000, 15_000, 15_000, 15_000, 15_000, 15_000, 15_000
];

const uid = () =>
	globalThis.crypto?.randomUUID?.() ??
	`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export class SessionClient {
	session: Session = $state() as Session;
	/** Live tool progress, keyed by activity id. */
	activities: Record<Id, Activity> = $state({});
	streaming = $state(false);
	/** The assistant message currently receiving deltas. */
	streamingId: Id | null = $state(null);
	error: string | null = $state(null);
	/** The turn that never reached the server (network failure), kept so it can be retried. */
	failed: SendInput | null = $state(null);
	/** Uploads in flight, keyed by purpose. */
	uploading: Partial<Record<AttachmentPurpose, number>> = $state({});

	#transport: Transport;
	#abort: AbortController | null = null;
	/** Assets uploaded this session, so optimistic messages can show thumbnails. */
	#assets = new Map<Id, Asset>();

	constructor(session: Session, transport: Transport = httpTransport) {
		this.session = session;
		this.#transport = transport;
	}

	get mode() {
		return this.session.mode;
	}

	activitiesFor(messageId: Id): Activity[] {
		return Object.values(this.activities)
			.filter((a) => a.messageId === messageId)
			.sort((a, b) => a.startedAt - b.startedAt);
	}

	asset(id: Id): Asset | undefined {
		return this.#assets.get(id);
	}

	async send({ text, attachments = [], action, turnId = uid() }: SendInput): Promise<void> {
		if (this.streaming) return;
		const trimmed = text.trim();
		if (!trimmed && !attachments.length && !action) return;

		this.error = null;
		this.failed = null;
		this.streaming = true;
		this.#abort = new AbortController();
		let received = false;

		const localId = `local-${uid()}`;
		const optimistic: ChatMessage = {
			id: localId,
			role: 'user',
			createdAt: new Date().toISOString(),
			text: trimmed,
			attachments: attachments.map((a): Attachment => ({
				purpose: a.purpose,
				asset: this.#assets.get(a.assetId) ?? {
					id: a.assetId,
					url: `/api/assets/${a.assetId}`,
					kind: 'upload',
					mime: 'image/*'
				}
			})),
			blocks: []
		};
		this.session.messages.push(optimistic);

		try {
			const signal = this.#abort.signal;
			let finished = false;
			// The turn id makes sending again safe: the server attaches to a turn it already has.
			for (let attempt = 0; !finished && !received; attempt++) {
				try {
					const stream = this.#transport.turn(
						this.session.id,
						{ turnId, text: trimmed, attachments, action },
						signal
					);
					for await (const ev of stream) {
						received = true;
						this.apply(ev, localId);
						if (ev.type === 'done') finished = true;
						if (finished) break;
					}
					if (!received) throw new TypeError('The connection closed before the turn started.');
				} catch (e) {
					if (received) break;
					const retryable =
						e instanceof TypeError || (e instanceof HttpFailure && isRetryableStatus(e.status));
					if (!retryable || attempt >= SEND_RETRY_MS.length) throw e;
					await wait(SEND_RETRY_MS[attempt], signal);
				}
			}
			if (!finished) await this.#reattach(signal);
		} catch (e) {
			if (!(e instanceof DOMException && e.name === 'AbortError')) {
				this.error =
					e instanceof TypeError
						? 'Couldn’t reach Godmother. Check your connection and try again.'
						: e instanceof Error
							? e.message
							: String(e);
				if (!received) {
					// The server never saw this turn: take the optimistic message back and offer a retry.
					const i = this.session.messages.findIndex((x) => x.id === localId);
					if (i !== -1) this.session.messages.splice(i, 1);
					this.failed = { text: trimmed, attachments, action, turnId };
				}
			}
		} finally {
			// Anything still "running" when the stream closes did not finish.
			for (const a of Object.values(this.activities)) {
				if (a.status === 'running' && a.messageId === this.streamingId) {
					a.status = this.error ? 'failed' : 'done';
					a.endedAt = Date.now();
				}
			}
			this.streaming = false;
			this.streamingId = null;
			this.#abort = null;
		}
	}

	/** Follows the turn again after losing the stream. It carries on server side meanwhile. */
	async #reattach(signal: AbortSignal): Promise<void> {
		const attach = this.#transport.attach;
		if (!attach) throw new TypeError('The connection was lost.');
		for (let attempt = 0; attempt < REATTACH_MS.length; attempt++) {
			try {
				for await (const ev of attach.call(this.#transport, this.session.id, signal)) {
					attempt = -1;
					this.apply(ev);
					if (ev.type === 'done') return;
				}
			} catch (e) {
				if (signal.aborted) throw e;
				// The session is gone or no longer ours: retrying can't help.
				if (e instanceof HttpFailure && !isRetryableStatus(e.status)) throw e;
			}
			await wait(REATTACH_MS[Math.max(0, attempt)], signal);
		}
		throw new TypeError('The connection was lost.');
	}

	/** Picks up a turn already running when the page opened, for example after a reload. */
	async resumeRunningTurn(): Promise<void> {
		if (this.streaming || this.session.turn?.status !== 'running') return;
		this.streaming = true;
		this.#abort = new AbortController();
		try {
			await this.#reattach(this.#abort.signal);
		} catch (e) {
			if (!(e instanceof DOMException && e.name === 'AbortError')) {
				this.error = e instanceof Error ? e.message : String(e);
			}
		} finally {
			this.streaming = false;
			this.streamingId = null;
			this.#abort = null;
		}
	}

	/** Stop the current turn (the server keeps whatever it already stored). */
	stop() {
		this.#abort?.abort();
	}

	/** Apply one stream event. Public so fixtures and tests can drive the client directly. */
	apply(ev: StreamEvent, localUserId?: Id) {
		const msgs = this.session.messages;
		switch (ev.type) {
			case 'message': {
				const m = ev.message;
				if (m.role === 'user' && localUserId) {
					const i = msgs.findIndex((x) => x.id === localUserId);
					if (i !== -1) {
						msgs[i] = m;
						break;
					}
				}
				const existing = msgs.findIndex((x) => x.id === m.id);
				if (existing !== -1) msgs[existing] = m;
				else msgs.push(m);
				if (m.role === 'assistant') this.streamingId = m.id;
				break;
			}
			case 'resync': {
				this.session = ev.session;
				const activities: Record<Id, Activity> = {};
				for (const a of ev.activities) {
					const ended = a.status !== 'running';
					activities[a.id] = {
						id: a.id,
						label: a.label,
						status: a.status,
						detail: a.detail,
						messageId: a.messageId ?? null,
						startedAt: this.activities[a.id]?.startedAt ?? Date.now(),
						endedAt: ended ? (this.activities[a.id]?.endedAt ?? Date.now()) : undefined
					};
				}
				this.activities = activities;
				const running = ev.session.turn?.status === 'running';
				this.streamingId = running ? (ev.session.messages.at(-1)?.id ?? null) : null;
				break;
			}
			case 'text_reset': {
				const m = msgs.find((x) => x.id === ev.messageId);
				if (m) m.text = ev.text;
				break;
			}
			case 'text_delta': {
				const m = msgs.find((x) => x.id === ev.messageId);
				if (m) m.text += ev.delta;
				break;
			}
			case 'block': {
				const m = msgs.find((x) => x.id === ev.messageId);
				if (m) m.blocks.push(ev.block);
				break;
			}
			case 'activity': {
				const a = this.activities[ev.id];
				const ended = ev.status !== 'running';
				if (a) {
					a.label = ev.label;
					a.status = ev.status;
					a.detail = ev.detail;
					if (ended) a.endedAt ??= Date.now();
				} else {
					this.activities[ev.id] = {
						id: ev.id,
						label: ev.label,
						status: ev.status,
						detail: ev.detail,
						messageId: ev.messageId ?? this.streamingId,
						startedAt: Date.now(),
						endedAt: ended ? Date.now() : undefined
					};
				}
				break;
			}
			case 'session': {
				// Keep optimistic photo previews for slots the server hasn't filled yet.
				const photos = { ...ev.session.photos };
				for (const slot of PHOTO_SLOTS as PhotoSlot[]) {
					if (!photos[slot] && this.uploading[slot] && this.session.photos[slot]) {
						photos[slot] = this.session.photos[slot];
					}
				}
				this.session = { ...ev.session, photos, messages: this.session.messages };
				break;
			}
			case 'error': {
				const m = this.streamingId ? msgs.find((x) => x.id === this.streamingId) : undefined;
				if (m) m.blocks.push({ type: 'error', message: ev.message });
				else this.error = ev.message;
				break;
			}
			case 'done':
				this.streaming = false;
				break;
		}
	}

	/** Upload a file. Photo purposes are reflected into session.photos immediately. */
	async upload(file: File, purpose: AttachmentPurpose): Promise<Asset> {
		const preview: Asset = {
			id: `local-${uid()}`,
			url: URL.createObjectURL(file),
			kind: 'upload',
			mime: file.type || 'image/*',
			label: file.name
		};
		const slot = isPhotoSlot(purpose) ? purpose : null;
		const previous = slot ? this.session.photos[slot] : undefined;
		if (slot) this.session.photos[slot] = preview;
		this.uploading[purpose] = (this.uploading[purpose] ?? 0) + 1;
		this.error = null;
		try {
			const asset = await this.#transport.upload(this.session.id, file, purpose);
			this.#assets.set(asset.id, asset);
			if (slot) this.session.photos[slot] = asset;
			return asset;
		} catch (e) {
			if (slot) {
				if (previous) this.session.photos[slot] = previous;
				else delete this.session.photos[slot];
			}
			this.error = e instanceof Error ? e.message : String(e);
			throw e;
		} finally {
			const n = (this.uploading[purpose] ?? 1) - 1;
			if (n > 0) this.uploading[purpose] = n;
			else delete this.uploading[purpose];
		}
	}
}
