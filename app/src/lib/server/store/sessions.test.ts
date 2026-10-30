import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/config', async () => (await import('./test-config')).mockConfigModule());

import { testDirs } from './test-config';
import {
	clearSessionCache,
	createSession,
	getSession,
	saveSession,
	withSessionLock
} from './sessions';
import { sessionDir } from './paths';

beforeEach(() => clearSessionCache());

describe('sessions', () => {
	it('creates a fresh session with defaults', () => {
		const s = createSession('live');
		expect(s).toMatchObject({
			mode: 'live',
			stage: 'event',
			photos: {},
			wardrobe: [],
			looks: [],
			messages: [],
			units: { spent: 0, cap: 60, ledger: [] }
		});
		expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('merges init but never lets it set id or mode', () => {
		const s = createSession('demo', { id: 'evil', mode: 'live', stage: 'looks' });
		expect(s.id).not.toBe('evil');
		expect(s.mode).toBe('demo');
		expect(s.stage).toBe('looks');
	});

	it('round-trips through disk', async () => {
		const s = createSession('live');
		s.stage = 'photos';
		s.messages.push({
			id: 'm1',
			role: 'user',
			createdAt: new Date().toISOString(),
			text: 'hi',
			attachments: [],
			blocks: []
		});
		await saveSession(s);
		clearSessionCache();
		const loaded = await getSession(s.id);
		expect(loaded).toEqual(s);
		expect(loaded).not.toBe(s);
		// cached on second read
		expect(await getSession(s.id)).toBe(loaded);
	});

	it('writes atomically (no tmp files left behind)', async () => {
		const s = createSession('live');
		await Promise.all([saveSession(s), saveSession(s), saveSession(s)]);
		expect((await readdir(sessionDir(s.id))).sort()).toEqual(['session.json']);
		expect(JSON.parse(await readFile(join(sessionDir(s.id), 'session.json'), 'utf8')).id).toBe(
			s.id
		);
	});

	it('returns null for unknown or malformed ids', async () => {
		expect(await getSession('00000000-0000-4000-8000-000000000000')).toBeNull();
		expect(await getSession('../../etc/passwd')).toBeNull();
		expect(await getSession('')).toBeNull();
	});

	it('rejects path traversal ids', async () => {
		expect(() => sessionDir('../x')).toThrow();
		const s = createSession('live');
		await expect(saveSession({ ...s, id: '../escape' })).rejects.toThrow(/Invalid session id/);
		expect(testDirs.dataDir).toBeTruthy();
	});

	it('serialises work per session but not across sessions', async () => {
		const order: string[] = [];
		const slow = (tag: string, ms: number) => async () => {
			order.push(`${tag}:start`);
			await new Promise((r) => setTimeout(r, ms));
			order.push(`${tag}:end`);
			return tag;
		};
		const [a, b, c] = await Promise.all([
			withSessionLock('s1', slow('a', 30)),
			withSessionLock('s1', slow('b', 1)),
			withSessionLock('s2', slow('c', 1))
		]);
		expect([a, b, c]).toEqual(['a', 'b', 'c']);
		expect(order.indexOf('a:end')).toBeLessThan(order.indexOf('b:start'));
		expect(order.indexOf('c:start')).toBeLessThan(order.indexOf('a:end'));
	});

	it('keeps the queue alive after a failing task', async () => {
		const failing = withSessionLock('s3', async () => {
			throw new Error('boom');
		});
		const next = withSessionLock('s3', async () => 'ok');
		await expect(failing).rejects.toThrow('boom');
		await expect(next).resolves.toBe('ok');
	});
});
