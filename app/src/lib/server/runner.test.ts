import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () => (await import('./store/test-config')).mockConfigModule());
const agent = vi.hoisted(() => ({ runAgentTurn: vi.fn() }));
vi.mock('#lib/server/agent', () => agent);

import { executeTurn } from './runner';
import { createSession, saveAsset } from '#lib/server/store';
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
		expect(text && 'delta' in text && text.delta).toMatch(/ANTHROPIC_API_KEY/);
	});
});
