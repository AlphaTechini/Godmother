// Shared by the agent tests: a scripted fake OpenAI client, a fake TurnContext, a YouCam module mock, fixtures.
// Not a test file itself. Tests must `vi.mock('#lib/server/config', ...)` and `vi.mock('#lib/server/youcam', ...)` first.

import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type {
	ModelClient,
	Response,
	ResponseCreateParamsNonStreaming,
	ResponseCreateParamsStreaming,
	ResponseStreamEvent
} from '#lib/server/openai';
import { createSession, saveAsset, saveSession } from '#lib/server/store';
import { snapshot, type TurnContext } from '#lib/server/turn';
import type {
	Asset,
	Attachment,
	Block,
	ChatMessage,
	Look,
	NamedColor,
	Session,
	StreamEvent,
	WardrobeItem
} from '#lib/types';
import { emptyAgentState, type AgentState } from './state';
import type { ToolEnv } from './tools/types';

const PNG = Uint8Array.from(
	Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
		'base64'
	)
);

/* ---------------------------------------------------------------- fake model */

export interface ScriptedCall {
	name: string;
	args: unknown;
	id?: string;
	/** Send the raw string instead of JSON.stringify(args), e.g. to test malformed arguments. */
	rawArguments?: string;
}

export interface ScriptedRound {
	text?: string[];
	calls?: ScriptedCall[];
	/** Default: resp_<n>. Use '' to simulate a missing id. */
	responseId?: string;
}

/** A model whose streaming rounds and plain responses are scripted. Records every request. */
export class FakeModel implements ModelClient {
	streamRequests: ResponseCreateParamsStreaming[] = [];
	respondRequests: ResponseCreateParamsNonStreaming[] = [];
	respondQueue: (Response | ((p: ResponseCreateParamsNonStreaming) => Response))[] = [];

	constructor(public rounds: ScriptedRound[] = []) {}

	async stream(params: ResponseCreateParamsStreaming): Promise<AsyncIterable<ResponseStreamEvent>> {
		this.streamRequests.push(structuredClone(params));
		const n = this.streamRequests.length;
		const round = this.rounds.shift() ?? { text: ['(script exhausted)'] };
		const id = round.responseId ?? `resp_${n}`;
		const events: ResponseStreamEvent[] = [];
		const e = (x: unknown) => events.push(x as ResponseStreamEvent);
		e({ type: 'response.created', response: { id } });
		for (const delta of round.text ?? []) {
			e({
				type: 'response.output_text.delta',
				delta,
				item_id: 'm1',
				output_index: 0,
				content_index: 0
			});
		}
		for (const [i, c] of (round.calls ?? []).entries()) {
			e({
				type: 'response.output_item.done',
				output_index: i + 1,
				item: {
					type: 'function_call',
					id: `fc_${n}_${i}`,
					call_id: c.id ?? `call_${n}_${i}`,
					name: c.name,
					arguments: c.rawArguments ?? JSON.stringify(c.args ?? {})
				}
			});
		}
		e({ type: 'response.completed', response: { id } });
		return (async function* () {
			for (const ev of events) yield ev;
		})();
	}

	async respond(params: ResponseCreateParamsNonStreaming): Promise<Response> {
		this.respondRequests.push(structuredClone(params));
		const next = this.respondQueue.shift();
		if (!next) throw new Error('FakeModel: no scripted respond() response left');
		return typeof next === 'function' ? next(params) : next;
	}
}

/** A plain Responses result carrying structured JSON (and optional citations). */
export function jsonResponse(
	value: unknown,
	citations: { url: string; title: string }[] = []
): Response {
	const text = JSON.stringify(value);
	return {
		id: `resp_${randomUUID()}`,
		output_text: text,
		output: [
			{
				type: 'message',
				content: [
					{
						type: 'output_text',
						text,
						annotations: citations.map((c) => ({
							type: 'url_citation',
							start_index: 0,
							end_index: 1,
							...c
						}))
					}
				]
			}
		]
	} as unknown as Response;
}

/* ------------------------------------------------------------------ context */

