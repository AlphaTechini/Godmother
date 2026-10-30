// UI button actions: the deterministic part runs before the model; the returned lines tell the model what happened.

import type { UserAction } from '#lib/types';
import { publishShoppingList } from './tools/shopping';
import { ToolError, type ToolEnv } from './tools/types';

const FINISHING_HINT =
	'Move on to finishing: ask only for what is still missing (the portrait if absent, then shoe and accessory preferences if unclear), run analyze_face, plan makeup and hair, and call finish_look once.';

/** Applies the action to the session and returns `[ui action]` lines for the model. */
export async function handleAction(env: ToolEnv, action: UserAction): Promise<string[]> {
	const { session, ctx } = env;
	const find = (id: string) => session.looks.find((l) => l.id === id);

	switch (action.type) {
		case 'choose_look': {
			const look = find(action.lookId);
			if (!look) return [`[ui action] The user pressed Choose on look "${action.lookId}", but no such look exists. Say so briefly and show them the options.`];
			session.chosenLookId = look.id;
			session.stage = 'chosen';
			await ctx.sessionChanged();
			const broken = look.render.status === 'failed' ? ` Note: look ${look.index} failed to render; offer revise_look first.` : '';
			return [
				`[ui action] The user chose look ${look.index} "${look.title}" (id ${look.id}). It is saved as their chosen look; do not call decide. Acknowledge in one short sentence.${broken} ${FINISHING_HINT}`
			];
		}
		case 'decide_for_me': {
			if (session.looks.length === 0) {
				return ['[ui action] The user pressed "Decide for me" but there are no looks yet. Say so and move the flow forward.'];
			}
			return [
				'[ui action] The user pressed "Decide for me". You must rank all the looks (0-100, one short note each) and commit to one by calling decide now. Then explain the pick in one or two sentences.'
			];
		}
		case 'finish_look': {
			const look = find(action.lookId);
			if (!look) return [`[ui action] The user pressed Finish on look "${action.lookId}", but no such look exists. Say so briefly.`];
			session.chosenLookId = look.id;
			if (session.stage === 'looks' || session.stage === 'photos' || session.stage === 'event') session.stage = 'chosen';
			await ctx.sessionChanged();
			return [
				`[ui action] The user pressed Finish on look ${look.index} "${look.title}" (id ${look.id}): run the finishing touches for exactly this look now. ${FINISHING_HINT}`
			];
		}
		case 'shopping_list': {
			const actId = 'action:shopping_list';
			ctx.activity(actId, 'Adding up what you would need to buy', 'running');
			try {
				const out = await publishShoppingList(env);
				ctx.activity(actId, 'Adding up what you would need to buy', 'done');
				return [
					`[ui action] The user pressed Shopping list. It is built and the card is shown (total ${out.total}, ${out.items} item(s)). Add one short line of your own; do not repeat the numbers and do not call build_shopping_list again.`
				];
			} catch (err) {
				const message = err instanceof ToolError ? err.message : 'The list could not be built.';
				ctx.activity(actId, 'Adding up what you would need to buy', 'failed', message);
				if (!(err instanceof ToolError)) console.error('[agent] shopping list action failed', err);
				return [`[ui action] The user pressed Shopping list but it could not be built: ${message} Explain in one sentence what is needed first.`];
			}
		}
	}
}
