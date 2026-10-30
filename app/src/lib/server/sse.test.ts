import { describe, expect, it, vi } from 'vitest';
import { createEventStream } from './sse';
import type { StreamEvent } from '#lib/types';

async function readAll(res: Response): Promise<string> {
	return await res.text();
}
const frames = (s: string) =>
	s
		.split('\n\n')
		.filter(Boolean)
		.map((f) => JSON.parse(f.replace(/^data: /, '')) as StreamEvent);

describe('createEventStream', () => {
	it('sets SSE headers and frames events, ending with done', async () => {
		const res = createEventStream(async (emit) => {
			emit({ type: 'text_delta', messageId: 'm', delta: 'hi' });
			emit({ type: 'activity', id: 'a', label: 'x', status: 'running' });
		});
		expect(res.headers.get('content-type')).toBe('text/event-stream');
		expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
		expect(res.headers.get('x-accel-buffering')).toBe('no');
		const text = await readAll(res);
		expect(text).toBe(
			'data: {"type":"text_delta","messageId":"m","delta":"hi"}\n\n' +
				'data: {"type":"activity","id":"a","label":"x","status":"running"}\n\n' +
				'data: {"type":"done"}\n\n'
		);
	});

	it('emits error then done when run throws', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = createEventStream(async () => {
			throw new Error('kaput');
		});
		expect(frames(await readAll(res))).toEqual([
			{ type: 'error', message: 'kaput' },
			{ type: 'done' }
		]);
		spy.mockRestore();
	});

	it('sends heartbeat comments while running', async () => {
		vi.useFakeTimers();
		try {
			let release!: () => void;
			const gate = new Promise<void>((r) => (release = r));
			const res = createEventStream(async () => {
				await gate;
			});
			const reader = res.body!.getReader();
			await vi.advanceTimersByTimeAsync(15_000);
			const first = await reader.read();
			expect(new TextDecoder().decode(first.value)).toBe(': ping\n\n');
			release();
			await vi.advanceTimersByTimeAsync(0);
			const second = await reader.read();
			expect(new TextDecoder().decode(second.value)).toBe('data: {"type":"done"}\n\n');
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps running to completion after the client disconnects', async () => {
		let finished = false;
		let late = 0;
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const res = createEventStream(async (emit) => {
			emit({ type: 'text_delta', messageId: 'm', delta: '1' });
			await gate;
			emit({ type: 'text_delta', messageId: 'm', delta: '2' }); // must not throw
			late++;
			finished = true;
		});
		const reader = res.body!.getReader();
		await reader.read();
		await reader.cancel(); // client gone
		expect(finished).toBe(false);
		release();
		await vi.waitFor(() => expect(finished).toBe(true));
		expect(late).toBe(1);
	});
});
