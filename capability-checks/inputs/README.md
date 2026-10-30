# Input images

Put these here (`.jpg`, `.jpeg` or `.png`, under 10 MB, long side 4096 px or less). Use free stock photos (Unsplash, Pexels) or AI-generated people, and your own phone snaps for the wardrobe item. They are git-ignored; only the outputs in `evidence/` are committed.

| File | Used by | What it should be |
|---|---|---|
| `full-body` | 1, 2, 3, 4, 5 | One person, standing, facing the camera, whole body and feet visible, plain background, high resolution |
| `wardrobe-top` | 2 | A phone photo of a top or shirt you own, on a hanger or laid flat, front side, nothing else in frame |
| `shop-item` | 3 | A real product photo saved from an online shop (a dress for `full_body`, or set `SHOP_ITEM_CATEGORY`) |
| `shop-shoes` | 5 | A real product photo of a pair of shoes, at least 512×512 |
| `portrait` | 6, 7 | Front-facing headshot, shoulders and neck visible, face fully visible, long side ≤1024 px for the hairstyle check |
| `face-crop` | 8 | The face area cropped out of `full-body` (head and shoulders) |
