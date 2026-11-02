# demo

Server-side replay of a scripted run, with no model or YouCam calls.

**Decisions and tradeoffs:** Lets the whole flow run without keys, at the cost of showing illustrated figures rather than real results.

## Files

- [index.ts](index.ts): Demo mode.
- [script.ts](script.ts): The demo script format (app/demo/script.json) plus validation helpers.

## Where to look

To find the index logic visit [index.ts](index.ts).

To find the script logic visit [script.ts](script.ts).
