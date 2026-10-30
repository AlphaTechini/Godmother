// Live-session recorder: appends JSON lines to DATA_DIR/sessions/<id>/events.jsonl for the demo exporter.
// Never throws.

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Attachment, StreamEvent, UserAction } from '#lib/types';
import { sessionDir } from './paths';

export interface RecordedUserTurn {
	type: 'user';
	turn: number;
	input: { text: string; attachments: Attachment[]; action?: UserAction };
}

export interface RecordedEvent {
	type: 'event';
	turn: number;
	/** Milliseconds since the turn started. */
	t: number;
	event: StreamEvent;
}

export type RecordedLine = RecordedUserTurn | RecordedEvent;

const chains = new Map<string, Promise<void>>();

function append(sessionId: string, line: RecordedLine): void {
	try {
		const dir = sessionDir(sessionId);
		const data = JSON.stringify(line) + '\n';
		const key = sessionId.toLowerCase();
		const next = (chains.get(key) ?? Promise.resolve()).then(async () => {
			try {
				await mkdir(dir, { recursive: true });
				await appendFile(join(dir, 'events.jsonl'), data);
			} catch (err) {
				console.error('[recorder] write failed', err);
			}
		});
		chains.set(key, next);
		next.then(() => {
			if (chains.get(key) === next) chains.delete(key);
		});
	} catch (err) {
		console.error('[recorder] failed', err);
	}
}

export function recordEvent(
	sessionId: string,
	turnIndex: number,
	tMs: number,
	event: StreamEvent
): void {
	append(sessionId, { type: 'event', turn: turnIndex, t: Math.round(tMs), event });
}

export function recordUserTurn(
	sessionId: string,
	turnIndex: number,
	input: RecordedUserTurn['input']
): void {
	append(sessionId, { type: 'user', turn: turnIndex, input });
}

/** Resolves once everything recorded so far is on disk. */
export async function flushRecorder(sessionId: string): Promise<void> {
	await chains.get(sessionId.toLowerCase());
}
