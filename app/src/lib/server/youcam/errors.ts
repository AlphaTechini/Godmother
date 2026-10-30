// Error types and the mapping from YouCam error codes to messages a person can act on.

/** Thrown before a task is created when it would push the session over its unit cap. */
export class UnitCapError extends Error {
	constructor(
		readonly needed: number,
		readonly remaining: number
	) {
		super(`This step needs ${needed} YouCam units but only ${remaining} remain in this session.`);
		this.name = 'UnitCapError';
	}
}

export interface TaskErrorExtra {
	/** The YouCam task id, when a task had been created (useful if it may still be charged). */
	taskId?: string;
	/** Machine-readable detail, e.g. the makeup validation errors. */
	details?: string[];
}

/** A task that YouCam rejected (engine error or HTTP error). `userMessage` is safe to show. */
export class YouCamTaskError extends Error {
	readonly taskId?: string;
	readonly details?: string[];
	constructor(
		readonly code: string,
		readonly userMessage: string,
		readonly feature: string,
		extra: TaskErrorExtra = {}
	) {
		super(`${feature}: ${code}`);
		this.name = 'YouCamTaskError';
		this.taskId = extra.taskId;
		this.details = extra.details;
	}
}

/** HTTP-level failure of a YouCam API call (internal; callers see YouCamTaskError). */
export class YouCamHttpError extends Error {
	constructor(
		readonly status: number,
		readonly errorCode: string | undefined,
		readonly serverMessage: string | undefined,
		readonly retryAfterMs?: number
	) {
		super(`HTTP ${status} ${errorCode ?? ''} ${serverMessage ?? ''}`.trim());
		this.name = 'YouCamHttpError';
	}
}

/** The request never produced an HTTP response (DNS, reset, timeout). */
export class YouCamNetworkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'YouCamNetworkError';
	}
}

const FACE_TOO_SMALL =
	'Your face is too small or too close to the edge of the photo. Use a photo where your face fills more of the frame.';
const TURNED = 'Your head is turned too far. Look straight at the camera and try again.';
const INTERNAL = 'YouCam hit an internal error. Nothing was charged; try again in a moment.';

/** Engine error codes (docs/API-NOTES.md §1.6), lower-cased keys. */
const ENGINE_MESSAGES: Record<string, string> = {
	error_no_face: 'YouCam could not find a face. Try a clear, front-facing photo in good light.',
	error_multiple_people: 'YouCam found more than one person. Use a photo with only you in it.',
	error_multi_person: 'YouCam found more than one person. Use a photo with only you in it.',
	error_no_shoulder:
		'YouCam needs your shoulders in the portrait. Try a photo framed from the chest up.',
	error_large_face_angle: TURNED,
	error_face_angle_invalid: TURNED,
	error_face_pose: TURNED,
	error_face_not_forward_facing: TURNED,
	error_face_angle_leftward: TURNED,
	error_face_angle_rightward: TURNED,
	error_face_angle_upward: 'Your chin is raised too high. Lower it a little and try again.',
	error_face_angle_downward: 'Your chin is tucked too low. Lift it a little and try again.',
	error_face_angle_left_tilt: 'Your head is tilted. Keep it level and try again.',
	error_face_angle_right_tilt: 'Your head is tilted. Keep it level and try again.',
	error_face_position_invalid: FACE_TOO_SMALL,
	error_face_position_too_small: FACE_TOO_SMALL,
	error_face_position_out_of_boundary: FACE_TOO_SMALL,
	error_insufficient_landmarks:
		'YouCam could not see enough of your face. Use a photo where hair, hands or glasses do not cover it.',
	error_hair_too_short:
		'YouCam could not find enough hair to restyle. Try a photo where your hair is clearly visible.',
	error_bald_image:
		'YouCam could not find enough hair to restyle. Try a photo where your hair is clearly visible.',
	error_pose:
		'YouCam could not read your pose. Use a standing, front-facing photo with your face and shoulders in view.',
	error_invalid_ref:
		'YouCam could not use that garment photo. Try a clear, front-facing photo of a single item.',
	error_apply_region_mismatch:
		'That garment covers a different part of the body than your photo shows. Use a photo that shows the matching area (for example a full-body photo for a dress).',
	error_invalid_src:
		'Your photo shows only the lower body or feet. Use a photo that includes your face and torso.',
	error_editing_failed:
		'YouCam produced almost no change with that item. Try a different garment photo.',
	error_below_min_image_size: 'That photo is too small for YouCam. Use a larger image.',
	error_exceed_max_image_size: 'That photo is too large for YouCam. Use a smaller image.',
	exceed_max_filesize: 'That photo is too large for YouCam (10 MB maximum). Use a smaller image.',
	error_unsupport_ratio:
		'YouCam does not support that photo shape. Use a standard portrait or landscape photo.',
	error_download_image: 'YouCam could not download the image. Try again.',
	error_decode_image: 'YouCam could not read that image file. Upload a JPEG or PNG.',
	error_nsfw_content_detected: 'YouCam flagged this image as unsuitable content.',
	invalid_parameter:
		'YouCam rejected the settings for this step. Nothing was charged; try different options.',
	error_inference: INTERNAL,
	error_face_parsing: INTERNAL,
	unknown_internal_error: INTERNAL,
	runtime_error: INTERNAL,
	// 2D jewellery (upper case in the API; matched case-insensitively)
	photo_detection_fail:
		'YouCam could not find the face or hand. For rings, bracelets and watches show the back of the hand with all five fingers visible; for earrings and necklaces use a clear front-facing portrait.',
	object_detection_fail:
		'YouCam could not find the jewellery in the product photo. Use one item on a plain background.',
	photo_check_invalid:
		'The pose or size of your photo does not suit this accessory. Use a clear, front-facing photo (or the back of the hand for rings and watches).',
	input_error: 'YouCam did not receive the photo properly. Try again.',
	input_main_image_empty: 'YouCam did not receive the photo properly. Try again.'
};

