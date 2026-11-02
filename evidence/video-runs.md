# Video runs

Real calls to `POST /s2s/v2.0/task/image-to-video/youcam` (model `youcam-video-v2`, 10 seconds) on 2026-11-01, made while choosing the prompt. All used one finished look as the source. Timings come from the test script's own logs. The videos show a real look, so they aren't committed.

| Run | Resolution | Units | Prompt | Render time | What came out |
|---|---|---|---|---|---|
| 1 | 720p | 20 | Fixed camera direction plus Claude's description of the look | 254 s | Right hairstyle, watch close. Side angles, no back view. Full body only at the start |
| 2 | 480p | 10 | Claude's accessory descriptions, no camera direction | 84 s | Best accessories: dark dial, leather strap, chain bracelet. Natural movement |
| 3 | 480p | 10 | Stand in one spot, camera circles, plus colour and accessory brief | not timed | **Chosen as the default.** Back view and both sides, ends on the hand, rings and colours right. Wrong watch dial, no face close-up, a ghosted double image around 6 s |
| 4 | 480p | 10 | Walk away from the wall, stop, then camera circles | 95 s | Walks naturally, but no circle. Wrong watch, and the head leaves the frame in some shots |

Run 3's script stopped polling before the task finished, so it has no timing. Its result was fetched afterwards. A shorter-prompt run was also started and its video never fetched, so there's no result to report.

## What this does and doesn't show

- The API call works, and 480p took about a minute and a half in the two timed runs.
- Run 3's prompt is the one in [`showcase-plan.ts`](../app/src/lib/server/agent/showcase-plan.ts). This is one result per prompt, so the same prompt can come out differently.
- Accessories aren't reliable: the watch was wrong in two of the four runs.
- These runs used test scripts with the same request as the app, not the Create my video button.
