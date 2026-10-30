// The provider-neutral contract the agent talks to. No SDK types here: an adapter translates these
// to and from one provider's API, so changing provider means writing one new adapter file.

/** main: the agent and web research. fast: cheap per-photo checks. */
export type ModelTier = 'main' | 'fast';

export type InputPart =
	| { type: 'text'; text: string }
	| { type: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string }
	| { type: 'pdf'; base64: string; filename?: string };

export interface InputMessage {
	role: 'user' | 'assistant';
	content: string | InputPart[];
}

export interface ToolSpec {
	name: string;
	description: string;
	/** JSON Schema for the arguments. */
	parameters: Record<string, unknown>;
	/** The schema is written for strict validation. Adapters may ignore this; tools validate anyway. */
	strict: boolean;
}

export interface ToolCall {
	id: string;
	name: string;
	/** The arguments as a JSON string. */
	arguments: string;
}

export interface ToolResult {
	callId: string;
	output: string;
}

/** Split so an adapter can cache the part that never changes. */
export interface SystemPrompt {
	stable: string;
	volatile?: string;
}

export interface RoundResult {
	/** Empty when the model has finished. */
	calls: ToolCall[];
	/** The provider's safety checks declined this round. */
	refused: boolean;
}

/** One user turn's exchange. The adapter owns the provider's message history between rounds. */
export interface Conversation {
	/** Streams one model round. The system prompt can change between rounds, because tools change state. */
	next(system: SystemPrompt, onText: (delta: string) => void): Promise<RoundResult>;
	/** The outputs for every call of the previous round. */
	submitToolResults(results: ToolResult[]): void;
}

export interface WebSearchLocation {
	city?: string;
	region?: string;
	/** ISO 3166-1 alpha-2. */
	country?: string;
}

export interface AskRequest {
	tier: ModelTier;
	system?: string;
	input: string | InputPart[];
	/** JSON Schema the answer must follow. */
	schema: Record<string, unknown>;
	webSearch?: { userLocation?: WebSearchLocation };
}

export interface RawSource {
	url: string;
	title?: string;
}

export interface AskResult {
	json: unknown;
	/** Web pages behind the answer, unfiltered. Empty without web search. */
	sources: RawSource[];
}

export interface ModelClient {
	conversation(opts: { input: InputMessage[]; tools: ToolSpec[] }): Conversation;
	/** One structured answer, optionally researched on the web. */
	ask(request: AskRequest): Promise<AskResult>;
}