/** User-facing message for an engine error code. Unknown codes get a generic message. */
export function engineErrorMessage(code: string): string {
	return (
		ENGINE_MESSAGES[code.toLowerCase()] ??
		`YouCam could not process this step (${code}). Try a different photo.`
	);
}

/** Maps a failed API call (HTTP or network) to a YouCamTaskError. */
export function toTaskError(err: unknown, feature: string, taskId?: string): YouCamTaskError {
	if (err instanceof YouCamTaskError) return err;
	const extra = { taskId };
	if (err instanceof YouCamNetworkError) {
		return new YouCamTaskError(
			'network',
			'Could not reach YouCam. Check the connection and try again.',
			feature,
			extra
		);
	}
	if (err instanceof YouCamHttpError) {
		const code = (err.errorCode ?? '').toLowerCase();
		const details = err.serverMessage ? [err.serverMessage] : undefined;
		const e = { taskId, details };
		if (code === 'creditinsufficiency') {
			return new YouCamTaskError(
				'credit_insufficiency',
				'The YouCam account has run out of units. Top up the account and try again.',
				feature,
				e
			);
		}
		if (err.status === 401 || /apikey|accesstoken/.test(code)) {
			const expired = code === 'expiredapikey';
			return new YouCamTaskError(
				'unauthorized',
				expired
					? 'The YouCam API key has expired. Replace YOUCAM_API_KEY and try again.'
					: 'YouCam rejected our API key. Check YOUCAM_API_KEY.',
				feature,
				e
			);
		}
		if (err.status === 429) {
			return new YouCamTaskError(
				'rate_limited',
				'YouCam is busy right now (rate limit). Wait a minute and try again.',
				feature,
				e
			);
		}
		if (code === 'invalidtaskid' || err.status === 404) {
			return new YouCamTaskError(
				'invalid_task_id',
				'YouCam lost track of this task. It may not have been charged; try again.',
				feature,
				e
			);
		}
		if (code === 'tasktimeout' || /timed out/i.test(err.serverMessage ?? '')) {
			return new YouCamTaskError(
				'task_timeout',
				'YouCam took too long on this step. Try again.',
				feature,
				e
			);
		}
		if (err.status === 400) {
			return new YouCamTaskError(
				'invalid_parameters',
				'YouCam rejected the request. Nothing was charged; try a different photo or option.',
				feature,
				e
			);
		}
		return new YouCamTaskError(
			'server_error',
			'YouCam had a server error. Try again in a moment.',
			feature,
			e
		);
	}
	return new YouCamTaskError(
		'unknown',
		'Something went wrong talking to YouCam. Try again.',
		feature,
		{ taskId, details: [err instanceof Error ? err.message : String(err)] }
	);
}

/** Engine error from a poll response (`task_status: "error"`). */
export function engineError(
	code: string | null | undefined,
	serverMessage: string | null | undefined,
	feature: string,
	taskId: string
): YouCamTaskError {
	const c = code || 'unknown_internal_error';
	return new YouCamTaskError(c, engineErrorMessage(c), feature, {
		taskId,
		details: serverMessage ? [serverMessage] : undefined
	});
}
