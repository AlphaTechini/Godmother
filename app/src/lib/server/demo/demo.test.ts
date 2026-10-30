import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () =>
	(await import('../store/test-config')).mockConfigModule()
);

import { testDirs } from '../store/test-config';
import type { TurnContext, TurnInput } from '#lib/server/turn';
import { snapshot } from '#lib/server/turn';
import type { Block, ChatMessage, Session, StreamEvent } from '#lib/types';
import {
	createDemoPlayer,
	demoInitialSession,
	END_OF_DEMO_TEXT,
	mergeSnapshot,
	OFF_SCRIPT_NOTE,
	runDemoTurn
} from './index';
import {
	checkSuggestionChain,
	finalSuggestions,
	parseDemoScript,
	turnDurationMs,
	type DemoScript
} from './script';

const scriptPath = fileURLToPath(new URL('../../../../demo/script.json', import.meta.url));
const script: DemoScript = parseDemoScript(JSON.parse(readFileSync(scriptPath, 'utf8')));

const waits: number[] = [];
const instant = async (ms: number) => {
	waits.push(ms);
};
const player = (opts: { speed?: number } = {}) =>
	createDemoPlayer({ loadScript: async () => script, sleep: instant, ...opts });

let counter = 0;
const newSessionId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

function makeSession(id = newSessionId()): Session {
	return {
		id,
		createdAt: '2026-01-01T00:00:00.000Z',
		mode: 'demo',
		stage: 'event',
		photos: {},
		wardrobe: [],
		looks: [],
		messages: [],
		units: { spent: 0, cap: 60, ledger: [] }
	};
}

/** A fake TurnContext mirroring what the runner builds. */
function makeCtx(session: Session, input: TurnInput) {
	const frames: StreamEvent[] = [];
	const userMessage: ChatMessage = {
		id: `user-${session.messages.length}`,
		role: 'user',
		createdAt: '2026-01-01T00:00:00.000Z',
		text: input.text,
		attachments: input.attachments,
		blocks: []
	};
	const assistantMessage: ChatMessage = {
		id: `assistant-${session.messages.length}`,
		role: 'assistant',
		createdAt: '2026-01-01T00:00:00.000Z',
		text: '',
		attachments: [],
		blocks: []
	};
	session.messages.push(userMessage, assistantMessage);
	const emit = (e: StreamEvent) => frames.push(e);
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
			emit({ type: 'session', session: snapshot(session) });
		},
		emit
	};
	return { ctx, frames, assistantMessage };
}

/** Puts `n` finished user/assistant exchanges into the session. */
function withHistory(session: Session, n: number): Session {
	for (let i = 0; i < n; i++) {
		session.messages.push(
			{ id: `u${i}`, role: 'user', createdAt: '', text: `u${i}`, attachments: [], blocks: [] },
			{ id: `a${i}`, role: 'assistant', createdAt: '', text: '', attachments: [], blocks: [] }
		);
	}
	return session;
}

const lastBlock = (m: ChatMessage): Block | undefined => m.blocks.at(-1);
const blockTypes = (m: ChatMessage) => m.blocks.map((b) => b.type);

