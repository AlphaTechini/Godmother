// The Claude adapter. Everything specific to the Anthropic API lives in this one file.

import Anthropic from '@anthropic-ai/sdk';
import { config } from '#lib/server/config';
import { parseJsonText } from './helpers';
import type {
	AskRequest,
	AskResult,
	Conversation,
	InputMessage,
	InputPart,
	ModelClient,
	RawSource,
	ToolResult,
	ToolSpec,
	WebSearchLocation
} from './types';

const AGENT_MAX_TOKENS = 16_000;
const ASK_MAX_TOKENS = 16_000;
const REQUEST_TIMEOUT_MS = 180_000;
const WEB_SEARCHES_PER_ASK = 5;
/** A long web search can pause mid-response and has to be resumed. */
const MAX_PAUSE_RESUMES = 4;

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const BINDING_BETA = 'thinking-binding-controls-2026-08-01';

type Message = Anthropic.Beta.BetaMessageParam;
type ContentPart = Anthropic.Beta.BetaContentBlockParam;

function toPart(part: InputPart): ContentPart {
	switch (part.type) {
		case 'text':
			return { type: 'text', text: part.text };
		case 'image':
			return {
				type: 'image',
				source: { type: 'base64', media_type: part.mediaType, data: part.base64 }
			};
		case 'pdf':
			return {
				type: 'document',
				source: { type: 'base64', media_type: 'application/pdf', data: part.base64 },
				...(part.filename ? { title: part.filename } : {})
			};
	}
}

const toContent = (content: string | InputPart[]): string | ContentPart[] =>
	typeof content === 'string' ? content : content.map(toPart);

function toMessages(input: readonly InputMessage[]): Message[] {
	// The API needs a user message first, and the history window can start on an assistant one.
	const first = input.findIndex((m) => m.role === 'user');
	return input.slice(Math.max(first, 0)).map((m) => ({
		role: m.role,
		content: toContent(m.content)
	}));
}

/** Pages from search results and citations. A failed search returns an object instead of a list. */
function sourcesIn(content: readonly Anthropic.Beta.BetaContentBlock[]): RawSource[] {
	const out: RawSource[] = [];
	for (const block of content) {
		if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
			for (const r of block.content) out.push({ url: r.url, title: r.title });
		} else if (block.type === 'text') {
			for (const c of block.citations ?? []) {
				if (c.type === 'web_search_result_location') {
					out.push({ url: c.url, ...(c.title ? { title: c.title } : {}) });
				}
			}
		}
	}
	return out;
}

const textIn = (content: readonly Anthropic.Beta.BetaContentBlock[]): string =>
	content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');

/** Countries web search refused this run. The API publishes no list, so we learn them as we go. */
const unsupportedCountries = new Set<string>();

function searchLocation(location: WebSearchLocation | undefined) {
	if (!location) return undefined;
	const { country, ...rest } = location;
	const kept = country && !unsupportedCountries.has(country) ? location : rest;
	return Object.keys(kept).length > 0 ? { type: 'approximate' as const, ...kept } : undefined;
}

export function createAnthropicClient(apiKey: string | undefined = config.llm.apiKey): ModelClient {
	const sdk = new Anthropic({ apiKey, maxRetries: 2, timeout: REQUEST_TIMEOUT_MS });

	return {
		conversation({ input, tools }: { input: InputMessage[]; tools: ToolSpec[] }): Conversation {
			const messages = toMessages(input);
			// Sent without strict mode: its limits on union types rule out these schemas, and the makeup
			// schema uses numeric bounds it rejects. Every tool validates its own arguments anyway.
			const toolDefs = tools.map((t) => ({
				name: t.name,
				description: t.description,
				input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema
			}));

			return {
				async next(system, onText) {
					const stream = sdk.beta.messages.stream({
						model: config.llm.model,
						max_tokens: AGENT_MAX_TOKENS,
						betas: [FALLBACK_BETA, BINDING_BETA],
						fallbacks: 'default',
						system: [
							{ type: 'text', text: system.stable, cache_control: { type: 'ephemeral' } },
							...(system.volatile ? [{ type: 'text' as const, text: system.volatile }] : [])
						],
						tools: toolDefs,
						messages,
						// The state in the system prompt changes between rounds, which would otherwise reject
						// the thinking blocks replayed from earlier rounds.
						thinking: {
							type: 'adaptive',
							block_binding: { prefix_mismatch_behavior: 'drop_block' }
						},
						output_config: { effort: config.llm.effort }
					});

					for await (const event of stream) {
						if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
							onText(event.delta.text);
						}
					}
					const message = await stream.finalMessage();
					if (message.stop_reason === 'refusal') return { calls: [], refused: true };

					const calls = message.content.flatMap((b) =>
						b.type === 'tool_use'
							? [{ id: b.id, name: b.name, arguments: JSON.stringify(b.input) }]
							: []
					);
					if (calls.length > 0 && message.stop_reason === 'max_tokens') {
						// A cut-off tool input can still look valid, so never run it.
						throw new Error('The model ran out of room while calling a tool.');
					}
					messages.push({ role: 'assistant', content: message.content as ContentPart[] });
					return { calls, refused: false };
				},

				submitToolResults(results: ToolResult[]) {
					messages.push({
						role: 'user',
						content: results.map((r) => ({
							type: 'tool_result' as const,
							tool_use_id: r.callId,
							content: r.output
						}))
					});
				}
			};
		},

		async ask(request: AskRequest): Promise<AskResult> {
			const main = request.tier === 'main';
			const location = request.webSearch?.userLocation;
			const messages: Message[] = [{ role: 'user', content: toContent(request.input) }];
			const sources: RawSource[] = [];

			const send = () => {
				const userLocation = searchLocation(location);
				return sdk.beta.messages.create({
					model: main ? config.llm.model : config.llm.fastModel,
					max_tokens: ASK_MAX_TOKENS,
					// The fast model has no server-side fallback.
					...(main ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
					...(request.system ? { system: request.system } : {}),
					...(request.webSearch
						? {
								tools: [
									{
										type: 'web_search_20260209' as const,
										name: 'web_search' as const,
										max_uses: WEB_SEARCHES_PER_ASK,
										// Without this, code-based filtering can use up max_uses and return nothing.
										allowed_callers: ['direct' as const],
										...(userLocation ? { user_location: userLocation } : {})
									}
								]
							}
						: {}),
					messages,
					output_config: {
						effort: 'low',
						format: { type: 'json_schema', schema: request.schema }
					}
				});
			};

			for (let attempt = 0; attempt <= MAX_PAUSE_RESUMES; attempt++) {
				let res: Awaited<ReturnType<typeof send>>;
				try {
					res = await send();
				} catch (err) {
					// The error text is the only signal for this. Retry without the country, keeping the city.
					const country = location?.country;
					if (
						!country ||
						unsupportedCountries.has(country) ||
						!(err instanceof Anthropic.BadRequestError) ||
						!/country code/i.test(err.message)
					) {
						throw err;
					}
					console.warn(
						`[llm] web search does not support country ${country}; searching without it`
					);
					unsupportedCountries.add(country);
					res = await send();
				}
				sources.push(...sourcesIn(res.content));
				if (res.stop_reason === 'refusal') throw new Error('The model declined this request.');
				if (res.stop_reason === 'pause_turn') {
					messages.push({ role: 'assistant', content: res.content as ContentPart[] });
					continue;
				}
				return { json: parseJsonText(textIn(res.content)), sources };
			}
			throw new Error('The web search did not finish.');
		}
	};
}
