# lib

Code shared by pages and server, imported through `#lib`.

**Decisions and tradeoffs:** `types.ts` is the single contract between server and UI, so a change to it shows up as type errors on both sides.

## Files

- [index.ts](index.ts)
- [types.ts](types.ts): Shared domain types.

## Where to look

To find the types logic visit [types.ts](types.ts).

## Folders

- [client](client/README.md)
- [components](components/README.md)
- [server](server/README.md)