export function makeCtx(session: Session, text = 'hello', attachments: Attachment[] = []) {
	const events: StreamEvent[] = [];
	const now = new Date().toISOString();
	const userMessage: ChatMessage = {
		id: randomUUID(),
		role: 'user',
		createdAt: now,
		text,
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
	session.messages.push(userMessage, assistantMessage);
	const ctx: TurnContext = {
		session,
		userMessage,
		assistantMessage,
		text(delta) {
			assistantMessage.text += delta;
			events.push({ type: 'text_delta', messageId: assistantMessage.id, delta });
		},
		block(block: Block) {
			assistantMessage.blocks.push(block);
			events.push({ type: 'block', messageId: assistantMessage.id, block });
		},
		activity(id, label, status, detail) {
			events.push({
				type: 'activity',
				id,
				label,
				status,
				...(detail !== undefined ? { detail } : {})
			});
		},
		async sessionChanged() {
			await saveSession(session);
			events.push({ type: 'session', session: snapshot(session) });
		},
		emit(event) {
			events.push(event);
		}
	};
	return { ctx, events, userMessage, assistantMessage };
}

export function makeEnv(
	session: Session,
	model: ModelClient = new FakeModel(),
	agent: AgentState = emptyAgentState()
) {
	const made = makeCtx(session);
	const env: ToolEnv = {
		ctx: made.ctx,
		session,
		agent,
		model,
		saveAgent: async () => {}
	};
	return { env, ...made };
}

/* ----------------------------------------------------------------- fixtures */

export async function makeAsset(session: Session, kind: Asset['kind'] = 'upload'): Promise<Asset> {
	const {
		sessionId: _s,
		createdAt: _c,
		...asset
	} = await saveAsset({
		bytes: PNG,
		mime: 'image/png',
		kind,
		sessionId: session.id
	});
	return asset;
}

export function newSession(): Session {
	return createSession('live');
}

export async function sessionWithPhotos(
	slots: ('fullBody' | 'portrait' | 'hand')[] = ['fullBody']
): Promise<Session> {
	const s = newSession();
	for (const slot of slots) s.photos[slot] = await makeAsset(s);
	return s;
}

export async function addWardrobe(
	session: Session,
	role: WardrobeItem['role'],
	description = `a ${role}`,
	colors: NamedColor[] = [{ name: 'black', hex: '#000000' }]
): Promise<WardrobeItem> {
	const item: WardrobeItem = {
		id: `wd_${randomUUID().slice(0, 6)}`,
		image: await makeAsset(session),
		role,
		description,
		colors
	};
	session.wardrobe.push(item);
	return item;
}

export function lookInput(
	pieces: { role: string; type: 'wardrobe' | 'product' | 'sew'; id: string; name?: string }[],
	title = 'Look'
) {
	return {
		title,
		summary: `${title} summary`,
		rationale: 'Fits the dress code.',
		palette: [{ name: 'emerald', hex: '#046307' }],
		pieces: pieces.map((p) => ({
			role: p.role,
			name: p.name ?? `${p.role} piece`,
			colorHex: null,
			source: { type: p.type, id: p.id }
		}))
	};
}

export function lastBlock<T extends Block['type']>(
	events: StreamEvent[],
	type: T
): Extract<Block, { type: T }> | undefined {
	const hit = [...events].reverse().find((e) => e.type === 'block' && e.block.type === type);
	return hit && hit.type === 'block' ? (hit.block as Extract<Block, { type: T }>) : undefined;
}

export function blocksOf(events: StreamEvent[], type: Block['type']): Block[] {
	return events.flatMap((e) => (e.type === 'block' && e.block.type === type ? [e.block] : []));
}

export function renderedLook(session: Session, index: number, id = `look_${index}`): Look {
	const look: Look = {
		id,
		index,
		title: `Look ${index}`,
		summary: 's',
		rationale: 'r',
		palette: [],
		pieces: [],
		render: { status: 'done', steps: [] },
		version: 1
	};
	session.looks.push(look);
	return look;
}

/* -------------------------------------------------------------- youcam mock */

/** Module factory for `vi.mock('#lib/server/youcam', ...)`. */
export function youcamMockModule() {
	class UnitCapError extends Error {
		constructor(
			readonly needed: number,
			readonly remaining: number
		) {
			super(`needs ${needed}, ${remaining} left`);
		}
	}
	class YouCamTaskError extends Error {
		constructor(
			readonly code: string,
			readonly userMessage: string,
			readonly feature: string
		) {
			super(`${feature}: ${code}`);
		}
	}
	return {
		UnitCapError,
		YouCamTaskError,
		MAKEUP_PATTERNS: {},
		tryOnGarment: vi.fn(),
		tryOnShoes: vi.fn(),
		applyMakeup: vi.fn(),
		applyHairstyle: vi.fn(),
		listHairTemplates: vi.fn(),
		tryOnAccessory: vi.fn(),
		analyzeFace: vi.fn(),
		generateGarmentImage: vi.fn(),
		unitCost: vi.fn(() => 2),
		validateMakeupEffects: vi.fn(),
		makeupEffectsJsonSchema: vi.fn(() => ({
			type: 'array',
			items: { type: 'object' },
			minItems: 1
		}))
	};
}

type YC = ReturnType<typeof youcamMockModule>;

/** Resets the mocks to well-behaved defaults: each feature stores a fresh image and spends its units. */
export function installYoucamDefaults(yc: YC): { calls: string[] } {
	const calls: string[] = [];
	const feature = (name: string, units: number) =>
		vi.fn(async (ctx: { session: Session }) => {
			calls.push(name);
			ctx.session.units.spent += units;
			return { image: await makeAsset(ctx.session, 'result'), seconds: 1, units };
		});
	yc.tryOnGarment.mockReset().mockImplementation(feature('garment', 2));
	yc.tryOnShoes.mockReset().mockImplementation(feature('shoes', 2));
	yc.applyMakeup.mockReset().mockImplementation(feature('makeup', 1));
	yc.applyHairstyle.mockReset().mockImplementation(feature('hair', 2));
	yc.tryOnAccessory.mockReset().mockImplementation(feature('accessory', 1));
	yc.generateGarmentImage.mockReset().mockImplementation(feature('image', 1));
	yc.analyzeFace.mockReset().mockImplementation(async (ctx: { session: Session }) => {
		calls.push('analyze');
		ctx.session.units.spent += 30;
		return {
			skinTone: { name: 'warm brown', hex: '#8D5524' },
			undertone: 'warm',
			faceShape: 'Oval',
			features: { eye_shape: 'almond' }
		};
	});
	yc.listHairTemplates.mockReset().mockResolvedValue([
		{ id: 'all_goddess_waves', title: 'Goddess Waves', gender: 'female', keepUsersColor: true },
		{ id: 'male_afro', title: 'Afro', gender: 'male', keepUsersColor: true }
	]);
	yc.validateMakeupEffects.mockReset().mockImplementation((effects: unknown) => {
		const list = Array.isArray(effects)
			? (effects as { category?: string; pattern?: { name?: string } }[])
			: [];
		const errors = list.flatMap((e, i) =>
			e.pattern?.name === 'BAD' ? [`effects[${i}]: unknown pattern "BAD" for ${e.category}`] : []
		);
		return errors.length ? { ok: false, errors } : { ok: true, effects: list };
	});
	return { calls };
}
