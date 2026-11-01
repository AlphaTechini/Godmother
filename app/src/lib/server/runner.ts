// Executes one user turn for POST /api/sessions/:id/messages.

import { randomUUID } from 'node:crypto';
import { config } from '#lib/server/config';
import { runAgentTurn } from '#lib/server/agent';
import { runDemoTurn } from '#lib/server/demo';
import { createEventStream } from '#lib/server/sse';
import { poolFor, walletsEnabled, type Spender } from '#lib/server/units/wallets';
import { bindUnitPool, unbindUnitPool } from '#lib/server/youcam/ledger';
import { clearJournal } from '#lib/server/youcam/task-journal';
import {
	flushRecorder,
	getAssetMeta,
	getSession,
	isUuid,
	recordEvent,
	recordUserTurn,
	saveSession,
	waitForCloudCopies,
	withSessionLock
} from '#lib/server/store';
import {
	publicSession,
	snapshot,
	type TurnContext,
	type TurnInput,
	type TurnRunner
} from '#lib/server/turn';
import { beginTurn, liveTurn, liveTurnFor } from '#lib/server/turn-hub';
import { markInterrupted, reconcileTurn } from '#lib/server/turn-recovery';
import type {
	Attachment,
	AttachmentPurpose,
	ChatMessage,
	PhotoSlot,
	Session,
	StreamEvent,
	UserAction
} from '#lib/types';

export const MAX_TEXT_CHARS = 4000;
export const MAX_ATTACHMENTS = 8;

const PURPOSES: readonly AttachmentPurpose[] = [
	'fullBody',
	'portrait',
	'hand',
	'invitation',
	'wardrobe',
	'other'
];
const PHOTO_SLOTS: readonly PhotoSlot[] = ['fullBody', 'portrait', 'hand'];

interface ValidBody {
	/** Chosen by the browser, so sending the same turn twice can't run it twice. */
	turnId?: string;
	text: string;
	attachments: { assetId: string; purpose: AttachmentPurpose }[];
	action?: UserAction;
}

class BadRequest extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseBody(body: unknown): ValidBody {
	if (!isRecord(body)) throw new BadRequest('Body must be a JSON object.');
	if (body.turnId !== undefined && !isUuid(body.turnId)) {
		throw new BadRequest('"turnId" must be a UUID.');
	}
	const turnId = body.turnId as string | undefined;
	const text = body.text ?? '';
	if (typeof text !== 'string') throw new BadRequest('"text" must be a string.');
	if (text.length > MAX_TEXT_CHARS) {
		throw new BadRequest(`"text" must be at most ${MAX_TEXT_CHARS} characters.`);
	}
	const rawAtt = body.attachments ?? [];
	if (!Array.isArray(rawAtt)) throw new BadRequest('"attachments" must be an array.');
	if (rawAtt.length > MAX_ATTACHMENTS) {
		throw new BadRequest(`At most ${MAX_ATTACHMENTS} attachments per message.`);
	}
	const attachments = rawAtt.map((a, i) => {
		if (!isRecord(a) || typeof a.assetId !== 'string' || !a.assetId) {
			throw new BadRequest(`attachments[${i}].assetId must be a string.`);
		}
		if (typeof a.purpose !== 'string' || !PURPOSES.includes(a.purpose as AttachmentPurpose)) {
			throw new BadRequest(`attachments[${i}].purpose must be one of ${PURPOSES.join(', ')}.`);
		}
		return { assetId: a.assetId, purpose: a.purpose as AttachmentPurpose };
	});

	let action: UserAction | undefined;
	if (body.action !== undefined && body.action !== null) {
		const a = body.action;
		if (!isRecord(a) || typeof a.type !== 'string') throw new BadRequest('"action" is invalid.');
		switch (a.type) {
			case 'decide_for_me':
			case 'shopping_list':
			case 'showcase_video':
				action = { type: a.type };
				break;
			case 'choose_look':
			case 'finish_look':
				if (typeof a.lookId !== 'string' || !a.lookId) {
					throw new BadRequest(`action.lookId is required for "${a.type}".`);
				}
				action = { type: a.type, lookId: a.lookId };
				break;
			default:
				throw new BadRequest(`Unknown action type "${a.type}".`);
		}
	}

	if (!text.trim() && attachments.length === 0 && !action) {
		throw new BadRequest('Send some text, an attachment or an action.');
	}
	return { turnId, text, attachments, action };
}

function json(status: number, error: string): Response {
	return Response.json({ error }, { status });
}

/** The session as it stands, then live events until its current turn ends. */
export function followTurn(session: Session): Response {
	return createEventStream((emit) => {
		const turn = liveTurnFor(session.id);
		emit({
			type: 'resync',
			session: publicSession(session),
			activities: turn ? [...turn.activities.values()] : []
		});
		if (!turn) return Promise.resolve();
		turn.listeners.add(emit);
		return turn.done;
	});
}

/**
 * Validates the request (plain JSON 400/404 on failure), then answers with the SSE stream of one turn.
 * The session lock is held for the whole turn, so a second message waits for the first.
 * A turn id seen before attaches to that turn instead of running it again.
 */
