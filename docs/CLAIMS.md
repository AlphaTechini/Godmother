# Claims

Each claim in the README, where it lives in the code, and how far the proof goes.

**Status:** PROVEN means a committed log or test output shows it. CODE means the code and mocked tests exist, without a committed live log. LIMITED means it works with a stated limit.

| Claim | Status | Code | Proof or limit |
|---|---|---|---|
| Clothes, skin tone, face attributes, makeup, hair, jewellery (one item) and image generation ran against the live YouCam API | PROVEN | [`features.ts`](../app/src/lib/server/youcam/features.ts) | [`live-run-ledger.md`](../evidence/live-run-ledger.md) |
| Image to Video produced a 10-second clip from a finished look | PROVEN | [`features.ts`](../app/src/lib/server/youcam/features.ts) | [`video-runs.md`](../evidence/video-runs.md). Those runs used test scripts with the same request |
| The Create my video button runs that recipe in the app | CODE | [`showcase-video.ts`](../app/src/lib/server/agent/showcase-video.ts), [`showcase-plan.ts`](../app/src/lib/server/agent/showcase-plan.ts) | Typechecked and deployed. No committed run through the button |
| The video follows the requested camera path and keeps accessories exact | LIMITED | [`showcase-plan.ts`](../app/src/lib/server/agent/showcase-plan.ts) | It often doesn't. See [`video-runs.md`](../evidence/video-runs.md) |
| Shoes, ring, necklace and bracelet try-on | CODE | [`features.ts`](../app/src/lib/server/youcam/features.ts), [`finishing.ts`](../app/src/lib/server/agent/tools/finishing.ts) | Mocked tests. Not in the committed live log |
| Spending can't pass the limit, and units are reserved before any call | PROVEN | [`ledger.ts`](../app/src/lib/server/youcam/ledger.ts) | [`refusals.txt`](../evidence/refusals.txt) |
| An invalid makeup plan is refused before a unit is spent | PROVEN | [`makeup.ts`](../app/src/lib/server/youcam/makeup.ts) | [`refusals.txt`](../evidence/refusals.txt) |
| An interrupted turn doesn't pay twice | CODE | [`task-journal.ts`](../app/src/lib/server/youcam/task-journal.ts) | Covered by the test suite, mocked |
| 15 agent tools and one turn loop | PROVEN | [`tools/index.ts`](../app/src/lib/server/agent/tools/index.ts), [`loop.ts`](../app/src/lib/server/agent/loop.ts) | Read the registry |
| 193 tests pass, typecheck and build succeed, with no keys | PROVEN | [`package.json`](../app/package.json) | [`verify-output.txt`](../evidence/verify-output.txt) |
| Guests get 50 units; accounts get 60 and can claim 60 a UTC day | CODE | [`units/`](../app/src/lib/server/units/README.md) | Read the code |
| Email is confirmed by a code at sign-up, and passwords use Argon2id | CODE | [`auth/`](../app/src/lib/server/auth/README.md) | Read the code |
| The hosted site is live | LIMITED | [`Dockerfile`](../app/Dockerfile), [`vercel.json`](../app/vercel.json) | Needs a browser to check: https://godmother.cyberpunkinc.xyz |
| Real results on real people | LIMITED | | Shown in the demo video. No real person's photos are committed |
