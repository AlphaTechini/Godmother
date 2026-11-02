# routes

Pages and API routes.

**Decisions and tradeoffs:** Pages run in the browser and reach the server through `/api`, so they can be hosted as static files.

## Files

- [+layout.svelte](+layout.svelte): The shell around every page.
- [+layout.ts](+layout.ts): The pages run in the browser and reach the server through /api, so they can be hosted as static files.
- [+page.svelte](+page.svelte): This route's page.
- [+page.ts](+page.ts): This route's page options and loader.

## Where to look

To find the layout visit [+layout.svelte](+layout.svelte).

To find the layout visit [+layout.ts](+layout.ts).

To find the page visit [+page.svelte](+page.svelte).

To find the page visit [+page.ts](+page.ts).

## Folders

- [account](account/README.md)
- [api](api/README.md)
- [dev](dev/README.md)
- [studio](studio/README.md)