describe('script.json', () => {
	it('parses, has the whole flow and a consistent suggestion chain', () => {
		expect(script.version).toBe(1);
		expect(script.turns.length).toBeGreaterThanOrEqual(6);
		expect(checkSuggestionChain(script)).toEqual([]);
		script.turns.forEach((turn, i) => {
			const options = finalSuggestions(turn);
			expect(options, `turn ${i} ends with suggestions`).not.toBeNull();
			if (script.turns[i + 1]) expect(options?.[0]).toBe(script.turns[i + 1].user.text);
		});
		const types = new Set(
			script.turns.flatMap((t) =>
				t.events.flatMap((e) => (e.event.type === 'block' ? [e.event.block.type] : []))
			)
		);
		for (const t of [
			'event',
			'photo_request',
			'products',
			'looks',
			'decision',
			'face_profile',
			'lookbook',
			'shopping_list',
			'suggestions'
		]) {
			expect(types.has(t as Block['type']), `block ${t}`).toBe(true);
		}
	});

	it('never carries message, done or error frames and keeps events in time order', () => {
		for (const turn of script.turns) {
			for (const { event } of turn.events) {
				expect(['message', 'done', 'error']).not.toContain(event.type);
			}
		}
		expect(() => parseDemoScript({ ...script, version: 2 })).toThrow(/version/);
		expect(() => parseDemoScript({ ...script, turns: 'x' })).toThrow(/turns/);
	});

	it('plays in about a minute or more, with action turns labelled like the buttons', () => {
		const seconds = script.turns.reduce((n, t) => n + turnDurationMs(t), 0) / 1000;
		expect(seconds).toBeGreaterThan(55);
		expect(seconds).toBeLessThan(95);
		expect(script.turns.map((t) => t.user.action?.type)).toEqual([
			undefined,
			undefined,
			'decide_for_me',
			undefined,
			'finish_look',
			'shopping_list'
		]);
		expect(script.turns[1].user.attachments.map((a) => a.purpose)).toEqual([
			'fullBody',
			'portrait',
			'hand'
		]);
	});

	it('ends with every piece of a realistic unit ledger and stage done', () => {
		const snaps = script.turns
			.flatMap((t) => t.events)
			.flatMap((e) => (e.event.type === 'session' ? [e.event.session] : []));
		const last = snaps.at(-1)!;
		expect(last.stage).toBe('done');
		expect(last.shoppingList?.items.length).toBeGreaterThan(0);
		expect(last.units.spent).toBe(last.units.ledger.reduce((n, l) => n + l.units, 0));
		expect(last.units.spent).toBe(45);
		const features = last.units.ledger.map((l) => l.feature).join('|');
		for (const f of [
			'look 1',
			'look 2',
			'look 3',
			'Facial colour',
			'Face attributes',
			'Shoes',
			'Makeup',
			'Hairstyle',
			'Earrings',
			'Necklace',
			'Watch'
		]) {
			expect(features).toContain(f);
		}
		expect(
			last.units.ledger.filter((l) => l.feature.startsWith('Clothes')).map((l) => l.units)
		).toEqual([2, 2, 2]);
		// Snapshots only ever add to the ledger.
		snaps.reduce((prev, s) => {
			expect(s.units.ledger.length).toBeGreaterThanOrEqual(prev);
			return s.units.ledger.length;
		}, 0);
	});
});

describe('demoInitialSession', () => {
	it('returns the greeting with suggestions and never an id, mode or units', async () => {
		const init = await createDemoPlayer({
			loadScript: async () => script,
			sleep: instant
		}).initialSession();
		expect(init).not.toBeNull();
		expect(init).not.toHaveProperty('id');
		expect(init).not.toHaveProperty('mode');
		expect(init).not.toHaveProperty('units');
		expect(init!.messages).toHaveLength(1);
		const greeting = init!.messages![0];
		expect(greeting.role).toBe('assistant');
		expect(greeting.id).not.toBe(script.initial.messages![0].id);
		expect(lastBlock(greeting)).toEqual({
			type: 'suggestions',
			options: expect.arrayContaining([script.turns[0].user.text])
		});
	});

	it('is null without a script, and an invalid script does not throw', async () => {
		expect(await createDemoPlayer({ loadScript: async () => null }).initialSession()).toBeNull();
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = createDemoPlayer({
			loadScript: async () => {
				throw new Error('bad');
			}
		});
		expect(await broken.initialSession()).toBeNull();
		err.mockRestore();
	});
});

