// create_video: the same film as the lookbook button, for people who ask for it in chat.

import { SHOWCASE_VIDEO_UNITS } from '#lib/types';
import { filmLook } from '../showcase-video';
import { obj } from './schemas';
import type { ToolDef } from './types';

export const createVideo: ToolDef = {
	name: 'create_video',
	description: `Film the finished look as a 10-second video, shown to the user in the chat. Costs ${SHOWCASE_VIDEO_UNITS} units and takes a minute or two. Call it when the user asks for a video or film of their look, once per request. Needs a finished look.`,
	parameters: obj({}),
	strict: true,
	label: () => null,
	async run(_args, env) {
		return filmLook(env);
	}
};