export async function executeTurn(
	sessionId: string,
	rawBody: unknown,
	spender?: Spender
): Promise<Response> {
	let body: ValidBody;
	try {
		body = parseBody(rawBody);
	} catch (err) {
		if (err instanceof BadRequest) return json(400, err.message);
		throw err;
	}

	const existing = await getSession(sessionId);
	if (!existing) return json(404, 'Session not found.');
	if (body.turnId && (liveTurn(body.turnId) || existing.turn?.id === body.turnId)) {
		await reconcileTurn(existing);
		return followTurn(existing);
	}
	await reconcileTurn(existing);

	// Resolve attachments up front so bad asset ids are a 400, not a stream error.
	const resolved: Attachment[] = [];
	for (const a of body.attachments) {
		const asset = await getAssetMeta(a.assetId);
		if (!asset) return json(400, `Unknown asset "${a.assetId}".`);
		if (asset.sessionId && asset.sessionId !== existing.id) {
			return json(400, `Asset "${a.assetId}" belongs to another session.`);
		}
		const { sessionId: _s, createdAt: _c, ...plain } = asset;
		resolved.push({ asset: plain, purpose: a.purpose });
	}

	const turnId = body.turnId ?? randomUUID();
	return createEventStream((sseEmit) => {
		const turn = beginTurn(sessionId, turnId, (emit) =>
			withSessionLock(sessionId, () => runLocked(sessionId, turnId, body, resolved, emit, spender))
		);
		turn.listeners.add(sseEmit);
		return turn.done;
	});
}

async function runLocked(
	sessionId: string,
	turnId: string,
	body: ValidBody,
	attachments: Attachment[],
	sseEmit: (e: StreamEvent) => void,
	spender?: Spender
): Promise<void> {
	const session = await getSession(sessionId);
	if (!session) throw new Error('Session not found.');
	const live = session.mode === 'live';
	if (live && spender && walletsEnabled()) {
		const pool = await poolFor(spender);
		bindUnitPool(session.id, pool);
		// The session's cap shows what this person can still spend, wherever they spent the rest.
		session.units.cap = session.units.spent + pool.available();
	}
	const startedAt = Date.now();
	// 0-based: the number of user messages before this one.
	const turnIndex = session.messages.filter((m) => m.role === 'user').length;

	const emit = (e: StreamEvent) => {
		sseEmit(e);
		if (live) recordEvent(sessionId, turnIndex, Date.now() - startedAt, e);
	};

	const now = new Date().toISOString();
	const userMessage: ChatMessage = {
		id: randomUUID(),
		role: 'user',
		createdAt: now,
		text: body.text,
		attachments,
		blocks: []
	};
	const assistantMessage: ChatMessage = {
		id: randomUUID(),
		role: 'assistant',
		createdAt: now,
		text: '',
		attachments: [],
		blocks: []
	};
	for (const att of attachments) {
		if (PHOTO_SLOTS.includes(att.purpose as PhotoSlot)) {
			session.photos[att.purpose as PhotoSlot] = att.asset;
		}
	}
	session.messages.push(userMessage, assistantMessage);
	session.turn = { id: turnId, status: 'running', startedAt: now };

	const input: TurnInput = { text: body.text, attachments, action: body.action };
	if (live) recordUserTurn(sessionId, turnIndex, input);

	try {
		await saveSession(session);
	} catch (err) {
		console.error('[runner] save failed', err);
	}
	emit({ type: 'message', message: structuredClone(userMessage) });
	emit({ type: 'message', message: structuredClone(assistantMessage) });

	const ctx: TurnContext = {
		session,
		userMessage,
		assistantMessage,
		text(delta) {
			assistantMessage.text += delta;
			emit({ type: 'text_delta', messageId: assistantMessage.id, delta });
		},
		block(block) {
			assistantMessage.blocks.push(block);
			emit({ type: 'block', messageId: assistantMessage.id, block });
		},
		activity(id, label, status, detail) {
			emit({
				type: 'activity',
				id,
				messageId: assistantMessage.id,
				label,
				status,
				...(detail !== undefined ? { detail } : {})
			});
		},
		async sessionChanged() {
			await saveSession(session);
			emit({ type: 'session', session: snapshot(session) });
		},
		emit
	};

	let failed = false;
	try {
		const runner: TurnRunner = session.mode === 'demo' ? runDemoTurn : runAgentTurn;
		if (live && !config.live.llm) {
			ctx.text(
				"I can't plan looks yet: this server has no Anthropic key (set ANTHROPIC_API_KEY in the server environment). " +
					'Demo mode needs no keys, so you can start a demo session to see how Godmother works.'
			);
		} else {
			await runner(ctx, input);
		}
	} catch (err) {
		console.error('[runner] turn failed', err);
		failed = true;
		const message = err instanceof Error && err.message ? err.message : 'Something went wrong.';
		const block = { type: 'error' as const, message };
		assistantMessage.blocks.push(block);
		emit({ type: 'block', messageId: assistantMessage.id, block });
		emit({ type: 'error', message });
	} finally {
		unbindUnitPool(session.id);
		if (failed) {
			markInterrupted(session);
		} else {
			session.turn = { id: turnId, status: 'done', startedAt: now };
			clearJournal(session);
		}
		try {
			await saveSession(session);
		} catch (err) {
			console.error('[runner] final save failed', err);
		}
		emit({ type: 'session', session: snapshot(session) });
		if (live) {
			await flushRecorder(sessionId);
			await waitForCloudCopies(sessionId);
		}
	}
}
