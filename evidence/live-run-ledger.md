# Live run ledger

The unit ledger of one real live session, run locally against the YouCam API. It lists feature names, call counts, units and median render time only. Photos and personal details aren't included.

| Feature | Calls | Units | Median seconds |
|---|---:|---:|---:|
| `accessory` | 1 | 1 | 6.2 |
| `face_attributes` | 1 | 10 | 10.3 |
| `garment` | 3 | 6 | 12.8 |
| `hair` | 1 | 2 | 10.1 |
| `image_generation` | 3 | 3 | 7.7 |
| `makeup` | 2 | 2 | 22.4 |
| `skin_tone` | 1 | 20 | 9.6 |
| **Total** | **12** | **44** | |

The ledger is written by [`youcam/ledger.ts`](../app/src/lib/server/youcam/ledger.ts) when a task succeeds, so these are charged calls, not attempts.

**Not in this log:** shoes, and accessories other than the one item above. This is the only session on this machine, so it doesn't prove those paths live.
