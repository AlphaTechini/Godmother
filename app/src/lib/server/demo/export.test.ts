import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportDemo, parseRecording, rewriteAssets } from '../../../../scripts/export-demo';
import { checkSuggestionChain, parseDemoScript } from './script';
import type { Asset, Attachment, StreamEvent } from '#lib/types';

const SESSION = '11111111-2222-4333-8444-555555555555';
const PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOOK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GONE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
// 1x1 PNG
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

const asset = (id: string, kind: Asset['kind'] = 'result'): Asset => ({
	id,
	url: `/api/assets/${id}`,
	kind,
	mime: 'image/png'
});

function setup() {
	const dataDir = mkdtempSync(join(tmpdir(), 'godmother-export-data-'));
	const demoDir = mkdtempSync(join(tmpdir(), 'godmother-export-demo-'));
	mkdirSync(join(dataDir, 'assets'), { recursive: true });
	mkdirSync(join(dataDir, 'sessions', SESSION), { recursive: true });
	for (const id of [PHOTO, LOOK]) writeFileSync(join(dataDir, 'assets', `${id}.png`), PNG);
	return { dataDir, demoDir };
}

const photo: Attachment = { asset: asset(PHOTO, 'upload'), purpose: 'fullBody' };
const lines = (...l: object[]) => l.map((x) => JSON.stringify(x)).join('\n') + '\n';
const ev = (turn: number, t: number, event: StreamEvent) => ({ type: 'event', turn, t, event });
const msg = (id: string, role: 'user' | 'assistant') => ({
	id,
	role,
	createdAt: '',
	text: '',
	attachments: [],
	blocks: []
});

const recording = lines(
	{ type: 'user', turn: 0, input: { text: 'Gala on Saturday', attachments: [] } },
	ev(0, 1, { type: 'message', message: msg('u', 'user') }),
	ev(0, 2, { type: 'message', message: msg('a', 'assistant') }),
	ev(0, 400, { type: 'text_delta', messageId: 'a', delta: 'Found it.' }),
	ev(0, 900, {
		type: 'block',
		messageId: 'a',
		block: { type: 'photo_request', slots: ['fullBody'], reason: 'r' }
	}),
	ev(0, 950, { type: 'done' }),
	{ type: 'user', turn: 1, input: { text: 'Here I am', attachments: [photo] } },
	ev(1, 1, { type: 'message', message: msg('u2', 'user') }),
	ev(1, 100, { type: 'activity', id: 'tryon', label: 'Trying on', status: 'running' }),
	ev(1, 30000, { type: 'activity', id: 'tryon', label: 'Trying on', status: 'done' }),
	ev(1, 30010, {
		type: 'session',
		session: {
			id: SESSION,
			createdAt: '',
			mode: 'live',
			stage: 'looks',
			photos: { fullBody: asset(PHOTO, 'upload') },
			wardrobe: [],
			looks: [
				{
					id: 'l1',
					index: 1,
					title: 'T',
					summary: '',
					rationale: '',
					palette: [],
					pieces: [],
					render: {
						status: 'done',
						image: asset(LOOK),
						steps: [{ label: 'Gown', status: 'done', image: asset(GONE) }]
					},
					version: 1
				}
			],
			units: {
				spent: 2,
				cap: 60,
				ledger: [{ at: '', feature: 'Clothes try-on', units: 2, ok: true }]
			}
		}
	}),
	ev(1, 30020, {
		type: 'block',
		messageId: 'a2',
		block: { type: 'suggestions', options: ['Something else'] }
	}),
	ev(1, 30030, { type: 'block', messageId: 'a2', block: { type: 'looks', lookIds: ['l1'] } }),
	ev(1, 30040, { type: 'block', messageId: 'a2', block: { type: 'error', message: 'boom' } }),
	ev(1, 30050, { type: 'error', message: 'boom' }),
	ev(1, 30060, { type: 'done' })
);

