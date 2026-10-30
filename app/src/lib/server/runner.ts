// Executes one user turn for POST /api/sessions/:id/messages.

import { randomUUID } from 'node:crypto';
import { config } from '#lib/server/config';
import { runAgentTurn } from '#lib/server/agent';
import { runDemoTurn } from '#lib/server/demo';
import { createEventStream } from '#lib/server/sse';
import {
	flushRecorder,
	getAssetMeta,
	getSession,
	recordEvent,
	recordUserTurn,
	saveSession,
	withSessionLock
} from '#lib/server/store';
import { snapshot, type TurnContext, type TurnInput, type TurnRunner } from '#lib/server/turn';
import type {
	Attachment,
	AttachmentPurpose,
	ChatMessage,
	PhotoSlot,
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
	return { text, attachments, action };
}

function json(status: number, error: string): Response {
	return Response.json({ error }, { status });
}

/**
 * Validates the request (plain JSON 400/404 on failure), then answers with the SSE stream of one turn.
 * The session lock is held for the whole turn, so a second message waits for the first.
 */
export async function executeTurn(sessionId: string, rawBody: unknown): Promise<Response> {
	let body: ValidBody;
	try {
		body = parseBody(rawBody);
	} catch (err) {
		if (err instanceof BadRequest) return json(400, err.message);
		throw err;
	}

	const existing = await getSession(sessionId);
	if (!existing) return json(404, 'Session not found.');

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

	return createEventStream((sseEmit) =>
		withSessionLock(sessionId, () => runLocked(sessionId, body, resolved, sseEmit))
	);
}

async function runLocked(
	sessionId: string,
	body: ValidBody,
	attachments: Attachment[],
	sseEmit: (e: StreamEvent) => void
): Promise<void> {
	const session = await getSession(sessionId);
	if (!session) throw new Error('Session not found.');
	const live = session.mode === 'live';
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
			emit({ type: 'activity', id, label, status, ...(detail !== undefined ? { detail } : {}) });
		},
		async sessionChanged() {
			await saveSession(session);
			emit({ type: 'session', session: snapshot(session) });
		},
		emit
	};

	try {
		const runner: TurnRunner = session.mode === 'demo' ? runDemoTurn : runAgentTurn;
		if (live && !config.live.openai) {
			ctx.text(
				"I can't plan looks yet: this server has no OpenAI key (set OPENAI_API_KEY in the server environment). " +
					'Demo mode needs no keys, so you can start a demo session to see how Godmother works.'
			);
		} else {
			await runner(ctx, input);
		}
	} catch (err) {
		console.error('[runner] turn failed', err);
		const message = err instanceof Error && err.message ? err.message : 'Something went wrong.';
		const block = { type: 'error' as const, message };
		assistantMessage.blocks.push(block);
		emit({ type: 'block', messageId: assistantMessage.id, block });
		emit({ type: 'error', message });
	} finally {
		try {
			await saveSession(session);
		} catch (err) {
			console.error('[runner] final save failed', err);
		}
		emit({ type: 'session', session: snapshot(session) });
		if (live) await flushRecorder(sessionId);
	}
}
