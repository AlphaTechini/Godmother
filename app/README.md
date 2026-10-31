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
| `pnpm db:migrate`              | Applies `db/migrations` to `DATABASE_URL`. Run once after setting it, and after adding a migration              |
| `pnpm demo:build`              | Regenerates `demo/script.json` from the illustrated UI fixtures                                                 |
| `pnpm demo:export <sessionId>` | Turns a recorded live session into the demo script and copies its images (see [demo/README.md](demo/README.md)) |

Requires Node.js 22.17 or newer.

## Deployment

Live at https://godmother.cyberpunkinc.xyz. One codebase is built two ways:

- **Pages on Vercel:** `DEPLOY_TARGET=static` builds static files with no server code or secrets. [vercel.json](vercel.json) proxies `/api/*` to Cloud Run, so the login cookie stays first-party. Deploy from `app/` with `vercel deploy --prod`.
- **API on Cloud Run:** the [Dockerfile](Dockerfile) builds the Node server. Project `godmother-cyberpunk`, service `godmother-api`, region `europe-west1`. Deploy from `app/` with `gcloud run deploy godmother-api --source . --project godmother-cyberpunk --region europe-west1`. Existing settings carry over.
- **DNS:** a proxied Cloudflare CNAME from `godmother` to `godmother-six.vercel.app`.

Decisions and tradeoffs:

- **First generation, 1 vCPU, 1 GiB, 0 to 1 instances.** It starts on request and costs nothing while idle. First generation has the faster cold start, and one instance keeps the in-memory locks and rate limits correct and limits the spend.
- **Requests finish their cloud saves before closing,** because request billing throttles the CPU once a response ends. See [cloud-wait.ts](src/lib/server/store/cloud-wait.ts).
- **A turn may pause if the browser disconnects,** for the same reason. It carries on when the browser reconnects, and can be continued if the instance shut down meanwhile. See "Retries and resuming" in [ARCHITECTURE.md](../docs/ARCHITECTURE.md). Instance billing would avoid the pause but charges while idle.
- **Local files live in memory and vanish on shutdown.** Cloud copies are the durable ones, so changes that couldn't reach the cloud during an outage are lost if the instance then shuts down.
- **Upload origins are fixed at build time** by `TRUSTED_ORIGINS` in the Dockerfile. Adding a domain means rebuilding the API.
- **`ADDRESS_HEADER=cf-connecting-ip`** gives rate limits the visitor's address. Someone calling the `run.app` address directly could fake it, which is why the API refuses direct calls (see below). Limits also count per browser (see [auth/README.md](src/lib/server/auth/README.md)).
- **Settings are plain environment variables on the Cloud Run service,** with no Secret Manager and nothing extra to pay for. The tradeoff is that anyone given access to the project can read them, so keep project access limited to the owner. To change one without rebuilding: `gcloud run services update godmother-api --update-env-vars NAME=value --project godmother-cyberpunk --region europe-west1`.
- **Units are limited per person, not per session.** See [units/README.md](src/lib/server/units/README.md).
- **The API only answers requests that came through Cloudflare.** A Cloudflare rule adds a secret header to requests for the site's host, and `EDGE_SECRET_HASH` holds only its SHA-256, so the secret isn't in this repo or the config. Direct calls to the `run.app` or `vercel.app` address get a 404, which is what stops people faking their address. See [edge.ts](src/lib/server/auth/edge.ts).

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
| `DATA_DIR`                       | `./data`                                      | The working copy of sessions and assets                                                           |
| `DATABASE_URL`                   | none                                          | Postgres, to save live sessions. On Supabase use the Session pooler with `sslmode=require`        |
| `DATABASE_CA_CERT`               | none                                          | Optional CA certificate, to verify the database server as well as encrypt                         |
| `CLOUDINARY_CLOUD_NAME`          | none                                          | With the two below, saves private copies of images                                                |
| `CLOUDINARY_API_KEY`             | none                                          | Cloudinary key                                                                                    |
| `CLOUDINARY_API_SECRET`          | none                                          | Cloudinary secret                                                                                 |
| `AUTH_SECRET`                    | none                                          | Signs login cookies, at least 32 characters. With `DATABASE_URL`, turns accounts on               |
| `RESEND_API_KEY`                 | none                                          | With `EMAIL_FROM`, turns on password reset emails                                                 |
| `EMAIL_FROM`                     | none                                          | Sender address. Real users need a domain verified in Resend                                       |
| `APP_URL`                        | request origin                                | Public address used in reset links. Set this in production                                        |
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
    store/                sessions and assets on disk (DATA_DIR), copied to the cloud in the background
    db/                   Postgres connection (optional)
    images/               Cloudinary image storage (optional)
    email/                Resend email (optional)
    auth/                 optional accounts: passwords, cookies, access rule
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
