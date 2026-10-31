// Rate limits per browser and per address. Changing IP doesn't help while the browser keeps its id,
// and clearing the id doesn't help while the address stays the same.

import type { RequestEvent } from '@sveltejs/kit';
import type { Spender } from '#lib/server/units/wallets';
import { allowAttempt } from './limiter';

function clientAddress(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'no-address';
	}
}

/** Whose units a request spends. */
export function spenderOf(event: RequestEvent): Spender {
	const { user, device } = event.locals;
	return user
		? { kind: 'user', id: user.id }
		: { kind: 'guest', deviceId: device?.id, address: clientAddress(event) };
}

export function allowClient(
	event: RequestEvent,
	action: string,
	limit: number,
	windowMs: number
): boolean {
	const device = event.locals.device;
	// Requests with no genuine id share one allowance, so they can't each count as a new browser.
	const browser = device?.known ? `device:${device.id}` : 'no-device';
	const byBrowser = allowAttempt(`${action}:${browser}`, limit, windowMs);
	const byAddress = allowAttempt(`${action}:address:${clientAddress(event)}`, limit, windowMs);
	return byBrowser && byAddress;
}
