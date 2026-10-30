// The tool registry.

import { researchEvent, saveEventBrief, setLocation } from './event';
import { analyzeFaceTool, finishLook, listHairstyles } from './finishing';
import { decide, proposeLooks, reviseLook } from './looks';
import { designGarment, searchProducts } from './products';
import { buildShoppingListTool } from './shopping';
import { catalogWardrobe, requestPhotos, suggestReplies } from './wardrobe';
import type { ToolDef } from './types';

export function allTools(): ToolDef[] {
	return [
		researchEvent,
		saveEventBrief,
		setLocation,
		requestPhotos,
		catalogWardrobe,
		searchProducts,
		designGarment,
		proposeLooks,
		reviseLook,
		decide,
		analyzeFaceTool,
		listHairstyles,
		finishLook,
		buildShoppingListTool,
		suggestReplies
	];
}

export type { ToolDef, ToolEnv } from './types';
export { ToolError } from './types';
