// Unit cap and ledger. Several looks render in parallel for one session, so units are RESERVED
// (synchronously, per session id) before any network call; settling moves them to session.units.

import type { Session, UnitLedgerEntry } from '#lib/types';
import { UnitCapError } from './errors';

export type LedgerFeature =
	| 'garment'
	| 'shoes'
	| 'makeup'
	| 'hair'
	| 'accessory'
	| 'skin_tone'
	| 'face_attributes'
	| 'image_generation';

/** Units per call (API-NOTES §1.7). Accessory = a single object_infos entry. */
export const UNIT_COSTS: Record<LedgerFeature, number> = {
	garment: 2,
	shoes: 2,
	makeup: 1,
	hair: 2,
	accessory: 1,
	skin_tone: 20,
	face_attributes: 10,
	image_generation: 1
};

/** Units reserved but not yet settled, per session id (in memory, process wide). */
const reserved = new Map<string, number>();

export function reservedUnits(sessionId: string): number {
	return reserved.get(sessionId) ?? 0;
}

export function resetReservations(): void {
	reserved.clear();
}

export interface SettleInput {
	feature: LedgerFeature;
	ok: boolean;
	/** Units actually charged (0 on failure). */
	units: number;
	taskId?: string;
	seconds?: number;
}

export class Reservation {
	private left: number;

	constructor(
		private readonly session: Session,
		amount: number
	) {
		this.left = amount;
	}

	/** Moves `portion` of the reservation into the ledger. */
	settle(portion: number, entry: SettleInput): void {
		const p = Math.min(portion, this.left);
		this.left -= p;
		this.drop(p);
		const e: UnitLedgerEntry = {
			at: new Date().toISOString(),
			feature: entry.feature,
			units: entry.units,
			ok: entry.ok,
			...(entry.taskId ? { taskId: entry.taskId } : {}),
			...(entry.seconds !== undefined ? { seconds: entry.seconds } : {})
		};
		this.session.units.spent += entry.units;
		this.session.units.ledger.push(e);
	}

	/** Gives back whatever was not settled. Safe to call more than once. */
	release(): void {
		this.drop(this.left);
		this.left = 0;
	}

	private drop(n: number): void {
		const id = this.session.id;
		const next = (reserved.get(id) ?? 0) - n;
		if (next > 0) reserved.set(id, next);
		else reserved.delete(id);
	}
}

/**
 * Checks spent + reserved + units <= cap and reserves. Synchronous, so two parallel callers can
 * never both pass the check on the same headroom. Throws UnitCapError.
 */
export function reserve(session: Session, units: number): Reservation {
	const { spent, cap } = session.units;
	const held = reserved.get(session.id) ?? 0;
	if (spent + held + units > cap) {
		throw new UnitCapError(units, Math.max(0, cap - spent - held));
	}
	reserved.set(session.id, held + units);
	return new Reservation(session, units);
}
