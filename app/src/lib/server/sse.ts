// Server-sent events plumbing for one turn.

import type { StreamEvent } from '#lib/types';

const HEARTBEAT_MS = 15_000;

/**
 * Streams the events `run` emits. If the client disconnects, `run` keeps going to completion
 * (YouCam tasks are charged whether or not anyone is listening, and results must be saved);
 * emit simply becomes a no-op. The stream always ends with `{type:'done'}`.
 */
export function createEventStream(
	run: (emit: (e: StreamEvent) => void) => Promise<void>
): Response {
	const encoder = new TextEncoder();
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	let closed = false;
	let heartbeat: ReturnType<typeof setInterval> | undefined;

	const write = (chunk: string) => {
		if (closed) return;
		try {
			controller.enqueue(encoder.encode(chunk));
		} catch {
			closed = true;
		}
	};
	const emit = (e: StreamEvent) => write(`data: ${JSON.stringify(e)}\n\n`);

	const stream = new ReadableStream<Uint8Array>({
		start(c) {
			controller = c;
			heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
			heartbeat.unref?.();
			void (async () => {
				try {
					await run(emit);
				} catch (err) {
					console.error('[sse] run failed', err);
					emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
				} finally {
					clearInterval(heartbeat);
					emit({ type: 'done' });
					if (!closed) {
						closed = true;
						try {
							controller.close();
						} catch {
							/* already closed */
						}
					}
				}
			})();
		},
		cancel() {
			// Client went away: stop writing, but let `run` finish.
			closed = true;
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			'x-accel-buffering': 'no'
		}
	});
}
