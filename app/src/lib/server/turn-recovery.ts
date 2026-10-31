// What happens to a turn that stopped before it finished: the record says so, nothing stays stuck
// on "rendering", and paid-for YouCam work is kept so that continuing doesn't pay for it again.

import { markJournalResumable } from '#lib/server/youcam/task-journal';
import { saveSession } from '#lib/server/store';
import type { RenderStep, Session } from '#lib/types';
import { liveTurnFor } from './turn-hub';

const INTERRUPTED = 'Interrupted before it finished.';

function clearStep(step: RenderStep): void {
	if (step.status === 'pending' || step.status === 'rendering') {
		step.status = 'failed';
		step.error = INTERRUPTED;
	}
}

/** Marks the turn interrupted and clears anything left in progress. */
export function markInterrupted(session: Session): void {
	if (session.turn) session.turn.status = 'interrupted';
	markJournalResumable(session);
	for (const look of session.looks) {
		look.render.steps.forEach(clearStep);
		if (look.render.status === 'pending' || look.render.status === 'rendering') {
			look.render.status = 'failed';
			look.render.error = INTERRUPTED;
		}
	}
	session.lookbook?.steps.forEach(clearStep);
}

/** A turn recorded as running with nothing running it was lost to a restart. */
export async function reconcileTurn(session: Session): Promise<void> {
	if (session.turn?.status !== 'running' || liveTurnFor(session.id)) return;
	markInterrupted(session);
	await saveSession(session).catch((err) =>
		console.error('[turn] could not save the interrupted state', err)
	);
}
