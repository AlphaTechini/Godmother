// Runs one billable task end to end: create, poll, ledger. The caller owns the reservation (see
// features.ts) and downloads the result afterwards. After an interruption the same request picks up
// its saved task instead of paying again (see task-journal.ts).

import type { Session } from '#lib/types';
import { createTask, extractResultUrl, pollTask } from './client';
import { toTaskError, YouCamTaskError } from './errors';
import { type LedgerFeature, type Reservation } from './ledger';
import {
	forgetEntry,
	journalKey,
	recordEntry,
	resumableEntry,
	saveJournal,
	updateEntry
} from './task-journal';
import { tuning } from './tuning';

export interface RunTaskSpec {
	session: Session;
	reservation: Reservation;
	feature: LedgerFeature;
	/** Units this task costs; settled from the reservation. */
	units: number;
	/** Create path, e.g. /s2s/v2.0/task/cloth-v4. The poll path is this + "/<task_id>". */
	path: string;
	body: Record<string, unknown>;
}

export interface TaskOutcome {
	taskId: string;
	/** `data.results` of the success response. */
	results: any;
	/** Result image URL when the task produces one. */
	url?: string;
	seconds: number;
	/** The saved-record key, for attaching the stored result. */
	key: string;
	/** Finished and paid for before an interruption: nothing was spent this time. */
	replayed: boolean;
}

const round1 = (ms: number) => Math.round(ms / 100) / 10;

export async function runTask(spec: RunTaskSpec): Promise<TaskOutcome> {
	const { session, reservation, feature, units } = spec;
	const started = Date.now();
	const key = journalKey(spec.path, spec.body);
	const prior = resumableEntry(session, key);

	if (prior?.results !== undefined) {
		reservation.settle(0, { feature, ok: true, units: 0, taskId: prior.taskId, seconds: 0 });
		return {
			taskId: prior.taskId,
			results: prior.results,
			url: extractResultUrl(prior.results),
			seconds: 0,
			key,
			replayed: true
		};
	}

	let taskId: string | undefined = prior?.taskId;
	try {
		let results: unknown;
		if (prior) {
			// Started before the interruption. If YouCam has lost it or it failed, start again below.
			// One still running at our timeout may yet charge, so starting another could pay twice.
			try {
				({ results } = await pollTask(spec.path, prior.taskId, feature, started));
			} catch (err) {
				if (toTaskError(err, feature, prior.taskId).code === 'timeout') throw err;
				console.warn(`[youcam] could not pick up task ${prior.taskId}`, err);
				forgetEntry(session, key);
				taskId = undefined;
			}
		}
		if (taskId === undefined) {
			({ taskId } = await createTask(spec.path, spec.body, feature));
			recordEntry(session, key, { taskId, feature });
			await saveJournal(session);
			({ results } = await pollTask(spec.path, taskId, feature, started));
		}
		const seconds = round1(Date.now() - started);
		reservation.settle(units, { feature, ok: true, units, taskId: taskId as string, seconds });
		updateEntry(session, key, { results });
		await saveJournal(session);
		return {
			taskId: taskId as string,
			results,
			url: extractResultUrl(results),
			seconds,
			key,
			replayed: false
		};
	} catch (err) {
		forgetEntry(session, key);
		const error = toTaskError(err, feature, taskId);
		// A task still running at our timeout will be charged if it succeeds: count it (tuning).
		const maybeCharged = error.code === 'timeout' && tuning.chargeOnTimeout;
		reservation.settle(units, {
			feature,
			ok: false,
			units: maybeCharged ? units : 0,
			taskId,
			seconds: round1(Date.now() - started)
		});
		throw error instanceof YouCamTaskError ? error : toTaskError(error, feature, taskId);
	}
}
