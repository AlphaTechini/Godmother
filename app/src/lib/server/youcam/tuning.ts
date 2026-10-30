// Switches for behaviour that is INFERRED in docs/API-NOTES.md. Each is a one-line fix.

export const tuning = {
	/**
	 * Shoes engine. 'cloth-v4' uses garment_category "shoes" (documented enum, never seen live);
	 * 'shoes-transfer' uses the V3 endpoint with an INFERRED body {src_file_id, ref_file_id}.
	 */
	shoesEngine: 'cloth-v4' as 'cloth-v4' | 'shoes-transfer',
	/**
	 * A task that is still running when our poll timeout hits will be charged if it succeeds.
	 * true: count its cost against the cap (conservative). false: record units 0.
	 */
	chargeOnTimeout: true,
	/** Default skin_smooth added when the plan has none (YouCam would otherwise apply 50). */
	defaultSkinSmooth: { skinSmoothStrength: 40, skinSmoothColorIntensity: 35 }
};
