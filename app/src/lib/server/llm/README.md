# llm: the model layer

The agent talks to language models only through the small contract in [types.ts](types.ts). Only [anthropic.ts](anthropic.ts) imports a provider SDK, so changing provider means writing one new adapter and pointing [index.ts](index.ts) at it. The agent loop, tools and tests stay as they are.

## Decisions and tradeoffs

- **Two calls, not a generic chat API.** `conversation()` streams a turn with tools, and `ask()` returns one structured answer, optionally researched on the web. That is all the agent needs. The tradeoff is that a new feature with a different shape has to extend the contract.
- **The adapter owns the message history inside a turn.** Providers keep tool-call state differently (Claude needs thinking blocks replayed unchanged, for example), so the loop only hands over tool outputs. Across turns nothing is kept: `agent/history.ts` rebuilds the input from the session as plain text, so saved sessions are not tied to a provider.
- **The system prompt has a stable part and a volatile part.** CURRENT STATE changes every round, so only the stable part and the tools are cached.
- **Tools are sent without Claude's strict mode.** Its limits on union types rule out these schemas, and the makeup schema uses numeric bounds it rejects. Every tool validates its own arguments and returns fixable errors to the model, so nothing goes unchecked, but a malformed call costs one extra round.
- **Visible replies come after the last tool call.** Claude Sonnet 5.5 can return longer text written before a tool call as a hidden thinking block, so the system prompt asks for `suggest_replies` first and the message after it.

## Claude-specific lock-in

All of it stays inside [anthropic.ts](anthropic.ts): adaptive thinking with `drop_block` (beta `thinking-binding-controls-2026-08-01`), the server-side refusal fallback on the main model (beta `server-side-fallback-2026-07-01`, which only retries the `cyber` and `frontier_llm` categories), prompt caching, and the `web_search_20260209` tool. A new adapter would have to provide its own web search.

Web search rejects some countries, including Nigeria, and the API publishes no list. The adapter retries once without the country and keeps the city, so results lean on the location written in the prompt. Search runs directly rather than through code-based filtering: in live runs, filtering used up the search limit and was slower, with no more results.

## Where things are

- To find the provider-neutral contract visit [types.ts](types.ts).
- To find the Claude API calls, streaming, web search and refusal handling visit [anthropic.ts](anthropic.ts).
- To find which provider is active, and how tests inject a fake, visit [index.ts](index.ts).
- To find how stored photos and PDFs become model input visit [media.ts](media.ts).
- To find JSON parsing and source clean-up visit [helpers.ts](helpers.ts).
- The Anthropic connection settings can be found in [config.ts](../config.ts).
- The agent loop that uses this layer can be found in [loop.ts](../agent/loop.ts).
