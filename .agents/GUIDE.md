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
