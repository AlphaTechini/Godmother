// Runs one billable task end to end: create (never retried), poll, ledger. The caller owns the
// reservation (see features.ts) and downloads the result afterwards.

import { createTask, extractResultUrl, pollTask } from './client';
import { toTaskError, YouCamTaskError } from './errors';
import { type LedgerFeature, type Reservation } from './ledger';
import { tuning } from './tuning';

export interface RunTaskSpec {
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
}

const round1 = (ms: number) => Math.round(ms / 100) / 10;

export async function runTask(spec: RunTaskSpec): Promise<TaskOutcome> {
	const { reservation, feature, units } = spec;
	const started = Date.now();
	let taskId: string | undefined;
	try {
		({ taskId } = await createTask(spec.path, spec.body, feature));
		const { results } = await pollTask(spec.path, taskId, feature, started);
		const seconds = round1(Date.now() - started);
		reservation.settle(units, { feature, ok: true, units, taskId, seconds });
		return { taskId, results, url: extractResultUrl(results), seconds };
	} catch (err) {
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
