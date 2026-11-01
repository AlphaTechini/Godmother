// Public surface of the YouCam module. The agent imports only from here.
// Every feature: prepares the input images, uploads them, creates the task, polls it,
// downloads the result into the asset store, and records units on session.units.

import type { AccessoryCategory, Asset, FaceProfile, GarmentCategory, Session } from '#lib/types';
import type { FaceBox } from './images';

export { UnitCapError, YouCamTaskError } from './errors';
export type { FaceBox } from './images';

export interface FeatureContext {
	/** Units are reserved and recorded on session.units. The caller persists the session. */
	session: Session;
}

export interface FeatureResult {
	image: Asset;
	seconds: number;
	units: number;
}

export interface HairTemplate {
	id: string;
	title: string;
	gender: 'female' | 'male' | 'unisex';
	thumbUrl?: string;
	keepUsersColor: boolean;
}

/** A makeup effect, as in docs/API-NOTES.md §2.3.1. Validated by validateMakeupEffects. */
export type MakeupEffect = Record<string, unknown> & { category: string };

export type { MakeupValidation } from './makeup';
export {
	MAKEUP_PATTERNS,
	makeupEffectsJsonSchema,
	makeupEffectsParameterSchema,
	validateMakeupEffects
} from './makeup';

export {
	analyzeFace,
	applyHairstyle,
	applyMakeup,
	generateGarmentImage,
	generateShowcaseVideo,
	listHairTemplates,
	tryOnAccessory,
	tryOnGarment,
	tryOnShoes,
	unitCost
} from './features';

// Signatures the features module must implement (kept here as documentation):
export type Features = {
	tryOnGarment(
		ctx: FeatureContext,
		input: { person: Asset; garment: Asset; category: GarmentCategory; changeShoes?: boolean }
	): Promise<FeatureResult>;
	tryOnShoes(ctx: FeatureContext, input: { person: Asset; shoes: Asset }): Promise<FeatureResult>;
	applyMakeup(
		ctx: FeatureContext,
		input: { portrait: Asset; effects: MakeupEffect[] }
	): Promise<FeatureResult>;
	applyHairstyle(
		ctx: FeatureContext,
		input: { portrait: Asset; templateId: string }
	): Promise<FeatureResult>;
	listHairTemplates(): Promise<HairTemplate[]>;
	tryOnAccessory(
		ctx: FeatureContext,
		input: { person: Asset; category: AccessoryCategory; product: Asset; productUrl?: string }
	): Promise<FeatureResult>;
	/** Skin tone (20 units) + face attributes (10 units). Runs once per session; callers cache on session.face. */
	analyzeFace(
		ctx: FeatureContext,
		input: { portrait: Asset; faceBox?: FaceBox }
	): Promise<FaceProfile>;
	generateGarmentImage(ctx: FeatureContext, input: { prompt: string }): Promise<FeatureResult>;
	unitCost(
		feature:
			| 'garment'
			| 'shoes'
			| 'makeup'
			| 'hair'
			| 'accessory'
			| 'skin_tone'
			| 'face_attributes'
			| 'image_generation'
	): number;
};