describe('runDemoTurn', () => {
	it.each(script.turns.map((_, i) => i))(
		'plays turn %i based on the number of earlier user messages',
		async (n) => {
			const session = withHistory(makeSession(), n);
			const turn = script.turns[n];
			const { ctx, assistantMessage } = makeCtx(session, {
				text: turn.user.text,
				attachments: [],
				action: turn.user.action
			});
			await player().runTurn(ctx, {
				text: turn.user.text,
				attachments: [],
				action: turn.user.action
			});
			const expected = turn.events
				.filter((e) => e.event.type === 'block')
				.map((e) => (e.event.type === 'block' ? e.event.block.type : ''));
			expect(blockTypes(assistantMessage)).toEqual(expected);
			expect(lastBlock(assistantMessage)?.type).toBe('suggestions');
			const text = turn.events
				.map((e) => (e.event.type === 'text_delta' ? e.event.delta : ''))
				.join('');
			expect(assistantMessage.text).toBe(text);
		}
	);

	it('walks the whole story by tapping the first chip each time', async () => {
		const session = makeSession();
		session.messages.push(...structuredClone((await player().initialSession())!.messages!));
		const { id, mode, createdAt } = session;
		let chip = (session.messages[0].blocks[0] as Extract<Block, { type: 'suggestions' }>)
			.options[0];
		const allFrames: StreamEvent[] = [];
		for (let i = 0; i < script.turns.length; i++) {
			const input: TurnInput = { text: chip, attachments: [] };
			const { ctx, frames, assistantMessage } = makeCtx(session, input);
			await player().runTurn(ctx, input);
			allFrames.push(...frames);
			expect(assistantMessage.text).not.toContain(OFF_SCRIPT_NOTE.trim());
			const last = lastBlock(assistantMessage);
			expect(last?.type).toBe('suggestions');
			chip = (last as Extract<Block, { type: 'suggestions' }>).options[0];
		}
		expect(session.stage).toBe('done');
		expect(session.shoppingList).toBeDefined();
		expect(session.looks).toHaveLength(3);
		expect(session.chosenLookId).toBe(session.decision?.lookId);
		expect(session.lookbook?.accessories.length).toBe(4);
		expect(session.units.spent).toBe(45);
		expect(session.units.cap).toBe(60);
		expect(session.looks.find((l) => l.id === session.chosenLookId)?.version).toBe(2);
		expect({ id: session.id, mode: session.mode, createdAt: session.createdAt }).toEqual({
			id,
			mode,
			createdAt
		});
		expect(session.mode).toBe('demo');
		// 6 user + 6 assistant + greeting
		expect(session.messages).toHaveLength(13);
		// Activity ids are unique to this session; nothing from the script's message/done frames.
		const activities = allFrames.filter((f) => f.type === 'activity');
		expect(activities.length).toBeGreaterThan(10);
		for (const a of activities) expect(a.id.startsWith(`${session.id}:`)).toBe(true);
		expect(allFrames.some((f) => f.type === 'done')).toBe(false);
		// One more tap past the end.
		const input: TurnInput = { text: chip, attachments: [] };
		const { ctx, assistantMessage } = makeCtx(session, input);
		await player().runTurn(ctx, input);
		expect(assistantMessage.text).toBe(END_OF_DEMO_TEXT);
	});

	it('answers past the last turn with a short text and suggestions, no error', async () => {
		const session = withHistory(makeSession(), script.turns.length + 3);
		const input: TurnInput = { text: 'anything', attachments: [] };
		const { ctx, frames, assistantMessage } = makeCtx(session, input);
		await expect(player().runTurn(ctx, input)).resolves.toBeUndefined();
		expect(assistantMessage.text).toBe(END_OF_DEMO_TEXT);
		expect(assistantMessage.text).toContain('Start a live session');
		expect(assistantMessage.blocks.map((b) => b.type)).toEqual(['suggestions']);
		expect(frames.some((f) => f.type === 'error')).toBe(false);
	});

	it('matches an incoming action and jumps ahead when its button is pressed early', async () => {
		const session = withHistory(makeSession(), 3); // script is at the revision turn (3)
		const input: TurnInput = {
			text: 'Finish this look.',
			attachments: [],
			action: { type: 'finish_look', lookId: 'look-1' }
		};
		const { ctx, assistantMessage } = makeCtx(session, input);
		await player().runTurn(ctx, input);
		expect(blockTypes(assistantMessage)).toContain('face_profile');
		expect(assistantMessage.text).not.toContain(OFF_SCRIPT_NOTE.trim());
		expect(session.stage).toBe('finishing');
		// The next message continues after the finishing turn, not at the revision.
		const next: TurnInput = {
			text: 'Build my shopping list.',
			attachments: [],
			action: { type: 'shopping_list' }
		};
		const second = makeCtx(session, next);
		await player().runTurn(second.ctx, next);
		expect(blockTypes(second.assistantMessage)).toContain('shopping_list');
		expect(session.stage).toBe('done');
	});

	it('plays the scripted turn for the matching action even when the text differs', async () => {
		const session = withHistory(makeSession(), 2);
		const input: TurnInput = {
			text: 'Decide for me.',
			attachments: [],
			action: { type: 'decide_for_me' }
		};
		const { ctx, assistantMessage } = makeCtx(session, input);
		await player().runTurn(ctx, input);
		expect(blockTypes(assistantMessage)).toContain('decision');
		expect(session.decision).toBeDefined();
		expect(assistantMessage.text.startsWith(OFF_SCRIPT_NOTE)).toBe(false);
	});

	it('acknowledges off-script text and still plays the scripted turn', async () => {
		const session = makeSession();
		const input: TurnInput = { text: 'Is there parking?', attachments: [] };
		const { ctx, assistantMessage } = makeCtx(session, input);
		await player().runTurn(ctx, input);
		expect(assistantMessage.text.startsWith(OFF_SCRIPT_NOTE)).toBe(true);
		expect(session.event?.name).toBe(
			script.turns[0].events.flatMap((e) =>
				e.event.type === 'session' ? [e.event.session.event?.name] : []
			)[0]
		);
	});

	it('merges session snapshots without touching id, mode, createdAt or messages', async () => {
		const session = makeSession();
		const messagesRef = session.messages;
		const input: TurnInput = { text: script.turns[0].user.text, attachments: [] };
		const { ctx, frames } = makeCtx(session, input);
		await player().runTurn(ctx, input);
		expect(session.id).toMatch(/^00000000-/);
		expect(session.mode).toBe('demo');
		expect(session.createdAt).toBe('2026-01-01T00:00:00.000Z');
		expect(session.messages).toBe(messagesRef);
		expect(session.stage).toBe('photos');
		expect(session.event?.dressCodeNormalized).toBe('black_tie');
		expect(session.location?.city).toBe('Lagos');
		const snaps = frames.flatMap((f) => (f.type === 'session' ? [f.session] : []));
		expect(snaps.length).toBeGreaterThan(0);
		for (const s of snaps) expect(s.id).toBe(session.id);
	});

	it('re-emits the user message with the scripted photos when the user sent none', async () => {
		const session = withHistory(makeSession(), 1);
		const input: TurnInput = { text: script.turns[1].user.text, attachments: [] };
		const { ctx, frames } = makeCtx(session, input);
		const userId = ctx.userMessage.id;
		await player().runTurn(ctx, input);
		const echoed = frames.find((f) => f.type === 'message');
		expect(echoed).toBeDefined();
		if (echoed?.type !== 'message') throw new Error('unreachable');
		expect(echoed.message.id).toBe(userId);
		expect(echoed.message.attachments.map((a) => a.purpose)).toEqual([
			'fullBody',
			'portrait',
			'hand'
		]);
		expect(ctx.userMessage.attachments).toHaveLength(3);
		expect(session.messages.find((m) => m.id === userId)?.attachments).toHaveLength(3);
		expect(Object.keys(session.photos).sort()).toEqual(['fullBody', 'hand', 'portrait']);
		// Only that one message frame comes from the player.
		expect(frames.filter((f) => f.type === 'message')).toHaveLength(1);
	});

	it('leaves attachments the user sent alone and does not re-emit', async () => {
		const mine = structuredClone(script.turns[1].user.attachments.slice(0, 1));
		const session = withHistory(makeSession(), 1);
		const input: TurnInput = { text: 'Here I am', attachments: mine };
		const { ctx, frames } = makeCtx(session, input);
		await player().runTurn(ctx, input);
		expect(ctx.userMessage.attachments).toBe(mine);
		expect(frames.some((f) => f.type === 'message')).toBe(false);
	});

	it('honours event timing, caps waits at 4 s and applies the speed factor', async () => {
		const run = async (speed: number) => {
			waits.length = 0;
			const session = withHistory(makeSession(), 4); // finishing turn, long
			const input: TurnInput = { text: script.turns[4].user.text, attachments: [] };
			const { ctx } = makeCtx(session, input);
			await player({ speed }).runTurn(ctx, input);
			return [...waits];
		};
		const normal = await run(1);
		expect(Math.max(...normal)).toBeLessThanOrEqual(4000);
		expect(normal.reduce((a, b) => a + b, 0)).toBeCloseTo(turnDurationMs(script.turns[4]), 0);
		expect(normal.length).toBeGreaterThan(20);
		const fast = await run(4);
		expect(fast.reduce((a, b) => a + b, 0)).toBeCloseTo(normal.reduce((a, b) => a + b, 0) / 4, 0);
	});

	it('explains a missing script instead of failing', async () => {
		const session = makeSession();
		const input: TurnInput = { text: 'hi', attachments: [] };
		const { ctx, assistantMessage } = makeCtx(session, input);
		await createDemoPlayer({ loadScript: async () => null }).runTurn(ctx, input);
		expect(assistantMessage.text).toContain('demo:build');
	});
});

