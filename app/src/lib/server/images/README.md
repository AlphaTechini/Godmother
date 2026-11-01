# images: cloud image storage

Keeps a private copy of every live session's images, so they survive a new server. Code depends on the small contract in [types.ts](types.ts), and only [cloudinary.ts](cloudinary.ts) imports a provider SDK. Changing provider means writing one new adapter and pointing [index.ts](index.ts) at it.

## Decisions and tradeoffs

- **Authenticated delivery.** Images use Cloudinary's `authenticated` type, so plain links don't work. Only this server can fetch them, with a signed download URL, and browsers always go through `/api/assets/:id`, where access is checked. The tradeoff is that images don't come from Cloudinary's CDN directly and each first load passes through this server.
- **Provider image tools aren't used.** The app needs storage, not transformations, so the contract is only `put` and `get`.
- **Optional.** With no Cloudinary settings, `getImageStore()` returns null and images stay on local disk.

## Where things are

To find the storage contract visit [types.ts](types.ts).

To find the choice of provider visit [index.ts](index.ts).

The Cloudinary connection can be found in [cloudinary.ts](cloudinary.ts).

To find the logic that puts the finished head on the full-body shot for the video visit [head-paste.ts](head-paste.ts). It only works against a plain wall, so it returns nothing on a busy background and the video starts from the plain shot.

To find the background upload and restore logic visit [cloud-assets.ts](../store/cloud-assets.ts).
