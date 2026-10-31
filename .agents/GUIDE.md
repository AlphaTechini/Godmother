# Project guide

Decisions agreed for this project. Check these before making new ones.

## Model provider (2026-10-30)

- The agent runs on Anthropic Claude: `claude-sonnet-5-5` for the agent and web research, `claude-haiku-5-5` for per-photo checks. The user chose Sonnet over Opus for cost.
- Provider code sits behind `app/src/lib/server/llm/`. Only `anthropic.ts` imports the SDK. See the README in that folder.
- OpenAI was removed because the account was low on credit. It never generated images: every image comes from YouCam.

## Brand and images (2026-10-30)

- The logo is a glass slipper with two sparkles, for the Cinderella link. It lives in `app/src/lib/components/ui/Wordmark.svelte` and `app/static/favicon.svg`.
- The landing page uses AI-generated images of fictional people in `app/static/landing/`, labelled as illustrative because they are not try-on output. Full-size originals stay in the git-ignored `pics/` folder.
- Demo mode keeps its illustrated SVG figures.

## Portrait panel (2026-10-30)

- `finish_look` tries the look's top, dress and outer pieces on the portrait before makeup, adding 2 units per piece. Bottoms are skipped. A live test on a chest-up portrait kept the face sharp and matched the neckline.
- If that fails, the backup is a head-and-shoulders crop of the full-look render (`tools/portrait-crop.ts`), found with the fast model. If that fails too, makeup goes on the plain portrait.

## Saved sessions and accounts (built 2026-10-30)

- Database: Supabase free tier through a plain `pg` connection. Images: Cloudinary with authenticated delivery. They stay separate so one going down doesn't take the other with it.
- Local disk stays the working copy and the cloud copy happens in the background, so an outage never stops a session. Without the keys the app behaves as it did before.
- Login is optional. Guests keep using the app, and signing in moves this browser's guest sessions into the account.
- Images are private: browsers only reach them through `/api/assets/:id`, which checks access and answers with private caching.
- Auth is ours, with Argon2id, not Supabase Auth. Resend sends reset emails. There is no email verification at sign-up, by choice, to save time.
- The login cookie is signed, so people stay signed in during a database outage. New logins need the database.
- One server is assumed. See `app/src/lib/server/store/README.md`.
- Supabase project: `Godmother` (`vfkooclnmzsxywitdacs`, `eu-west-1`), in AlphaTechini's Org. The app connects as its own `godmother_app` role through the Session pooler (`aws-0-eu-west-1`), not as `postgres`. That role owns the tables, so row level security with no policies still lets the app in and keeps Supabase's public API out.

## Deployment (2026-10-31)

- The user chose Cloud Run for the API and Vercel for the pages, with a Cloudflare CNAME. Details and tradeoffs are in `app/README.md`.
- Spending stays near the free tier: scale to zero, max one instance, and a $0.50 budget alert on the billing account. Budgets only alert, they don't cap.
- `gcloud billing budgets` reads `0.50USD` as 50 nanos. Use `0.500000000USD`.
- Settings are plain Cloud Run environment variables, by the user's choice, not Secret Manager. Nothing should add Secret Manager cost.
- Units: guests get 50 once for good, tracked by browser and address. Signed-in users get 60 and may claim a fresh 60 once a UTC day, only by asking, and unused units don't stack.
- adapter-node 6 has no `ORIGIN` setting. Use `TRUSTED_ORIGINS` at build time.

## Keys and environment

- The app reads only `app/.env`: `ANTHROPIC_API_KEY` and `YOUCAM_API_KEY`. The repo-root `.env` holds the user's YouCam dashboard credentials as `API_KEY` and `SECRET_KEY`. `SECRET_KEY` is unused because YouCam takes a Bearer key only.
- Never read a real `.env`. Move values with a script that does not print them.

## Dependencies

- pnpm 11 enforces a 24-hour minimum release age, and the lockfile was rebuilt to satisfy it rather than exempting packages.
- `allowBuilds: esbuild: true` is required on pnpm 11. `onlyBuiltDependencies` is kept for pnpm 10 users.
- The low-severity `deepmerge` advisory GHSA-gcqx-w48m-w2h4 is accepted: no patch exists, and only build tooling uses it.

## Tests

- `looks.test.ts` "renders all three looks in parallel" is timing-sensitive and can fail in the default parallel run on a loaded machine. Use `--no-file-parallelism` to rule that out before treating it as a regression.
- Use `pnpm test:unit --run`. The `test` script calls npm.
