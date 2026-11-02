# src

The SvelteKit source: shell, global styles and server hooks.

**Decisions and tradeoffs:** One codebase builds two ways, static pages for Vercel and a Node server for Cloud Run, so pages and API stay in step at the cost of two deploys.

## Files

- [app.css](app.css): Design tokens and global styles for both themes.
- [app.d.ts](app.d.ts)
- [app.html](app.html): The HTML shell, including the saved theme applied before first paint.
- [hooks.server.ts](hooks.server.ts): Runs before each API request: the Cloudflare lock and the session cookie.

## Where to look

To find the app logic visit [app.css](app.css).

To find the app logic visit [app.html](app.html).

To find the hooks.server logic visit [hooks.server.ts](hooks.server.ts).

## Folders

- [lib](lib/README.md)
- [routes](routes/README.md)