describe('mergeSnapshot', () => {
	it('clears fields the snapshot omits, keeps the cap and stamps only new ledger entries', () => {
		const session = makeSession();
		session.decision = { lookId: 'x', reason: '', ranking: [] };
		session.units = {
			spent: 2,
			cap: 30,
			ledger: [{ at: 'old', feature: 'a', units: 2, ok: true }]
		};
		session.messages.push({
			id: 'm',
			role: 'user',
			createdAt: '',
			text: 't',
			attachments: [],
			blocks: []
		});
		const snap = {
			...snapshot(makeSession()),
			id: 'other',
			mode: 'live' as const,
			createdAt: 'never',
			stage: 'looks' as const,
			units: {
				spent: 3,
				cap: 60,
				ledger: [
					{ at: 'script', feature: 'a', units: 2, ok: true },
					{ at: 'script', feature: 'b', units: 1, ok: true }
				]
			}
		};
		mergeSnapshot(session, snap);
		expect(session.stage).toBe('looks');
		expect(session.id).not.toBe('other');
		expect(session.mode).toBe('demo');
		expect(session.createdAt).toBe('2026-01-01T00:00:00.000Z');
		expect(session.messages.map((m) => m.id)).toEqual(['m']);
		expect(session.decision).toBeUndefined();
		expect(session.units.cap).toBe(30);
		expect(session.units.ledger[0].at).toBe('old');
		expect(session.units.ledger[1].at).not.toBe('script');
		expect(Number.isNaN(Date.parse(session.units.ledger[1].at))).toBe(false);
	});
});

