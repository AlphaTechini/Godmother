import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () => (await import('./test-config')).mockConfigModule());

import { flushRecorder, recordEvent, recordUserTurn } from './recorder';
import { sessionDir } from './paths';

const ID = '11111111-1111-4111-8111-111111111111';

describe('recorder', () => {
	it('appends ordered JSON lines', async () => {
		recordUserTurn(ID, 0, { text: 'hi', attachments: [] });
		recordEvent(ID, 0, 12.4, { type: 'text_delta', messageId: 'm', delta: 'a' });
		recordEvent(ID, 0, 30, { type: 'error', message: 'x' });
		await flushRecorder(ID);
		const lines = (await readFile(join(sessionDir(ID), 'events.jsonl'), 'utf8'))
			.trim()
			.split('\n')
			.map((l) => JSON.parse(l));
		expect(lines).toEqual([
			{ type: 'user', turn: 0, input: { text: 'hi', attachments: [] } },
			{ type: 'event', turn: 0, t: 12, event: { type: 'text_delta', messageId: 'm', delta: 'a' } },
			{ type: 'event', turn: 0, t: 30, event: { type: 'error', message: 'x' } }
		]);
	});

	it('never throws on a bad session id', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => recordEvent('../bad', 0, 0, { type: 'done' })).not.toThrow();
		await flushRecorder('../bad');
		err.mockRestore();
	});
});
