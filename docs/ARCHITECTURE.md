# Godmother: Architecture

One SvelteKit 3 app in [`app/`](../app) (Svelte 5 runes, `@sveltejs/adapter-node`, pnpm). The browser never talks to YouCam or Anthropic; every key stays on the server.

```
app/
  src/lib/types.ts              shared domain types (the contract; read this first)
  src/lib/server/
    config.ts                   env parsing (process.env), one place
    store/                      sessions + assets on disk (DATA_DIR, default ./data), copied to the cloud in the background
    db/                         optional Postgres connection (Supabase today)
    images/                     optional private image storage (Cloudinary today)
    email/                      optional email (Resend today)
    auth/                       optional accounts: Argon2id passwords, signed cookies, the access rule
    youcam/                     YouCam client: file upload, task + polling, unit ledger and cap, feature wrappers
    llm/                        provider-neutral model layer, with the one Claude adapter
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
| GET | `/api/sessions/:id/turn` | | `text/event-stream`: a `resync` frame, then live events until `done` |
| GET | `/api/assets/:id` | | image bytes. Follows its session's access rule, and only demo images cache publicly |
| GET | `/api/health` | | `{ ok, live: { llm, youcam, db, images, email, accounts }, demo }` |
| POST | `/api/auth/signup`, `/login`, `/logout`, `/forgot`, `/reset` | JSON | Account actions. See `src/lib/server/auth/README.md` |
| GET | `/api/auth/me` | | `{ accounts, passwordReset, user }` |
| GET | `/api/account/sessions` | | The signed-in account's saved sessions |
| POST | `/api/account/claim` | `{ sessionIds }` | Moves ownerless sessions into the signed-in account |

### Turn stream

One user turn = one POST to `/messages`, answered with SSE frames (`data: <json>\n\n`):

1. `message` with the stored user message, then `message` with the new empty assistant message.
2. Any number of `text_delta`, `block`, `activity`, `session` frames, in order.
3. `done` (always last; `error` before it if something failed).

The client appends deltas and blocks to the assistant message by `messageId`, replaces its session state on each `session` frame, and shows `activity` frames as live progress lines ("Trying look 2 on you…").

## Retries and resuming

- **Turn ids.** The browser picks an id for each turn and may send it again. The server attaches to a turn it already knows instead of running it twice.
- **Reattaching.** A turn runs apart from its request. `GET /api/sessions/:id/turn` sends a `resync` frame with the state now, then live events until `done`. The browser reconnects with backoff for about two minutes after a dropped stream, and on load if a turn is running. See [session.svelte.ts](../app/src/lib/client/session.svelte.ts) and [turn-hub.ts](../app/src/lib/server/turn-hub.ts).
- **Interruptions.** Live turns are in memory, so a restart ends them. `session.turn` still says running, and the next read marks it interrupted and clears stuck render steps. The browser offers to continue, which is an ordinary new turn. See [turn-recovery.ts](../app/src/lib/server/turn-recovery.ts).
- **No double charge.** Each YouCam task and result is saved as it happens. After an interruption the same request follows its running task or reuses its result. The record is cleared when a turn finishes, so asking for a fresh render in a normal turn still makes a new one. See [task-journal.ts](../app/src/lib/server/youcam/task-journal.ts).
- **Claude.** The SDK retries failed starts. A reply that breaks partway is retried up to three times, and a `text_reset` frame takes back what it had written.
- **YouCam.** Polls and downloads retry. Creating a task retries only on 429 and 503, where nothing started. Any other failure may have started a task that charges, so it is never repeated automatically.
- **Tradeoff.** On Cloud Run the CPU is throttled while nobody is connected, so a turn may pause until the browser reconnects. If the instance shuts down first, the turn is interrupted and can be continued. Always-on CPU would avoid the pause but costs money while idle.

## Agent

Anthropic Messages API with streaming, tools and the built-in web search tool, behind the provider-neutral layer in [`app/src/lib/server/llm/`](../app/src/lib/server/llm). One turn loops model → tool calls → tool outputs → model until the model answers without tool calls. Tools mutate the session, emit blocks, and push `session` snapshots. See [`app/src/lib/server/agent/`](../app/src/lib/server/agent).

Priority rules (PRD §3): a stated dress code overrides everything, then event colours and theme, then location and culture, then the user's taste.

## YouCam

`src/lib/server/youcam/` wraps the File API, task creation and polling, and keeps a per-session unit ledger. A task refuses to start if it would push the session over `UNIT_CAP_PER_SESSION`. Every result is downloaded into the asset store immediately (result URLs expire after 2 hours). See [API-NOTES.md](API-NOTES.md) for endpoints and payloads.

Unit-saving rules (PRD §7): only the outfit is rendered for all three looks; shoes, makeup, hair and accessories only for the chosen look; face analysis once per session.

## Demo mode

`mode: 'demo'` sessions never call Anthropic or YouCam. Each user turn plays the next recorded turn from `app/demo/script.json` (events with their original timing, assets from `app/demo/assets/`). Live sessions are recorded to `DATA_DIR/sessions/:id/`; `pnpm demo:export <sessionId>` turns one into the demo fixture.
