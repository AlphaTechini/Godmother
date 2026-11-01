// The showcase video: one button, no typing. The API takes a single image and a prompt, and both come
// from showcase-plan.ts.

import { generateShowcaseVideo, UnitCapError, YouCamTaskError } from '#lib/server/youcam';
import { SHOWCASE_VIDEO_UNITS } from '#lib/types';
import { showcasePlan } from './showcase-plan';
import type { ToolEnv } from './tools/types';

export async function makeShowcaseVideo(env: ToolEnv): Promise<void> {
	const { ctx, session } = env;
	if (!session.lookbook?.full) {
		ctx.text('Finish your look first, then I can make the video from it.');
		return;
	}
	const actId = 'video:showcase';
	const label = 'Filming your look';
	ctx.activity(actId, label, 'running');
	try {
		const plan = await showcasePlan(env);
		if (!plan) {
			ctx.activity(actId, label, 'failed');
			ctx.text(
				'I couldn’t prepare your video this time, and no units were used. Please try again.'
			);
			return;
		}
		const { image: video } = await generateShowcaseVideo(
			{ session },
			{ source: plan.start, prompt: plan.prompt, negativePrompt: plan.negativePrompt }
		);
		session.lookbook.video = video;
		ctx.activity(actId, label, 'done');
		ctx.block({ type: 'video', asset: video });
		ctx.text(
			'Here’s your film. The movement is imagined by AI, including the back of the outfit, so small details can shift.'
		);
	} catch (err) {
		ctx.activity(actId, label, 'failed');
		if (err instanceof UnitCapError) {
			ctx.text(
				`The video needs ${SHOWCASE_VIDEO_UNITS} units and you have ${err.remaining} left. You can sign in for more, or claim fresh units on your History page the next day.`
			);
		} else if (err instanceof YouCamTaskError) {
			ctx.text(`The video didn’t work this time: ${err.userMessage}`);
		} else {
			throw err;
		}
	}
	await ctx.sessionChanged();
}
