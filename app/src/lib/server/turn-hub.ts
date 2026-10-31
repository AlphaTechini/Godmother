// Turns in progress. A turn runs apart from any one request, so a dropped connection or a reloaded
// page can attach again and follow it. In memory: a restart ends the turn (see turn-recovery.ts).

import type { Id, StreamEvent, TurnActivity } from '#lib/types';

type Listener = (e: StreamEvent) => void;

export interface LiveTurn {
	turnId: Id;
	sessionId: Id;
	listeners: Set<Listener>;
	/** Latest state of each activity, for whoever attaches later. */
	activities: Map<Id, TurnActivity>;
	done: Promise<void>;
}

const live = new Map<Id, LiveTurn>();

export function liveTurn(turnId: Id): LiveTurn | undefined {
	return live.get(turnId);
}

/** The newest live turn of a session. */
export function liveTurnFor(sessionId: Id): LiveTurn | undefined {
	let found: LiveTurn | undefined;
	for (const turn of live.values()) if (turn.sessionId === sessionId) found = turn;
	return found;
}

export function beginTurn(
	sessionId: Id,
	turnId: Id,
	work: (emit: Listener) => Promise<void>
): LiveTurn {
	const listeners = new Set<Listener>();
	const activities = new Map<Id, TurnActivity>();
	const emit: Listener = (e) => {
		if (e.type === 'activity') {
			const { type: _type, ...activity } = e;
			activities.set(e.id, activity);
		}
		for (const listen of listeners) listen(e);
	};
	const turn: LiveTurn = {
		turnId,
		sessionId,
		listeners,
		activities,
		done: Promise.resolve()
			.then(() => work(emit))
			.catch((err: unknown) => {
				console.error('[turn] run failed', err);
				emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
			})
			.finally(() => {
				live.delete(turnId);
			})
	};
	live.set(turnId, turn);
	return turn;
}
