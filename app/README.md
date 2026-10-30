# Godmother app

SvelteKit 3 (Svelte 5, runes) on `adapter-node`, managed with pnpm. This is the developer reference. For what the product does, the YouCam APIs and how to run the demo, see the [root README](../README.md).

## Scripts

Run these from `app/`.

| Script                         | What it does                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | Vite dev server with hot reload                                                                                 |
| `pnpm build`                   | Production build into `build/` (adapter-node)                                                                   |
| `pnpm start`                   | Runs `build/` with Node, loading `.env` if present                                                              |
| `pnpm preview`                 | Vite preview of the build                                                                                       |
| `pnpm check`                   | `svelte-kit sync` then `svelte-check` (types and Svelte diagnostics)                                            |
| `pnpm test`                    | Vitest, single run (193 tests). `pnpm test:unit` is the watch-mode version                                      |
| `pnpm lint`                    | Prettier check (`prettier --check .`)                                                                           |
| `pnpm format`                  | Prettier write                                                                                                  |
| `pnpm demo:build`              | Regenerates `demo/script.json` from the illustrated UI fixtures                                                 |
| `pnpm demo:export <sessionId>` | Turns a recorded live session into the demo script and copies its images (see [demo/README.md](demo/README.md)) |

Requires Node.js 22.17 or newer.

## Environment variables

Copy `.env.example` to `.env` (git-ignored). Everything is read in `src/lib/server/config.ts`.

| Variable                         | Default                                       | Purpose                                                                                           |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`              | none                                          | Enables live agent sessions. Without it, live sessions report missing keys; demo mode still works |
| `ANTHROPIC_MODEL`                | `claude-sonnet-5-5`                           | Main agent and web research model                                                                 |
| `ANTHROPIC_FAST_MODEL`           | `claude-haiku-5-5`                            | Cheaper model for per-photo checks                                                                |
| `ANTHROPIC_EFFORT`               | `medium`                                      | How hard the agent thinks per step: `low`, `medium` or `high`                                     |
| `YOUCAM_API_KEY`                 | none                                          | Enables live try-on, makeup, hair, jewellery and analysis                                         |
| `YOUCAM_API_BASE`                | `https://yce-api-01.makeupar.com`             | YouCam origin, no trailing slash                                                                  |
| `CLOTH_ENDPOINT`                 | `cloth-v4`                                    | Clothes try-on endpoint                                                                           |
| `YOUCAM_CHAIN_MODE`              | `reupload`                                    | How chained renders pass the previous result on: `reupload` (download and re-upload) or `url`     |
| `YOUCAM_POLL_INTERVAL_MS`        | `3000`                                        | Task polling interval                                                                             |
| `YOUCAM_POLL_TIMEOUT_MS`         | `300000`                                      | Poll timeout per task                                                                             |
| `UNIT_CAP_PER_SESSION`           | `60`                                          | Maximum YouCam units one session may spend                                                        |
| `DATA_DIR`                       | `./data`                                      | Where sessions and assets are stored                                                              |
| `BODY_SIZE_LIMIT`                | `12M`                                         | Read by adapter-node at runtime. Uploads are up to 10 MB, but adapter-node defaults to 512K       |
| `PROTOCOL_HEADER`, `HOST_HEADER` | unset                                         | Set to `x-forwarded-proto` and `x-forwarded-host` behind a TLS proxy                              |
| `TRUSTED_ORIGINS`                | `http://localhost:3000,http://localhost:4173` | Origins allowed to upload. Read at **build** time (`vite.config.ts`)                              |
| `PORT`                           | `3000`                                        | Port for `pnpm start`                                                                             |

## Folder map

```
app/
  src/lib/types.ts        shared domain types (the contract)
  src/lib/server/
    config.ts             env parsing, the only reader of process.env
    store/                sessions and assets on disk (DATA_DIR)
    youcam/               YouCam client: file upload, tasks and polling,
                          unit ledger and cap, rate limiter, feature wrappers
    llm/                  provider-neutral model layer, with the one Claude adapter
    agent/                the Godmother agent: system prompt, tools, turn loop
    shop/                 product page fetcher (og:image, JSON-LD price)
    demo/                 demo mode: replays a recorded session, no units
  src/lib/client/         browser session store and SSE client
  src/lib/components/     UI components
  src/routes/             pages (+page.svelte) and API (api/**/+server.ts)
  demo/                   demo script (script.json) and assets/ (exported run images)
  static/demo/            SVG imagery used by the illustrated demo
  static/landing/         AI-generated images used by the landing page
  scripts/                build-demo-script.ts, export-demo.ts
```

Conventions: subpath imports (`#lib/...`), server-only code under `src/lib/server/`, tests as `src/**/*.test.ts` with mocked network. Full notes in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
