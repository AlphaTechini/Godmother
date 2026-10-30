// Display helpers shared by components. Pure functions, no state.
import type {
	AttachmentPurpose,
	DressCode,
	Money,
	PhotoSlot,
	PieceRole,
	PieceSource,
	PriceRange,
	Stage
} from '#lib/types';

const moneyFormatters = new Map<string, Intl.NumberFormat>();
function moneyFormat(currency: string): Intl.NumberFormat {
	let f = moneyFormatters.get(currency);
	if (!f) {
		try {
			f = new Intl.NumberFormat('en', {
				style: 'currency',
				currency,
				currencyDisplay: 'narrowSymbol',
				maximumFractionDigits: 0
			});
		} catch {
			f = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
		}
		moneyFormatters.set(currency, f);
	}
	return f;
}

export function formatMoney(m: Money | undefined): string {
	if (!m) return '';
	return moneyFormat(m.currency).format(m.amount);
}

/** "₦518,500 – ₦618,500", collapsing to a single figure when min === max. */
export function formatRange(r: PriceRange | undefined): string {
	if (!r) return '';
	if (r.min.amount === r.max.amount) return formatMoney(r.min);
	return `${formatMoney(r.min)} – ${formatMoney(r.max)}`;
}

export function formatDate(iso: string | undefined, withTime = false): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
	});
}

export function formatTime(iso: string | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function hostname(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

export const ROLE_LABEL: Record<PieceRole, string> = {
	upper_body: 'Top',
	lower_body: 'Bottom',
	full_body: 'Gown',
	outer: 'Outerwear',
	shoes: 'Shoes',
	earrings: 'Earrings',
	necklace: 'Necklace',
	watch: 'Watch',
	ring: 'Ring',
	bracelet: 'Bracelet'
};

export function sourceLabel(s: PieceSource): string {
	return s.type === 'wardrobe' ? 'Yours' : s.type === 'sew' ? 'To sew' : 'To buy';
}

export const DRESS_CODE_LABEL: Record<DressCode, string> = {
	white_tie: 'White tie',
	black_tie: 'Black tie',
	black_tie_optional: 'Black tie optional',
	formal: 'Formal',
	cocktail: 'Cocktail',
	semi_formal: 'Semi-formal',
	business: 'Business',
	smart_casual: 'Smart casual',
	casual: 'Casual',
	themed: 'Themed',
	traditional: 'Traditional attire',
	unknown: 'Not stated'
};

export const PHOTO_SLOTS: {
	slot: PhotoSlot;
	title: string;
	short: string;
	why: string;
	need: string;
	ratio: string;
}[] = [
	{
		slot: 'fullBody',
		title: 'Full-body photo',
		short: 'Full body',
		why: 'Clothes and shoes are tried on your whole body, head to feet.',
		need: 'Front-facing, standing, feet in frame, fitted clothes.',
		ratio: '2 / 3'
	},
	{
		slot: 'portrait',
		title: 'Portrait',
		short: 'Portrait',
		why: 'Makeup, hair, earrings and necklace go on your face and neck.',
		need: 'Face the camera, hair off the face, neck visible, soft daylight.',
		ratio: '4 / 5'
	},
	{
		slot: 'hand',
		title: 'Hand',
		short: 'Hand',
		why: 'Watches, rings and bracelets are fitted to your wrist and fingers.',
		need: 'Back of the hand and wrist, all five fingers visible.',
		ratio: '1 / 1'
	}
];

export const PURPOSE_LABEL: Record<AttachmentPurpose, string> = {
	invitation: 'Invitation',
	wardrobe: 'My clothes',
	fullBody: 'Full-body photo',
	portrait: 'Portrait',
	hand: 'Hand photo',
	other: 'Other'
};

export const STAGES: { stage: Stage; label: string }[] = [
	{ stage: 'event', label: 'Event' },
	{ stage: 'photos', label: 'Photos' },
	{ stage: 'looks', label: 'Looks' },
	{ stage: 'chosen', label: 'Chosen' },
	{ stage: 'finishing', label: 'Finishing' },
	{ stage: 'done', label: 'Done' }
];

export function stageIndex(s: Stage): number {
	return STAGES.findIndex((x) => x.stage === s);
}

/** Relative luminance check so text on a colour swatch stays legible. */
export function isLight(hex: string): boolean {
	const h = hex.replace('#', '');
	if (h.length < 6) return false;
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}
