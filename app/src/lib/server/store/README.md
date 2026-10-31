# store: sessions and images

Local disk in `DATA_DIR` is the working copy. When the database and Cloudinary are configured, live sessions and images are also copied there in the background.

## Decisions and tradeoffs

- **Local first, cloud in the background.** Every save lands on disk and returns, so a cloud outage never slows or stops a session. The newest copy is retried until it lands. The tradeoff is that the cloud can lag behind by a moment, or by the length of an outage.
- **Restore on a miss.** A session or image this server has no file for is fetched from the cloud and cached on disk, which is what lets an account open its sessions from a new server.
- **Retries live in memory.** A session is sent again on its next save, but an image that was waiting when the server restarted isn't uploaded until something new prompts it. A disk scan on startup is the fix if that starts to matter.
- **One server is assumed.** Each server trusts its own disk first, so a second server with an older copy of a session could miss a later change, including its owner. Running several servers means reading sessions from the database first.
- **Demo sessions never sync.** They replay recorded data that ships with the app.
- **`events.jsonl` stays local.** Only the demo exporter uses it.
- **Requests wait for cloud copies, up to 8 seconds.** Hosts like Cloud Run throttle the CPU after a response, which would stall background work. An outage costs that wait on each save-closing request.

## Where things are

To find session saving, loading and locking visit [sessions.ts](sessions.ts).

To find image saving and loading visit [assets.ts](assets.ts).

To find the session recorder visit [recorder.ts](recorder.ts).

To find file locations and id checks visit [paths.ts](paths.ts).

The database copy of sessions can be found in [cloud-sessions.ts](cloud-sessions.ts).

The cloud copy of images can be found in [cloud-assets.ts](cloud-assets.ts).

To find the wait before a response closes visit [cloud-wait.ts](cloud-wait.ts).
