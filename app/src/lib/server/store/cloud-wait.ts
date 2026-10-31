// Some hosts (Cloud Run with request billing) throttle the CPU once a response ends, so background
// copies would stall. Requests wait here before closing. An outage only costs the time limit.

import { settleWalletWrites } from '#lib/server/units/wallets';
import { settleAssetSync } from './cloud-assets';
import { syncSessionNow } from './cloud-sessions';

const WAIT_MS = 8000;

export async function waitForCloudCopies(sessionId: string): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const limit = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, WAIT_MS);
	});
	await Promise.race([
		limit,
		Promise.all([settleAssetSync(), syncSessionNow(sessionId), settleWalletWrites()])
	]);
	clearTimeout(timer);
}
