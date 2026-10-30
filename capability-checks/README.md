# Capability checks

Small scripts that test the YouCam API features Godmother depends on, **before** the app is built. Each check answers one question from [docs/PRD.md §12](../docs/PRD.md#12-open-questions-and-capability-checks), calls the real API, and saves the outputs and timings to [`evidence/capability-checks/`](../evidence/capability-checks/).

## Run

```bash
cd capability-checks
cp .env.example .env          # add YOUCAM_API_KEY
pnpm install
# add the input images, see inputs/README.md
pnpm check balance         # free: shows remaining API units
pnpm check list            # the checks and their estimated cost
pnpm check 1               # run one check
pnpm check 1 2 3 4         # or several
pnpm check all             # checks 1-7, about 15 units
```

A run refuses to start if its estimated cost is above `MAX_UNITS_PER_RUN` (default 20), and prints the balance before and after.

## The checks

| # | Question | Units | Decides |
|---|---|---|---|
| 1 | Does clothes try-on accept a **full-body** user photo and keep the whole body? (uses YouCam's own sample outfit so only the user photo is tested) | 2 | Photo flow |
| 2 | Is a **phone snap of your own garment** accepted as the reference? | 2 | "Snap your wardrobe" |
| 3 | Is a **real shop product photo** accepted? | 2 | Buy path and shopping list |
| 4 | Is an **AI-generated garment** accepted and wearable? (image generator V2, then try-on) | 3 | Sew path |
| 5 | Can check 1's **result URL be passed straight into the next task** (shoes on top)? | 2 | Chaining vs re-upload |
| 6 | Does **makeup** look real? (a natural and a gala look) | 2 | Makeup quality |
| 7 | Which **hairstyle templates** exist, and does a preview look real? (template list is free) | 2 | Hair feature |
| 8 | Is a **face crop** from the full-body photo good enough for makeup? | 1 | Two photos instead of three |

Run check 5 within 2 hours of check 1, because result URLs expire after 2 hours.

**PASS only means the API returned a result.** Open the saved `output-*.jpg` files and judge the quality: whole body kept, garment looks right, makeup looks real.

Units are only charged on success. Failed tasks (rejected photos) are free.
