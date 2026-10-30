// Hair template catalog: GET /s2s/v2.1/task/template/hair-transfer (free, paged). Cached 6 h.
// If the list cannot be fetched we fall back to the gala template ids from API-NOTES §2.4 so the
// agent still has options (the ids are stable slugs but were not re-verified live).

import { apiRequest } from './client';
import type { HairTemplate } from './index';

const TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_TTL_MS = 60 * 1000;
const MAX_PAGES = 15;

let cache: { at: number; ttl: number; templates: HairTemplate[] } | undefined;
let inflight: Promise<HairTemplate[]> | undefined;

export function resetHairTemplateCache(): void {
	cache = undefined;
	inflight = undefined;
}

const FEMALE =
	`all_classic_hollywood_waves all_goddess_waves all_romantic_waves all_half_up_soft_waves
female_casual_updo all_high_pony_tail female_sleek_middle_part all_gentle_waves all_french_bob
female_long_straight female_side_part_straight all_curly_double_buns female_boho_side_braid
all_defined_waves female_messy_bun`.split(/\s+/);
const MALE = `male_textured_comma all_side_swept_undercut male_wavy_undercut male_tousled_cut
all_tousled_waves male_afro all_dreadlocks all_buzz_cut`.split(/\s+/);

const titleFromId = (id: string) =>
	id
		.replace(/^(all|female|male)_/, '')
		.split('_')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');

export function fallbackHairTemplates(): HairTemplate[] {
	const make = (id: string, gender: HairTemplate['gender']): HairTemplate => ({
		id,
		title: titleFromId(id),
		gender,
		keepUsersColor: true
	});
	return [...FEMALE.map((id) => make(id, 'female')), ...MALE.map((id) => make(id, 'male'))];
}

function genderOf(category: unknown): HairTemplate['gender'] {
	const c = typeof category === 'string' ? category.toLowerCase() : '';
	return c === 'female' ? 'female' : c === 'male' ? 'male' : 'unisex';
}

async function fetchAll(): Promise<HairTemplate[]> {
	const out: HairTemplate[] = [];
	let token: string | null = null;
	for (let page = 0; page < MAX_PAGES; page++) {
		const qs = new URLSearchParams({ page_size: '20' });
		if (token) qs.set('starting_token', token);
		const res = await apiRequest(
			'GET',
			`/s2s/v2.1/task/template/hair-transfer?${qs}`,
			undefined,
			'hair'
		);
		for (const t of res.data?.templates ?? []) {
			if (typeof t?.id !== 'string' || !t.id) continue;
			out.push({
				id: t.id,
				title: typeof t.title === 'string' && t.title ? t.title : titleFromId(t.id),
				gender: genderOf(t.category_name),
				...(typeof t.thumb === 'string' && t.thumb ? { thumbUrl: t.thumb } : {}),
				keepUsersColor: t.keep_users_color === true
			});
		}
		token =
			typeof res.data?.next_token === 'string' && res.data.next_token ? res.data.next_token : null;
		if (!token) break;
	}
	if (out.length === 0) throw new Error('empty template list');
	return out;
}

/** Hair templates (free). Never throws: falls back to the known gala ids. */
export async function listHairTemplates(): Promise<HairTemplate[]> {
	if (cache && Date.now() - cache.at < cache.ttl) return cache.templates;
	inflight ??= (async () => {
		try {
			const templates = await fetchAll();
			cache = { at: Date.now(), ttl: TTL_MS, templates };
			return templates;
		} catch {
			const templates = fallbackHairTemplates();
			cache = { at: Date.now(), ttl: FALLBACK_TTL_MS, templates };
			return templates;
		} finally {
			inflight = undefined;
		}
	})();
	return inflight;
}