describe('script file loading', () => {
	it('reads demo/script.json through the default player and reloads it when it changes', async () => {
		const tiny = (title: string): DemoScript => ({
			version: 1,
			title,
			initial: { stage: 'event', messages: [] },
			turns: [
				{
					user: { text: 'go', attachments: [] },
					events: [
						{ at: 0, event: { type: 'text_delta', messageId: '$a', delta: title } },
						{
							at: 0,
							event: {
								type: 'block',
								messageId: '$a',
								block: { type: 'suggestions', options: ['x'] }
							}
						}
					]
				}
			]
		});
		const file = join(testDirs.demoDir, 'script.json');
		expect(await demoInitialSession()).toBeNull();
		writeFileSync(file, JSON.stringify(tiny('one')));
		expect(await demoInitialSession()).not.toBeNull();
		const first = makeCtx(makeSession(), { text: 'go', attachments: [] });
		await runDemoTurn(first.ctx, { text: 'go', attachments: [] });
		expect(first.assistantMessage.text).toBe('one');
		// A rewrite with a different mtime is picked up without a restart.
		writeFileSync(file, JSON.stringify(tiny('two')));
		const { utimesSync } = await import('node:fs');
		utimesSync(file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
		const second = makeCtx(makeSession(), { text: 'go', attachments: [] });
		await runDemoTurn(second.ctx, { text: 'go', attachments: [] });
		expect(second.assistantMessage.text).toBe('two');
	});
});
