// OpenAI access behind a tiny interface, so the agent can be tested with a scripted fake.
// Only this folder imports the `openai` package at runtime.

import OpenAI from 'openai';
import type {
	Response,
	ResponseCreateParamsNonStreaming,
	ResponseCreateParamsStreaming,
	ResponseStreamEvent
} from 'openai/resources/responses/responses';
import { config } from '#lib/server/config';
import type { SourceLink } from '#lib/types';

export type {
	Response,
	ResponseCreateParamsNonStreaming,
	ResponseCreateParamsStreaming,
	ResponseStreamEvent
};
export type {
	ResponseInputContent,
	ResponseInputItem,
	Tool
} from 'openai/resources/responses/responses';
export { assetInputPart } from './vision';

/** What the agent needs from OpenAI: one streaming call and one plain call. */
export interface ModelClient {
	/** A streaming Responses call. Yields the SDK's stream events. */
	stream(params: ResponseCreateParamsStreaming): Promise<AsyncIterable<ResponseStreamEvent>>;
	/** A plain Responses call (research, product search, vision classification). */
	respond(params: ResponseCreateParamsNonStreaming): Promise<Response>;
}

export function createOpenAIClient(apiKey: string | undefined = config.openai.apiKey): ModelClient {
	const sdk = new OpenAI({ apiKey, maxRetries: 2, timeout: 120_000 });
	return {
		stream: (params) => sdk.responses.create(params),
		respond: (params) => sdk.responses.create(params)
	};
}

let override: ModelClient | null = null;
let shared: ModelClient | null = null;

/** The client every agent call uses. Created lazily so importing this module never needs a key. */
export function getModelClient(): ModelClient {
	if (override) return override;
	shared ??= createOpenAIClient();
	return shared;
}

/** Tests inject a fake here; pass null to go back to the real client. */
export function setModelClient(client: ModelClient | null): void {
	override = client;
}

/* ----------------------------------------------------------- response helpers */

type OutputPart = { type?: string; text?: string; annotations?: unknown[] };
type OutputItem = { type?: string; content?: OutputPart[]; action?: unknown };

function messageParts(response: Response): OutputPart[] {
	const parts: OutputPart[] = [];
	for (const item of (response.output ?? []) as OutputItem[]) {
		if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
		for (const part of item.content) if (part?.type === 'output_text') parts.push(part);
	}
	return parts;
}

/** The text of a finished response. */
export function outputText(response: Response): string {
	if (typeof response.output_text === 'string' && response.output_text) return response.output_text;
	return messageParts(response)
		.map((p) => p.text ?? '')
		.join('');
}

/** Parses the JSON text of a structured-output response. Throws a readable error when it is not JSON. */
export function parseJsonOutput(response: Response): unknown {
	const text = outputText(response).trim();
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

/**
 * Web sources behind a response: url_citation annotations first (they have titles), then the
 * consulted pages from web_search_call items. De-duplicated by URL, http(s) only.
 */
export function collectSources(response: Response, max = 5): SourceLink[] {
	const out: SourceLink[] = [];
	const seen = new Set<string>();
	const add = (url: unknown, title: unknown) => {
		if (typeof url !== 'string') return;
		let clean: string;
		try {
			const u = new URL(url);
			if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
			u.searchParams.delete('utm_source');
			clean = u.toString();
		} catch {
			return;
		}
		if (seen.has(clean)) return;
		seen.add(clean);
		out.push({ title: typeof title === 'string' && title.trim() ? title.trim() : hostOf(clean), url: clean });
	};
	for (const part of messageParts(response)) {
		for (const a of part.annotations ?? []) {
			const ann = a as { type?: string; url?: string; title?: string };
			if (ann?.type === 'url_citation') add(ann.url, ann.title);
		}
	}
	for (const item of (response.output ?? []) as OutputItem[]) {
		if (item?.type !== 'web_search_call') continue;
		const action = item.action as { sources?: { url?: string }[] } | undefined;
		for (const s of action?.sources ?? []) add(s?.url, undefined);
	}
	return out.slice(0, max);
}

/** `text` option for a strict JSON-schema structured output. */
export function jsonSchemaFormat(name: string, schema: Record<string, unknown>) {
	return { format: { type: 'json_schema' as const, name, strict: true, schema } };
}
