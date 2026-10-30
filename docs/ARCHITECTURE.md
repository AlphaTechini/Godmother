# Godmother: Architecture

One SvelteKit 3 app in [`app/`](../app) (Svelte 5 runes, `@sveltejs/adapter-node`, pnpm). The browser never talks to YouCam or OpenAI; every key stays on the server.

```
app/
  src/lib/types.ts              shared domain types (the contract; read this first)
  src/lib/server/
    config.ts                   env parsing (process.env), one place
    store/                      sessions + assets on disk (DATA_DIR, default ./data)
    youcam/                     YouCam client: file upload, task + polling, unit ledger and cap, feature wrappers
    openai/                     OpenAI client (Responses API)
    agent/                      the Godmother agent: system prompt, tools, turn loop
    shop/                       product page fetcher (og:image, JSON-LD price)
    demo/                       demo mode: replays a recorded session without spending units
  src/lib/client/               browser-side session store and SSE client
  src/lib/components/           UI components
  src/routes/                   pages (+page.svelte) and API (api/**/+server.ts)
  demo/                         demo fixture (script.json + assets/)
```

## Conventions

- Imports use subpath imports: `#lib/types`, `#lib/server/...` (SvelteKit 3 replaces `$lib`).
- Server env is read only in `src/lib/server/config.ts` via `process.env` (dotenv loaded there). No `$env/*` imports.
- Server-only code lives under `src/lib/server/` so it can never be bundled into the client.
- Tests: vitest, files `src/**/*.test.ts`. Network calls are mocked; nothing in tests spends units.
- Formatting: prettier (tabs, single quotes). Run `pnpm format`.
- Gates before any commit: `pnpm check`, `pnpm test`, `pnpm build`.

## HTTP API

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/sessions` | `{ mode: 'live' \| 'demo' }` | `Session` |
| GET | `/api/sessions/:id` | | `Session` |
| POST | `/api/sessions/:id/assets` | multipart: `file`, `purpose` (`AttachmentPurpose`) | `Asset`. Photo purposes (`fullBody`, `portrait`, `hand`) also fill `session.photos`. |
| POST | `/api/sessions/:id/messages` | `{ text: string, attachments: { assetId, purpose }[], action?: UserAction }` | `text/event-stream` of `StreamEvent` |
| GET | `/api/assets/:id` | | image bytes, long cache |
| GET | `/api/health` | | `{ ok, live: { openai, youcam }, demo }` |

### Turn stream

One user turn = one POST to `/messages`, answered with SSE frames (`data: <json>\n\n`):

1. `message` with the stored user message, then `message` with the new empty assistant message.
2. Any number of `text_delta`, `block`, `activity`, `session` frames, in order.
3. `done` (always last; `error` before it if something failed).

The client appends deltas and blocks to the assistant message by `messageId`, replaces its session state on each `session` frame, and shows `activity` frames as live progress lines ("Trying look 2 on you…").

## Agent

OpenAI Responses API with streaming, function tools and the built-in web search tool. One turn loops model → tool calls → tool outputs → model until the model answers without tool calls. Tools mutate the session, emit blocks, and push `session` snapshots. See [`app/src/lib/server/agent/`](../app/src/lib/server/agent).

Priority rules (PRD §3): a stated dress code overrides everything, then event colours and theme, then location and culture, then the user's taste.

## YouCam

`src/lib/server/youcam/` wraps the File API, task creation and polling, and keeps a per-session unit ledger. A task refuses to start if it would push the session over `UNIT_CAP_PER_SESSION`. Every result is downloaded into the asset store immediately (result URLs expire after 2 hours). See [API-NOTES.md](API-NOTES.md) for endpoints and payloads.

Unit-saving rules (PRD §7): only the outfit is rendered for all three looks; shoes, makeup, hair and accessories only for the chosen look; face analysis once per session.

## Demo mode

`mode: 'demo'` sessions never call OpenAI or YouCam. Each user turn plays the next recorded turn from `app/demo/script.json` (events with their original timing, assets from `app/demo/assets/`). Live sessions are recorded to `DATA_DIR/sessions/:id/`; `pnpm demo:export <sessionId>` turns one into the demo fixture.
