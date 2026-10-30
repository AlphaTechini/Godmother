// STUB: replaced by the demo-mode engineer.
import type { Session } from '#lib/types';
import type { TurnRunner } from '#lib/server/turn';

export const runDemoTurn: TurnRunner = async (ctx) => {
	ctx.text('Demo mode is not wired up yet, so there is no recorded turn to play.');
};

export async function demoInitialSession(): Promise<Partial<Session> | null> {
	return null;
}
