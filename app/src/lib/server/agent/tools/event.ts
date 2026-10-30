// Event and location tools: research_event, save_event_brief, set_location.

import { config } from '#lib/server/config';
import { collectSources, jsonSchemaFormat, parseJsonOutput } from '#lib/server/openai';
import type { DressCode, EventBrief, Session, SourceLink, UserLocation } from '#lib/types';
import { DRESS_CODES, arrayOf, COLOR_SCHEMA, nullableStr, obj } from './schemas';
import {
	Problems,
	ToolError,
	isRec,
	readColors,
	readEnum,
	readString,
	readStringArray,
	type ToolDef
} from './types';

const RESEARCH_INSTRUCTIONS = `You research one event for a stylist. Use web search to find the event described.
Report only what the sources say; never guess. Copy the dress code exactly as the event states it ("dressCode"), then map it to the closest normalized value.
Event colours or a theme only count when the event states them (or the dress code clearly implies them); otherwise leave them empty.
"setting" is the practical setting for clothing choices (indoor ballroom, evening, outdoor garden, summer heat...).
"notes" are short facts that matter for what to wear (cultural expectations, venue rules, weather).
If you cannot identify the event with confidence, set found to false and explain in notes.`;

const RESEARCH_SCHEMA = obj({
	found: { type: 'boolean' },
	name: nullableStr,
	date: nullableStr,
	venue: nullableStr,
	city: nullableStr,
	dressCode: { ...nullableStr, description: 'Verbatim from the event.' },
	dressCodeNormalized: { type: 'string', enum: [...DRESS_CODES] },
	theme: nullableStr,
	colors: arrayOf(COLOR_SCHEMA),
	setting: nullableStr,
	notes: arrayOf({ type: 'string' })
});

function userLocationFor(session: Session) {
	const loc = session.location;
	if (!loc) return undefined;
	return {
		type: 'approximate' as const,
		...(loc.countryCode && /^[A-Za-z]{2}$/.test(loc.countryCode)
			? { country: loc.countryCode.toUpperCase() }
			: {}),
		...(loc.city ? { city: loc.city } : {}),
		...(loc.region ? { region: loc.region } : {})
	};
}

export { userLocationFor };

const clean = (v: unknown): string | undefined =>
	typeof v === 'string' && v.trim() ? v.trim() : undefined;

export const researchEvent: ToolDef = {
	name: 'research_event',
	description:
		'Look an event up on the web (name, link or description) and return its date, venue, dress code, theme and colours with sources. Does not save anything: show the user what you found via save_event_brief.',
	parameters: obj({
		query: {
			type: 'string',
			description: 'Event name, link or a short description, with city and year if known.'
		}
	}),
	strict: true,
	label: (a) => `Searching the web for ${clean(a.query)?.slice(0, 80) ?? 'the event'}`,
	async run(args, env) {
		const query = clean(args.query);
		if (!query) throw new ToolError('query is required.');
		const res = await env.model.respond({
			model: config.openai.model,
			instructions: RESEARCH_INSTRUCTIONS,
			input: query,
			tools: [
				{
					type: 'web_search',
					search_context_size: 'medium',
					...(userLocationFor(env.session) ? { user_location: userLocationFor(env.session) } : {})
				}
			],
			include: ['web_search_call.action.sources'],
			reasoning: { effort: 'low' },
			text: jsonSchemaFormat('event_research', RESEARCH_SCHEMA)
		});
		const raw = parseJsonOutput(res);
		if (!isRec(raw)) throw new ToolError('The research came back in an unusable form. Try again.');
		const p = new Problems();
		const dressCodeNormalized: DressCode =
			readEnum(new Problems(), raw.dressCodeNormalized, '', DRESS_CODES, false) ?? 'unknown';
		const sources = collectSources(res, 5);
		return {
			found: raw.found !== false && sources.length > 0,
			name: clean(raw.name),
			date: clean(raw.date),
			venue: clean(raw.venue),
			city: clean(raw.city),
			dressCode: clean(raw.dressCode),
			dressCodeNormalized,
			theme: clean(raw.theme),
			colors: readColors(p, raw.colors, 'colors'),
			setting: clean(raw.setting),
			notes: readStringArray(p, raw.notes, 'notes', { max: 6 }),
			sources
		};
	}
};

const EVENT_BRIEF_SCHEMA = obj({
	name: { type: 'string' },
	date: nullableStr,
	venue: nullableStr,
	city: nullableStr,
	dressCode: {
		...nullableStr,
		description: 'Exactly as the event states it, or null if none stated.'
	},
	dressCodeNormalized: { type: 'string', enum: [...DRESS_CODES] },
	theme: nullableStr,
	colors: arrayOf(COLOR_SCHEMA),
	setting: nullableStr,
	notes: arrayOf({ type: 'string' }),
	origin: {
		type: 'string',
		enum: ['web', 'invitation', 'typed'],
		description:
			'web: found by research_event. invitation: read from an uploaded invitation. typed: the user told you.'
	},
	sources: {
		...arrayOf(obj({ title: { type: 'string' }, url: { type: 'string' } })),
		description:
			'Required for origin "web" (use the sources research_event returned). Empty otherwise.'
	}
});

