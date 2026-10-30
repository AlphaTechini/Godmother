// The Godmother agent: one user turn = rebuild the model input from the session, run the tool loop.

import { getModelClient } from '#lib/server/openai';
import type { TurnRunner } from '#lib/server/turn';
import { handleAction } from './actions';
import { currentUserItem, historyItems } from './history';
import { MAX_ROUNDS, runModelLoop } from './loop';
import { loadAgentState, saveAgentState } from './state';
import type { ToolEnv } from './tools/types';

function friendly(err: unknown): Error {
	const status = (err as { status?: number } | null)?.status;
	if (status === 401 || status === 403) return new Error('The language model rejected this server\'s credentials.');
	if (status === 429) return new Error('The language model is rate limiting requests right now. Try again in a moment.');
	return new Error('Godmother lost the thread talking to the language model. Try again in a moment.');
}

export const runAgentTurn: TurnRunner = async (ctx, input) => {
	const session = ctx.session;
	const agent = await loadAgentState(session.id);
	const env: ToolEnv = {
		ctx,
		session,
		agent,
		model: getModelClient(),
		saveAgent: () => saveAgentState(session.id, agent)
	};

	const uiLines = input.action ? await handleAction(env, input.action) : [];
	const history = historyItems(session.messages, [ctx.userMessage.id, ctx.assistantMessage.id]);
	const current = await currentUserItem(ctx.userMessage, input.text, uiLines);

	try {
		const result = await runModelLoop(env, [...history, current]);
		if (result.capped) {
			console.warn(`[agent] stopped after ${MAX_ROUNDS} rounds in session ${session.id}`);
			ctx.text(
				"\n\nI've taken a lot of steps in one go, so I'm pausing here. Tell me to keep going and I'll pick up where I left off."
			);
		}
	} catch (err) {
		console.error('[agent] turn failed', err);
		throw friendly(err);
	}
};

export { setModelClient } from '#lib/server/openai';
