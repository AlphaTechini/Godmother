// The showcase video, from the button or from a request in chat. The API takes a single image and a
// prompt, and both come from showcase-plan.ts.

import { generateShowcaseVideo, UnitCapError, YouCamTaskError } from '#lib/server/youcam';
import { SHOWCASE_VIDEO_UNITS } from '#lib/types';
import { showcasePlan } from './showcase-plan';
import type { ToolEnv } from './tools/types';

/** Films the look and shows the result. The message is what the user should be told. */
export async function filmLook(env: ToolEnv): Promise<{ ok: boolean; message: string }> {
	const { ctx, session } = env;
	if (!session.lookbook?.full) {
		return { ok: false, message: 'Finish your look first, then I can make the video from it.' };
	}
	const actId = 'video:showcase';
	const label = 'Filming your look';
	ctx.activity(actId, label, 'running');
	let result: { ok: boolean; message: string };
	try {
		const plan = await showcasePlan(env);
		if (!plan) {
			ctx.activity(actId, label, 'failed');
			return {
				ok: false,
				message:
					'I couldn’t prepare your video this time, and no units were used. Please try again.'
			};
		}
		const { image: video } = await generateShowcaseVideo(
			{ session },
			{ source: plan.start, prompt: plan.prompt, negativePrompt: plan.negativePrompt }
		);
		session.lookbook.video = video;
		ctx.activity(actId, label, 'done');
		ctx.block({ type: 'video', asset: video });
		result = {
			ok: true,
			message:
				'Here’s your film. The movement is imagined by AI, including the back of the outfit, so small details can shift.'
		};
	} catch (err) {
		ctx.activity(actId, label, 'failed');
		if (err instanceof UnitCapError) {
			result = {
				ok: false,
				message: `The video needs ${SHOWCASE_VIDEO_UNITS} units and you have ${err.remaining} left. You can sign in for more, or claim fresh units on your History page when your next claim opens.`
			};
		} else if (err instanceof YouCamTaskError) {
			result = { ok: false, message: `The video didn’t work this time: ${err.userMessage}` };
		} else {
			throw err;
		}
	}
	await ctx.sessionChanged();
	return result;
}

/** The button: no typing and no model, so it costs less and behaves the same each time. */
export async function makeShowcaseVideo(env: ToolEnv): Promise<void> {
	const { message } = await filmLook(env);
	env.ctx.text(message);
}
