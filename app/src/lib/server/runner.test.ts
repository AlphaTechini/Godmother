import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () => (await import('./store/test-config')).mockConfigModule());
const agent = vi.hoisted(() => ({ runAgentTurn: vi.fn() }));
const demo = vi.hoisted(() => ({ runDemoTurn: vi.fn(), demoInitialSession: vi.fn() }));
vi.mock('#lib/server/agent', () => agent);
vi.mock('#lib/server/demo', () => demo);

import { executeTurn } from './runner';
import { createSession, getSession, saveAsset } from '#lib/server/store';
import { config } from '#lib/server/config';
import type { StreamEvent } from '#lib/types';

const PNG = Uint8Array.from(
	Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
		'base64'
	)
);

async function frames(res: Response): Promise<StreamEvent[]> {
	return (await res.text())
		.split('\n\n')
		.filter((f) => f.startsWith('data: '))
		.map((f) => JSON.parse(f.slice(6)));
}

describe('executeTurn validation', () => {
	const sid = () => createSession('live').id;

	it.each([
		['non-object body', 'nope'],
		['text not a string', { text: 5 }],
		['text too long', { text: 'x'.repeat(4001) }],
		[
			'too many attachments',
			{ text: 'a', attachments: Array(9).fill({ assetId: 'x', purpose: 'other' }) }
		],
		['bad purpose', { text: 'a', attachments: [{ assetId: 'x', purpose: 'selfie' }] }],
		['bad action', { text: 'a', action: { type: 'nuke' } }],
		['choose_look without lookId', { action: { type: 'choose_look' } }],
		['empty turn', { text: '  ' }]
	])('400 for %s', async (_name, body) => {
		const res = await executeTurn(sid(), body);
		expect(res.status).toBe(400);
		expect(res.headers.get('content-type')).toContain('application/json');
		expect((await res.json()).error).toBeTypeOf('string');
	});

	it('400 for an unknown asset, 404 for an unknown session', async () => {
		const res = await executeTurn(sid(), {
			text: 'hi',
			attachments: [{ assetId: '00000000-0000-4000-8000-000000000000', purpose: 'other' }]
		});
		expect(res.status).toBe(400);
		expect((await executeTurn('00000000-0000-4000-8000-000000000000', { text: 'hi' })).status).toBe(
			404
		);
	});

	it('400 for an asset uploaded to another session', async () => {
		const other = await saveAsset({
			bytes: PNG,
			mime: 'image/png',
			kind: 'upload',
			sessionId: sid()
		});
		const res = await executeTurn(sid(), {
			text: 'hi',
			attachments: [{ assetId: other.id, purpose: 'other' }]
		});
		expect(res.status).toBe(400);
	});
});

describe('executeTurn streaming', () => {
	it('explains missing keys for live sessions without calling the agent', async () => {
		expect(config.live.llm).toBe(false);
		agent.runAgentTurn.mockClear();
		const s = createSession('live');
		const evs = await frames(await executeTurn(s.id, { text: 'hello' }));
		expect(agent.runAgentTurn).not.toHaveBeenCalled();
		expect(evs.map((e) => e.type)).toEqual(['message', 'message', 'text_delta', 'session', 'done']);
		const text = evs.find((e) => e.type === 'text_delta');
		expect(text && 'delta' in text && text.delta).toMatch(/demo/i);
	});

	it('runs the demo runner for demo sessions, wires attachments and photos, and persists', async () => {
		const asset = await saveAsset({ bytes: PNG, mime: 'image/png', kind: 'upload' });
		demo.runDemoTurn.mockImplementationOnce(async (ctx, input) => {
			ctx.activity('a', 'Working', 'running');
			ctx.text('Hello ');
			ctx.text('there');
			ctx.block({ type: 'suggestions', options: ['ok'] });
			ctx.session.stage = 'photos';
			await ctx.sessionChanged();
			expect(input.attachments[0].asset.id).toBe(asset.id);
		});
		const s = createSession('demo');
		const evs = await frames(
			await executeTurn(s.id, {
				text: 'hi',
				attachments: [{ assetId: asset.id, purpose: 'fullBody' }]
			})
		);
		expect(evs.map((e) => e.type)).toEqual([
			'message',
			'message',
			'activity',
			'text_delta',
			'text_delta',
			'block',
			'session',
			'session',
			'done'
		]);
		const [userMsg, asstMsg] = evs.slice(0, 2).map((e) => (e as { message: any }).message);
		expect(userMsg).toMatchObject({ role: 'user', text: 'hi' });
		expect(userMsg.attachments[0]).toMatchObject({ purpose: 'fullBody', asset: { id: asset.id } });
		expect(asstMsg).toMatchObject({ role: 'assistant', text: '', blocks: [] });

		const saved = (await getSession(s.id))!;
		expect(saved.photos.fullBody?.id).toBe(asset.id);
		expect(saved.stage).toBe('photos');
		expect(saved.messages).toHaveLength(2);
		expect(saved.messages[1]).toMatchObject({
			text: 'Hello there',
			blocks: [{ type: 'suggestions' }]
		});
		const last = evs.at(-2) as { session: Record<string, unknown> };
		expect(last.session).not.toHaveProperty('messages');
	});

	it('turns a throwing runner into an error block + error frame', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		demo.runDemoTurn.mockImplementationOnce(async () => {
			throw new Error('agent exploded');
		});
		const s = createSession('demo');
		const evs = await frames(await executeTurn(s.id, { text: 'hi' }));
		expect(evs.map((e) => e.type)).toEqual([
			'message',
			'message',
			'block',
			'error',
			'session',
			'done'
		]);
		expect((await getSession(s.id))!.messages[1].blocks).toEqual([
			{ type: 'error', message: 'agent exploded' }
		]);
		spy.mockRestore();
	});

	it('serialises two turns on the same session', async () => {
		const order: string[] = [];
		demo.runDemoTurn.mockImplementation(async (ctx: any, input: any) => {
			order.push(`start:${input.text}`);
			await new Promise((r) => setTimeout(r, 20));
			ctx.text(input.text);
			order.push(`end:${input.text}`);
		});
		const s = createSession('demo');
		const [r1, r2] = await Promise.all([
			executeTurn(s.id, { text: 'one' }),
			executeTurn(s.id, { text: 'two' })
		]);
		await Promise.all([frames(r1), frames(r2)]);
		demo.runDemoTurn.mockReset();
		expect(order).toEqual(['start:one', 'end:one', 'start:two', 'end:two']);
		expect((await getSession(s.id))!.messages.map((m) => m.text)).toEqual([
			'one',
			'one',
			'two',
			'two'
		]);
	});
});
