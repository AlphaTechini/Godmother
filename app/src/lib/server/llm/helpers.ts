// Small provider-independent helpers for model output.

import type { SourceLink } from '#lib/types';
import type { RawSource } from './types';

/** Parses the JSON text of a structured answer. Throws a readable error when it is not JSON. */
export function parseJsonText(raw: string): unknown {
	const text = raw.trim();
	if (!text) throw new Error('The model returned no content.');
	try {
		return JSON.parse(text);
	} catch {
		// Tolerate a fenced block.
		const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
		if (fenced) return JSON.parse(fenced);
		throw new Error('The model returned malformed JSON.');
	}
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

/** Sources ready to show: de-duplicated by URL, http(s) only, first title wins. */
export function collectSources(sources: readonly RawSource[], max = 5): SourceLink[] {
	const out: SourceLink[] = [];
	const seen = new Set<string>();
	for (const { url, title } of sources) {
		let clean: string;
		try {
			const u = new URL(url);
			if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
			u.searchParams.delete('utm_source');
			clean = u.toString();
		} catch {
			continue;
		}
		if (seen.has(clean)) continue;
		seen.add(clean);
		out.push({ title: title?.trim() ? title.trim() : hostOf(clean), url: clean });
	}
	return out.slice(0, max);
}
