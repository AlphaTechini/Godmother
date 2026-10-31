// A saved record of YouCam tasks for the turn in progress. After an interruption, repeating the same
// request finds its task or finished result instead of paying again. Entries become reusable only
// then, so asking for a fresh render in a normal turn still makes a new one.

import { createHash } from 'node:crypto';
import { saveSession } from '#lib/server/store';
import type { Session, TaskJournalEntry } from '#lib/types';
import { fileKeyFor } from './files';

/** Same request, same key, even if a restart meant uploading the same photo under a new file id. */
export function journalKey(path: string, body: Record<string, unknown>): string {
	const stable = JSON.stringify(body, (_key, value: unknown) =>
		typeof value === 'string' ? (fileKeyFor(value) ?? value) : value
	);
	return createHash('sha256').update(path).update(stable).digest('hex').slice(0, 32);
}

export function resumableEntry(session: Session, key: string): TaskJournalEntry | undefined {
	const entry = session.taskJournal?.[key];
	return entry?.resumable ? entry : undefined;
}

export function recordEntry(session: Session, key: string, entry: TaskJournalEntry): void {
	session.taskJournal = { ...session.taskJournal, [key]: entry };
}

export function updateEntry(session: Session, key: string, patch: Partial<TaskJournalEntry>): void {
	const entry = session.taskJournal?.[key];
	if (entry) Object.assign(entry, patch);
}

export function forgetEntry(session: Session, key: string): void {
	if (session.taskJournal) delete session.taskJournal[key];
}

export function markJournalResumable(session: Session): void {
	for (const entry of Object.values(session.taskJournal ?? {})) entry.resumable = true;
}

export function clearJournal(session: Session): void {
	delete session.taskJournal;
}

/** Saved straight away: this record is what survives a crash. */
export async function saveJournal(session: Session): Promise<void> {
	await saveSession(session).catch((err) =>
		console.error('[youcam] could not save the task record', err)
	);
}