/** Validates model-supplied arguments into an EventBrief. */
export function parseEventBrief(args: Record<string, unknown>): EventBrief {
	const p = new Problems();
	const name = readString(p, args.name, 'name', { max: 160 });
	const origin = readEnum(p, args.origin, 'origin', ['web', 'invitation', 'typed'] as const);
	const dressCodeNormalized = readEnum(
		p,
		args.dressCodeNormalized,
		'dressCodeNormalized',
		DRESS_CODES
	);
	const colors = readColors(p, args.colors, 'colors');
	const notes = readStringArray(p, args.notes, 'notes', { max: 8 });

	const sources: SourceLink[] = [];
	if (Array.isArray(args.sources)) {
		args.sources.slice(0, 8).forEach((s, i) => {
			if (!isRec(s)) return p.add(`sources[${i}]`, 'must be { title, url }.');
			const url = readString(p, s.url, `sources[${i}].url`, { max: 600 });
			if (url && !/^https?:\/\//i.test(url)) p.add(`sources[${i}].url`, 'must be an http(s) URL.');
			else if (url)
				sources.push({
					title:
						readString(p, s.title, `sources[${i}].title`, { required: false, max: 200 }) ?? url,
					url
				});
		});
	}
	if (origin === 'web' && sources.length === 0) {
		p.add(
			'sources',
			'at least one source is required when origin is "web". Call research_event first and pass its sources.'
		);
	}
	p.throwIfAny('The event brief is not valid.');
	return {
		name: name!,
		...(clean(args.date) ? { date: clean(args.date) } : {}),
		...(clean(args.venue) ? { venue: clean(args.venue) } : {}),
		...(clean(args.city) ? { city: clean(args.city) } : {}),
		...(clean(args.dressCode) ? { dressCode: clean(args.dressCode) } : {}),
		dressCodeNormalized: dressCodeNormalized!,
		...(clean(args.theme) ? { theme: clean(args.theme) } : {}),
		colors,
		...(clean(args.setting) ? { setting: clean(args.setting) } : {}),
		notes,
		origin: origin!,
		sources
	};
}

export const saveEventBrief: ToolDef = {
	name: 'save_event_brief',
	description:
		'Save the event brief once you are confident about it (from research_event, an invitation or what the user typed). Shows the event card to the user and moves the flow on to photos.',
	parameters: EVENT_BRIEF_SCHEMA,
	strict: true,
	label: () => 'Saving the event details',
	async run(args, { ctx, session }) {
		const brief = parseEventBrief(args);
		session.event = brief;
		if (session.stage === 'event') session.stage = 'photos';
		ctx.block({ type: 'event', event: brief });
		await ctx.sessionChanged();
		return {
			ok: true,
			event: brief.name,
			stage: session.stage,
			hasLocation: Boolean(session.location)
		};
	}
};

const LOCATION_SCHEMA = obj({
	city: nullableStr,
	region: nullableStr,
	country: { type: 'string', description: 'Country name in English.' },
	countryCode: { type: ['string', 'null'], description: 'ISO 3166-1 alpha-2, e.g. "NG".' },
	currency: { type: 'string', description: 'ISO 4217 code of the local currency, e.g. "NGN".' }
});

export const setLocation: ToolDef = {
	name: 'set_location',
	description:
		"Record where the user is (or where they will shop and attend). Prices will be shown in this country's currency.",
	parameters: LOCATION_SCHEMA,
	strict: true,
	label: () => 'Noting where you are',
	async run(args, { ctx, session }) {
		const p = new Problems();
		const country = readString(p, args.country, 'country', { max: 80 });
		const currencyRaw = clean(args.currency)?.toUpperCase();
		if (!currencyRaw || !/^[A-Z]{3}$/.test(currencyRaw))
			p.add('currency', 'must be a 3-letter ISO 4217 code.');
		const codeRaw = clean(args.countryCode);
		if (codeRaw && !/^[A-Za-z]{2}$/.test(codeRaw)) p.add('countryCode', 'must be 2 letters.');
		p.throwIfAny('The location is not valid.');

		// "asked" when the previous assistant message was a location question, otherwise the user volunteered it.
		const prior = [...session.messages]
			.reverse()
			.find((m) => m.role === 'assistant' && m.id !== ctx.assistantMessage.id);
		const asked = Boolean(
			prior &&
			/\?/.test(prior.text) &&
			/\b(where|city|country|located|based|live)\b/i.test(prior.text)
		);

		const location: UserLocation = {
			...(clean(args.city) ? { city: clean(args.city) } : {}),
			...(clean(args.region) ? { region: clean(args.region) } : {}),
			country: country!,
			...(codeRaw ? { countryCode: codeRaw.toUpperCase() } : {}),
			currency: currencyRaw!,
			source: asked ? 'asked' : 'typed'
		};
		session.location = location;
		await ctx.sessionChanged();
		return { ok: true, location };
	}
};
