# messages

The `/api/sessions/[id]/messages` route.

**Decisions and tradeoffs:** A thin handler: it checks the request and calls into `lib/server`, where the logic and its tests live.

## Files

- [+server.ts](+server.ts): This route's API handler.

## Where to look

To find the API handler visit [+server.ts](+server.ts).
