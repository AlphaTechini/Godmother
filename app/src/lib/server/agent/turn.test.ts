import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () =>
	(await import('../store/test-config')).mockConfigModule()
);
vi.mock('#lib/server/youcam', async () => (await import('./test-helpers')).youcamMockModule());

import * as youcam from '#lib/server/youcam';
import { setModelClient } from '#lib/server/llm';
import { MAX_ROUNDS } from './loop';
import { runAgentTurn } from './index';
import {
	FakeModel,
	blocksOf,
	installYoucamDefaults,
	lastBlock,
	makeAsset,
	makeCtx,
	newSession,
	renderedLook,
	sessionWithPhotos
} from './test-helpers';
import type { StreamEvent } from '#lib/types';

const yc = youcam as unknown as ReturnType<typeof import('./test-helpers').youcamMockModule>;

function run(
	model: FakeModel,
	session = newSession(),
	text = 'hi',
	action?: Parameters<typeof runAgentTurn>[1]['action']
) {
	setModelClient(model);
	const made = makeCtx(session, text);
	return runAgentTurn(made.ctx, { text, attachments: [], action }).then(() => ({
		...made,
		session
	}));
}

const deltas = (events: StreamEvent[]) =>
	events.flatMap((e) => (e.type === 'text_delta' ? [e.delta] : []));
const inputOf = (model: FakeModel) => model.inputs[0];

const EVENT_ARGS = {
	name: 'Lagos Heritage Gala',
	date: 'Sat 14 Nov 2026, 7pm',
	venue: 'Eko Hotel',
	city: 'Lagos',
	dressCode: 'Black tie, African heritage welcome',
	dressCodeNormalized: 'black_tie',
	theme: null,
	colors: [{ name: 'gold', hex: '#d4af37' }],
	setting: 'Indoor ballroom, evening',
	notes: [],
	origin: 'web',
	sources: [{ title: 'Gala site', url: 'https://example.com/gala' }]
};

beforeEach(() => {
	installYoucamDefaults(yc);
});