describe('rewriteAssets', () => {
	it('rewrites asset ids and urls everywhere and collects them', () => {
		const found = new Set<string>();
		const out = rewriteAssets(
			{
				a: asset(PHOTO),
				list: [{ nested: asset(LOOK.toUpperCase().toLowerCase()) }],
				text: `see /api/assets/${GONE}.`,
				other: { id: 'look-1', url: '/demo/x.svg' }
			},
			found
		);
		expect(out.a.id).toBe(`demo-${PHOTO}`);
		expect(out.a.url).toBe(`/api/assets/demo-${PHOTO}`);
		expect(out.list[0].nested.id).toBe(`demo-${LOOK}`);
		expect(out.text).toBe(`see /api/assets/demo-${GONE}.`);
		expect(out.other).toEqual({ id: 'look-1', url: '/demo/x.svg' });
		expect([...found].sort()).toEqual([PHOTO, LOOK, GONE].sort());
	});
});

describe('exportDemo', () => {
	it('rebuilds turns, copies assets, rewrites ids and makes the chips chain', async () => {
		const { dataDir, demoDir } = setup();
		writeFileSync(join(dataDir, 'sessions', SESSION, 'events.jsonl'), recording + 'not json\n');
		writeFileSync(
			join(dataDir, 'sessions', SESSION, 'session.json'),
			JSON.stringify({ event: { name: 'Gala' } })
		);
		const summary = await exportDemo({ sessionId: SESSION, dataDir, demoDir });

		expect(summary.turns).toBe(2);
		expect(summary.malformedLines).toBe(1);
		expect(summary.dropped).toEqual({ message: 3, done: 2, error: 1, errorBlocks: 1 });
		expect(summary.title).toBe('Gala (recorded demo)');
		expect(summary.assetsCopied).toBe(2);
		expect(summary.assetsMissing).toEqual([GONE]);
		expect(summary.unitsSpent).toBe(2);
		expect(summary.suggestionsFixed).toBe(2);
		expect(summary.warnings.join('\n')).toContain('1 referenced asset');

		const script = parseDemoScript(JSON.parse(readFileSync(join(demoDir, 'script.json'), 'utf8')));
		expect(checkSuggestionChain(script)).toEqual([]);
		expect(script.turns[1].user.attachments[0].asset).toMatchObject({
			id: `demo-${PHOTO}`,
			url: `/api/assets/demo-${PHOTO}`
		});
		for (const turn of script.turns) {
			for (const { event } of turn.events) {
				expect(['message', 'done', 'error']).not.toContain(event.type);
				if (event.type === 'block') expect(event.block.type).not.toBe('error');
			}
		}
		// Offsets are kept, and the recorded chips survive behind the chaining one.
		expect(script.turns[1].events[0].at).toBe(100);
		expect(script.turns[1].events[1].at).toBe(30000);
		const final = script.turns[1].events.at(-1)!.event;
		expect(final).toMatchObject({
			block: { type: 'suggestions', options: ['Thank you, Godmother', 'Something else'] }
		});
		expect(script.turns[0].events.at(-1)!.event).toMatchObject({
			block: { type: 'suggestions', options: ['Here I am'] }
		});
		expect(JSON.stringify(script)).not.toContain(`"/api/assets/${PHOTO}"`);
		// Greeting leads into turn 0.
		expect(script.initial.messages?.[0].blocks[0]).toEqual({
			type: 'suggestions',
			options: ['Gala on Saturday']
		});
		expect(existsSync(join(demoDir, 'assets', `${PHOTO}.png`))).toBe(true);
		expect(existsSync(join(demoDir, 'assets', `${LOOK}.png`))).toBe(true);
	});

	it('fails clearly for a bad id, a missing recording and an empty one', async () => {
		const { dataDir, demoDir } = setup();
		await expect(exportDemo({ sessionId: 'nope', dataDir, demoDir })).rejects.toThrow(/uuid/);
		await expect(exportDemo({ sessionId: SESSION, dataDir, demoDir })).rejects.toThrow(
			/No recording/
		);
		writeFileSync(join(dataDir, 'sessions', SESSION, 'events.jsonl'), '\n');
		await expect(exportDemo({ sessionId: SESSION, dataDir, demoDir })).rejects.toThrow(
			/no user turns/
		);
		expect(parseRecording('{"type":"x"}\n').malformed).toBe(1);
	});
});
