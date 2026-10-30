// Mapping of the skin-tone and face-attribute results (API-NOTES §2.6, §2.7) into FaceProfile.
// Everything is parsed defensively: the face-attr result shape has no live example.

import type { FaceProfile, NamedColor } from '#lib/types';
import { deriveUndertone, describeColor, describeSkinTone, normalizeHex } from './color';

/** The five features we request (exactly 5 keeps the price at 10 units). */
export const FACE_ATTR_FEATURES = [
	'faceShape',
	'eyeShape',
	'eyelid',
	'lipShape',
	'eyebrowShape'
] as const;

const str = (v: unknown): string | undefined =>
	typeof v === 'string' && v.trim() ? v.trim() : undefined;

function named(
	hex: unknown,
	name: unknown,
	fallback: (h: string) => string
): NamedColor | undefined {
	const h = normalizeHex(hex);
	if (!h) return undefined;
	const n = str(name);
	return { hex: h, name: n && n.toLowerCase() !== 'other' ? n : fallback(h) };
}

/** Left/right readings collapse to one value, or "left / right" when they differ. */
function pair(left: unknown, right: unknown): string | undefined {
	const bad = (s: string) => /^(obscured|unknown)$/i.test(s);
	const l = str(left);
	const r = str(right);
	const a = l && !bad(l) ? l.toLowerCase() : undefined;
	const b = r && !bad(r) ? r.toLowerCase() : undefined;
	if (a && b) return a === b ? a : `${a} / ${b}`;
	return a ?? b;
}

export function mapSkinTone(results: any): Partial<FaceProfile> {
	const c = results?.color ?? {};
	const profile: Partial<FaceProfile> = { features: {} };
	const skin = normalizeHex(c.skin_color);
	if (skin) {
		profile.skinTone = { hex: skin, name: describeSkinTone(skin) };
		// OUR estimate: YouCam returns no undertone (see color.ts).
		profile.undertone = deriveUndertone(skin);
	}
	const lip = named(c.lip_color, undefined, describeColor);
	if (lip) profile.lipColor = lip;
	const eye = named(c.eye_color, c.eye_color_name, describeColor);
	if (eye) profile.eyeColor = eye;
	const hair = named(c.hair_color, c.hair_color_name, describeColor);
	if (hair) profile.hairColor = hair;
	const brow = normalizeHex(c.eyebrow_color);
	if (brow) profile.features!.eyebrow_color = brow;
	return profile;
}

export function mapFaceAttributes(results: any): Pick<FaceProfile, 'faceShape' | 'features'> {
	const features: Record<string, string> = {};
	const shape = str(results?.faceshape) ?? str(results?.faceShape);
	const faceShape = shape && shape.toLowerCase() !== 'unknown' ? shape : undefined;
	if (faceShape) features.face_shape = faceShape.toLowerCase();

	const eyelid = results?.eyelid ?? {};
	const set = (key: string, value: string | undefined) => {
		if (value) features[key] = value;
	};
	set('eye_shape', pair(eyelid.left_shape, eyelid.right_shape));
	set('eyelid_type', pair(eyelid.left_eyelid, eyelid.right_eyelid));
	set('eye_angle', pair(eyelid.left_angle, eyelid.right_angle));
	set('eye_setting', str(eyelid.setting)?.toLowerCase());
	set('eye_size', str(eyelid.size)?.toLowerCase());

	const brow = results?.eyebrow ?? {};
	set('eyebrow_shape', pair(brow.left_shape, brow.right_shape));
	set('eyebrow_gap', str(brow.gap)?.toLowerCase());

	const lips = results?.lipshape;
	const lipList = (Array.isArray(lips) ? lips : lips ? [lips] : [])
		.map(str)
		.filter((s): s is string => Boolean(s));
	if (lipList.length) features.lip_shape = lipList.map((s) => s.toLowerCase()).join(', ');

	return { faceShape, features };
}