describe('runAgentTurn', () => {
	it('streams a text-only answer into the assistant message', async () => {
		const model = new FakeModel([{ text: ['Tell me ', 'about the event.'] }]);
		const { events, assistantMessage } = await run(model);

		expect(deltas(events)).toEqual(['Tell me ', 'about the event.']);
		expect(assistantMessage.text).toBe('Tell me about the event.');
		expect(model.systems).toHaveLength(1);
		expect(model.systems[0]).toContain('CURRENT STATE');
		const names = model.tools.map((t) => t.name);
		expect(names).toEqual(
			expect.arrayContaining(['research_event', 'propose_looks', 'finish_look', 'suggest_replies'])
		);
		expect(names).toHaveLength(15);
	});

	it('runs a tool round trip: save_event_brief emits an event block, advances the stage and refreshes the state', async () => {
		const model = new FakeModel([
			{
				text: ['Saving it.'],
				calls: [{ name: 'save_event_brief', args: EVENT_ARGS }]
			},
			{ text: ['Done. Where are you based?'] }
		]);
		const { events, session, assistantMessage } = await run(model);

		const block = lastBlock(events, 'event');
		expect(block?.event.name).toBe('Lagos Heritage Gala');
		expect(block?.event.dressCodeNormalized).toBe('black_tie');
		expect(session.stage).toBe('photos');
		expect(session.event?.sources[0].url).toBe('https://example.com/gala');
		expect(events.some((e) => e.type === 'session')).toBe(true);

		// Round two follows the tool output.
		expect(model.systems).toHaveLength(2);
		const items = model.toolResults[0];
		expect(items).toHaveLength(1);
		expect(JSON.parse(items[0].output).ok).toBe(true);
		// The CURRENT STATE is rebuilt each round and now knows the event.
		expect(model.systems[1]).toContain('Lagos Heritage Gala');
		expect(model.systems[0]).not.toContain('Lagos Heritage Gala');
		expect(assistantMessage.text).toBe('Saving it.\n\nDone. Where are you based?');
		// Progress lines were emitted.
		expect(events.some((e) => e.type === 'activity' && e.status === 'running')).toBe(true);
		expect(events.some((e) => e.type === 'activity' && e.status === 'done')).toBe(true);
	});

	it('returns validation problems to the model instead of saving (web brief without sources)', async () => {
		const model = new FakeModel([
			{ calls: [{ name: 'save_event_brief', args: { ...EVENT_ARGS, sources: [] } }] },
			{ text: ['Let me check again.'] }
		]);
		const { session } = await run(model);
		expect(session.event).toBeUndefined();
		const out = JSON.parse(model.toolResults[0][0].output);
		expect(out.ok).toBe(false);
		expect(JSON.stringify(out.details.errors)).toContain('sources');
	});

	it('reports unknown tools and malformed arguments to the model', async () => {
		const model = new FakeModel([
			{
				calls: [
					{ name: 'teleport', args: {} },
					{ name: 'set_location', args: null, rawArguments: '{nope' }
				]
			},
			{ text: ['ok'] }
		]);
		await run(model);
		const items = model.toolResults[0];
		expect(items).toHaveLength(2);
		expect(items[0].output).toContain('Unknown tool');
		expect(items[1].output).toContain('not valid JSON');
	});

	it('ends the turn after quick replies when the message is already written', async () => {
		const model = new FakeModel([
			{
				text: ['Where are you based?'],
				calls: [{ name: 'suggest_replies', args: { options: ['Lagos', 'Abuja', 'Lagos', '  '] } }]
			}
		]);
		const { events } = await run(model);
		expect(model.systems).toHaveLength(1);
		expect(lastBlock(events, 'suggestions')?.options).toEqual(['Lagos', 'Abuja']);
	});

	it('sends the current attachments as vision input and older ones only as text lines', async () => {
		const session = newSession();
		const old = await makeAsset(session);
		const now = await makeAsset(session);
		session.messages.push(
			{
				id: 'u0',
				role: 'user',
				createdAt: '',
				text: 'my invitation',
				attachments: [{ asset: old, purpose: 'invitation' }],
				blocks: []
			},
			{
				id: 'a0',
				role: 'assistant',
				createdAt: '',
				text: 'Got it.',
				attachments: [],
				blocks: [{ type: 'event', event: {} as never }]
			}
		);
		const made = makeCtx(session, 'and this dress');
		made.userMessage.attachments = [{ asset: now, purpose: 'wardrobe' }];
		const model = new FakeModel([{ text: ['Nice.'] }]);
		setModelClient(model);
		await runAgentTurn(made.ctx, {
			text: 'and this dress',
			attachments: made.userMessage.attachments
		});

		const items = inputOf(model);
		expect(items[0]).toMatchObject({ role: 'user' });
		expect(String(items[0].content)).toContain(`[attachment asset=${old.id} purpose=invitation]`);
		expect(JSON.stringify(items[0])).not.toContain('"type":"image"');
		expect(items[1]).toMatchObject({ role: 'assistant' });
		expect(String(items[1].content)).toContain('[cards shown: event card]');
		const last = JSON.stringify(items[items.length - 1]);
		expect(last).toContain(`[attachment asset=${now.id} purpose=wardrobe]`);
		expect(last).toContain('"mediaType":"image/jpeg"');
	});

	it('handles choose_look without the model deciding anything', async () => {
		const session = await sessionWithPhotos();
		const look = renderedLook(session, 2, 'look_two');
		session.stage = 'looks';
		session.decision = { lookId: 'look_one', reason: 'r', ranking: [] };
		const model = new FakeModel([{ text: ['Lovely. Do you have a portrait?'] }]);
		const { events } = await run(model, session, '', { type: 'choose_look', lookId: look.id });

		expect(session.chosenLookId).toBe('look_two');
		expect(session.stage).toBe('chosen');
		expect(session.decision?.lookId).toBe('look_one');
		expect(events.some((e) => e.type === 'session')).toBe(true);
		const last = JSON.stringify(inputOf(model)[inputOf(model).length - 1]);
		expect(last).toContain('[ui action] The user chose look 2');
		expect(model.systems[0]).toContain('"chosenLookId":"look_two"');
	});

	it('tells the model to rank and call decide on decide_for_me', async () => {
		const session = await sessionWithPhotos();
		renderedLook(session, 1);
		const model = new FakeModel([{ text: ['Ok.'] }]);
		await run(model, session, '', { type: 'decide_for_me' });
		expect(JSON.stringify(inputOf(model))).toContain('calling decide now');
		expect(session.chosenLookId).toBeUndefined();
	});

	it('runs the shopping_list action directly, then lets the model add a line', async () => {
		const session = await sessionWithPhotos();
		const look = renderedLook(session, 1);
		look.pieces = [
			{
				id: 'pc1',
				role: 'full_body',
				name: 'Gown',
				source: {
					type: 'product',
					product: {
						title: 'Emerald gown',
						shop: 'Shop',
						url: 'https://shop.test/g',
						price: { amount: 100, currency: 'USD' },
						checkedAt: '2026-10-30T10:00:00.000Z'
					}
				}
			}
		];
		session.chosenLookId = look.id;
		session.location = { country: 'United States', currency: 'USD', source: 'typed' };
		const model = new FakeModel([{ text: ['That is the whole list.'] }]);
		const { events } = await run(model, session, '', { type: 'shopping_list' });
		expect(blocksOf(events, 'shopping_list')).toHaveLength(1);
		expect(session.shoppingList?.items).toHaveLength(1);
		expect(session.stage).toBe('done');
		expect(JSON.stringify(inputOf(model))).toContain('do not call build_shopping_list again');
		expect(model.systems).toHaveLength(1);
	});

	it('stops after the round cap and says so', async () => {
		const call = {
			name: 'set_location',
			args: { city: null, region: null, country: 'Nigeria', countryCode: 'NG', currency: 'NGN' }
		};
		const model = new FakeModel(Array.from({ length: MAX_ROUNDS + 3 }, () => ({ calls: [call] })));
		const { assistantMessage, session } = await run(model);
		expect(model.systems).toHaveLength(MAX_ROUNDS);
		expect(assistantMessage.text).toContain("I'm pausing here");
		expect(session.location?.currency).toBe('NGN');
	});

	it('normalizes tool arguments and returns the output to the model', async () => {
		const model = new FakeModel([
			{
				calls: [
					{
						name: 'set_location',
						args: {
							city: 'Lagos',
							region: null,
							country: 'Nigeria',
							countryCode: 'ng',
							currency: 'ngn'
						}
					}
				]
			},
			{ text: ['Noted.'] }
		]);
		const { session } = await run(model);
		expect(session.location).toMatchObject({ countryCode: 'NG', currency: 'NGN', city: 'Lagos' });
		expect(model.toolResults).toHaveLength(1);
		expect(JSON.parse(model.toolResults[0][0].output).ok).toBe(true);
	});

	it('turns a model failure into a friendly error without leaking details', async () => {
		const model = new FakeModel();
		model.conversation = () => ({
			next: async () => {
				throw Object.assign(new Error('401 Incorrect API key provided: sk-secret'), {
					status: 401
				});
			},
			submitToolResults: () => {}
		});
		setModelClient(model);
		const made = makeCtx(newSession());
		const err = await runAgentTurn(made.ctx, { text: 'hi', attachments: [] }).catch(
			(e: Error) => e
		);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).not.toContain('sk-secret');
	});
});
