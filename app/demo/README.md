# Demo mode

`mode: "demo"` sessions never call Anthropic or YouCam and spend no units. Each user turn plays the
next turn of `script.json` (events with their recorded timing, pauses capped at 4 s). Anyone can
run the whole product flow by tapping the first suggestion chip each time.

```
demo/
  script.json    the script (generated, committed)
  assets/        images served as /api/assets/demo-<name> (name = file stem)
  draw.mjs       generator for the illustrated SVGs
```

## The shipped demo (illustrated)

`pnpm demo:build` regenerates `script.json` from the UI fixtures in `src/lib/client/fixtures.ts`
(SVG imagery from `static/demo/`): the Eko Heritage Ball in Lagos, black tie, about 67 s.

1. Greeting, then "I'm going to the Eko Heritage Ball in Lagos on 14 November": web search, event card, photo request.
2. Three photos: shop search, products, three looks tried on one by one.
3. "Decide for me": ranking and a pick.
4. "Love it, but I'd rather wear my own gold heels": the look becomes version 2.
5. "Finish this look": face analysis, shoes, makeup, hair, earrings, necklace, watch, ring, lookbook.
6. "Build my shopping list": priced list in naira. 45 of 60 units shown as spent, nothing charged.

If the user types something else, the player says it is following a saved run and plays the next
turn anyway. Pressing a button ahead of the script (for example "Finish this look" right after the
decision) jumps to that action's turn.

## Replacing it with a real recorded run

Live sessions are recorded to `DATA_DIR/sessions/<id>/events.jsonl` (default `app/data`).

1. Run a live session end to end (real event, your photos, real YouCam outputs) in the app.
2. Find the session id (the folder name under `DATA_DIR/sessions/`).
3. `pnpm demo:export <sessionId> --title "My real demo"` (set `DATA_DIR` if the server uses another folder).

The exporter rebuilds the turns (your messages, events with their offsets; `message`, `done` and
`error` frames and error blocks are dropped), copies every `/api/assets/<uuid>` image into
`demo/assets/<uuid>.<ext>` and rewrites ids to `demo-<uuid>`, makes every turn end with a
suggestions block whose first chip is the next turn's text, and overwrites `script.json`. It prints a
summary: turns, events, playback time, units, assets copied or missing, dropped frames, warnings.
HEIC photos are converted to JPEG, since demo assets are served as svg, png, jpg or webp.

`pnpm demo:build` restores the illustrated demo. Commit `script.json` and `assets/` together.
Recorded uploads become part of the repo, so use stock or generated people, not real users.
