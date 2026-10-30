# Godmother: API notes (YouCam, OpenAI, SvelteKit 3)

Researched 2026-10-30 for coders who **cannot call the live APIs**. Every path, field and enum here is meant to be typed straight into code.

**Status tags**
- **VERIFIED**: stated in the official docs (as copied into public repos) **or** seen working in live calls or code in other projects. The source is named.
- **INFERRED**: a best guess. The reason is given. Build these behind a small adapter so a fix is one line.

**How this was researched.** `docs.perfectcorp.com`, `yce-api-01.*` and `api.openai.com` were unreachable from the sandbox, so the YouCam facts come from:
- full copies of the docs in public GitHub repos (`TanishaJayabalan/atelier-youcam/api.md` is a 5,200-line dump of the reference);
- projects that recorded live calls: `DevDaring/YouCam_Hackathon` (docs bundles plus a live feature-cost list, 2026-10-10), `Bowen1314/unstack` (live, 2026-10-02), `habeebsl/touchstone` (live makeup and skin-tone, 2026-08), `Ajayfrizzy/shopping_concierge` (live earring, necklace, ring and watch, 2026-10-07), `vlad-ed-git/kostuma` (cloth-v4 and makeup in production).

The OpenAI and SvelteKit facts come from the **installed packages** (`openai@7.45.1`, `@sveltejs/kit@3.1.1`, `@sveltejs/adapter-node@6.0.1`). The OpenAI snippet in §3.2 typechecks against the installed SDK.

---

## 0. Corrections to the capability-checks code

| # | Where | Today | Should be | Status |
|---|---|---|---|---|
| 1 | `youcam.ts` `API_BASE` | `https://yce-api-01.perfectcorp.com` | **`https://yce-api-01.makeupar.com`**. That is `servers[0].url` in every OpenAPI bundle, and every live-verified project uses it. Some repos call `perfectcorp.com` an alias, but nobody showed a successful call against it. Keep the env override. | VERIFIED (DevDaring §1, Bowen §1, Ajayfrizzy `live.ts`) |
| 2 | `checks.ts` check 5 | `/s2s/v2.0/task/shoes-transfer` with `src_file_url` + `ref_file_id` | The path is right: it is "AI Shoes Virtual Try-On **V3.0**", 2 units, in the live price list. The body is not documented anywhere we could reach. The V3 blog says it takes a user photo and a reference, as URL or file id, with no gender or style. So `{src_file_id\|src_file_url, ref_file_id\|ref_file_url}` is the best guess. **Fallback:** `cloth-v4` with `garment_category: "shoes"` (documented enum, 2 units). | path VERIFIED, body INFERRED |
| 3 | `checks.ts` check 7 (hair) | uploads `portrait` as is | Hair Transfer accepts **jpg/jpeg only**, **long side ≤ 1024**, face width ≥ 128 px and **shoulders visible**. A PNG or large portrait fails (`error_no_shoulder`, `exceed_max_filesize`, …). Resize and re-encode to JPEG first. | VERIFIED (docs dump, hair section) |
| 4 | `checks.ts` checks 6 and 8 (makeup) | uploads `portrait` as is | Makeup needs **long side < 1920**, face width ≥ 100 px, a frontal face within 10°. Resize first. The result is a **PNG with an alpha channel**: flatten it onto white before showing or chaining it. | VERIFIED (docs; kostuma comment) |
| 5 | `youcam.ts` `runTask` | 5 s poll | Fine. But the account limit is **250 requests per 300 s** (per key and per IP), which is about 0.83 req/s sustained. Use one global limiter across all parallel polls (see §1.3). | VERIFIED (DevDaring §3) |
| 6 | `youcam.ts` result URL | handles `results.url`, `results[0].url`, `download_url` | Real responses are **`data.results.url`** (an object). Keep the fallbacks: the docs pseudo-schema shows `results[].download_url`, which is wrong. | VERIFIED live (touchstone) |
| 7 | `youcam.ts` `getBalance` | reads `results ?? data.results` | Correct. The real shape has a **top-level** `results` (no `data`). Sum `amount_dec`. | VERIFIED live (Bowen §12, DevDaring) |
| 8 | Makeup looks in `checks.ts` | `Arabic3`, `1color1`, `original` + `style:{type:"full"}` | All valid. `Arabic3` is a real eyeliner label (colorNum 1), and `style` is **required** on `lip_color`. No change needed. | VERIFIED |
| 9 | `uploadFile` content type | `image/jpg` | OK: the docs use `image/jpg`. The PUT must send **exactly** the `headers` object returned with the upload URL. HEIC is not accepted by most features; convert to JPEG. | VERIFIED |

---

## 1. YouCam: common mechanics

### 1.1 Host, auth, envelopes (VERIFIED)

```
Base:    https://yce-api-01.makeupar.com
Header:  Authorization: Bearer <YOUCAM_API_KEY>      (one space; no secret key, no RSA, no id_token)
Header:  Content-Type: application/json               (on every request with a body)
```

| Call | Response |
|---|---|
| Task create OK | `{"status":200,"data":{"task_id":"<string>"}}` |
| Poll, running | `{"status":200,"data":{"task_status":"running","error":null,"results":null}}` |
| Poll, success | `{"status":200,"data":{"task_status":"success","error":null,"results":{"url":"https://yce-us.s3-accelerate.amazonaws.com/ttl30/...jpg?X-Amz-Expires=7200..."}}}` |
| Poll, engine error | `{"status":200,"data":{"task_status":"error","error":"error_no_face","error_message":"..."}}` (HTTP 200) |
| 400 create | `{"status":400,"error":"...","error_code":"InvalidParameters"\|"CreditInsufficiency"\|"InvalidStyleGroup"\|"InvalidStyle"\|"BadRequest"}` |
| 401 | Three shapes exist: `{"status":401,"error":"Unauthorized","error_code":"InvalidAccessToken"}` (seen live), `{"status":401,"error_code":"InvalidApiKey"\|"InactiveApiKey"\|"ExpiredApiKey"}`, and `{"status":401,"error":"Invalid API key"}` |
| 404 / 400 poll | `InvalidTaskId` (unknown id, or the task expired because it was not polled) |
| 429 | `{"status":429,"error":"Too many requests"}` |
| 500 poll | `{"status":500,"error":"Task execution timed out"}` / `error_code:"TaskTimeout"` |

- `task_status` takes exactly three values: `"running" | "success" | "error"`. Treat anything else as running.
- A **structurally** invalid body is rejected synchronously with HTTP 400 `InvalidParameters`. The message lists every schema branch, which makes it noisy.
- A **semantically** invalid body (for example an unknown makeup pattern label, or missing eyebrow `curvature`) is accepted. It then fails at poll time with `error:"invalid_parameter"` and **no detail** (touchstone, live).
- `file_id` and `task_id` contain `/` and `+`. Always `encodeURIComponent(taskId)` in poll paths.
- Some numeric ids (credit `id`) exceed 2^53. They are harmless if unused.

### 1.2 Units, balance, retention (VERIFIED)

- **Units are charged only on `success`.** `error` costs nothing. Probing a bad payload is free.
- A task must be polled within its retention window, or it becomes `InvalidTaskId` "and units may still be charged". The docs say 24 h in one place and 30 days in another; design for 24 h.
- Result URLs expire after **2 hours** (`X-Amz-Expires=7200`). Polling again returns a fresh URL. **Download immediately.** Results are served as `binary/octet-stream`, so sniff the magic bytes for PNG or JPEG.
- `file_id` lasts 30 days.
- `POST /s2s/v2.0/task/delete` with `{"task_id":"..."}` returns `{"status":200}`. It deletes **the task's inputs and outputs**: result URLs 404 right after (Bowen, live). Do **not** delete a task whose `file_id` you plan to reuse.
- Balance: `GET /s2s/v1.0/client/credit` returns `{"status":200,"results":[{"id":<int>,"type":"ApiSubsToken"|"ApiPaygToken","amount":<int, deprecated>,"amount_dec":<number>,"expiry":<ms>}]}`. The balance is the sum of `amount_dec`. The call is free.
- Live price list: `GET /s2s/v2.0/credit/feature-cost?page_size=20&starting_token=<t>` returns `{"result":{"next_token":<string|null>,"skus":[{"description","amount","unit":"result_image"|"second","proc_unit","run_task_url"}]}}`. Note the key is **`result`**, singular. The call is free.
- History: `GET /s2s/v1.0/client/credit/history?page_size=1..30&starting_token=` returns `{"result":{"next_token","history":[{id,timestamp,action,target_id,info:{credits:[{id,amount_dec}]}}]}}`.

### 1.3 Rate limits and polling (VERIFIED limits, INFERRED cadence)

- **250 requests per 300 s per API key AND per IP.** Polling counts toward the limit, and going over returns 429.
- The docs suggest polling "about every 10 s". Observed latency: makeup about 2 s, skin analysis 6–14 s, Fitzpatrick about 10 s, enhance about 5 s, earring about 45 s.
- Suggested cadence: first poll after 2 s, then every 3 s for the first 15 s, then every 5 s. Time out after 180 s, but keep a record of the task id and poll it once more later.
- Put **one token bucket in front of all YouCam calls** (about 0.8 req/s with a burst of 10). Three looks rendering in parallel at a 3 s poll would otherwise reach 60 requests/min, over the 50/min budget.
- **Never auto-retry a create POST** after a timeout: it may already be running, and it will charge on success.

### 1.4 File API (VERIFIED, universal endpoint since docs v1.14)

```http
POST /s2s/v2.0/file
{"files":[{"content_type":"image/jpg","file_name":"portrait.jpg","file_size":547541}]}
```
```json
{"status":200,"data":{"files":[{"content_type":"image/jpg","file_name":"portrait.jpg",
  "file_id":"SaGaqpDg...FBfaud",
  "requests":[{"method":"PUT","url":"https://yce-us.s3-accelerate.amazonaws.com/...",
               "headers":{"Content-Length":"547541","Content-Type":"image/jpg"}}]}]}}
```
- All three fields are required. `file_size` is in bytes. Images must be under 10 MB.
- Then `PUT requests[0].url` with **exactly** `requests[0].headers` and the raw bytes as the body. **Do not send** the YouCam `Authorization` header to S3.
- If the PUT is skipped, the task later fails with 404 or `500 unknown_internal_error`.
- Feature-scoped variants `POST /s2s/v2.0/file/<slug>` also work, and return the same shape (live: `file/2d-vto/earring`, `file/2d-vto/ring`, `file/2d-vto/watch`, `file/2d-vto/necklace`, `file/cloth-v3`). Use the universal one; fall back to the scoped one if a feature ever rejects the file id.
- **Public URL instead of a file:** every task accepts `src_file_url` (and `ref_file_url` or `ref_file_urls`) in place of ids. Our own server is not publicly reachable in dev, so **upload by file id**.
- **Chaining** (passing one task's result URL as the next `src_file_url`) is undocumented. Capability check 5 tests it. Projects that chain in production (kostuma) download the result, re-encode it and re-upload. Do that by default.

### 1.5 Input-image prep per feature (VERIFIED from each feature's spec table)

| Feature | Formats | Size limits | Content |
|---|---|---|---|
| Clothes (cloth-v3/v4) src | jpg, png | 512×384 min, 1024×768 recommended, long side ≤ 4096, long side ≥ 128 | One person filling ≥ 80% of the frame, facing forward, standing, face fully visible, shoulders visible. The docs contradict themselves on full-body vs chest-up (check 1). |
| Clothes ref | jpg, png | same | Front-facing, single garment, not a composite. **Lower body must be a worn photo**; a flat product shot fails. A worn ref must cover the whole try-on area. |
| Makeup VTO | jpg, jpeg, png | long side < 1920; face width ≥ 100 px; ≥ 100×100 | Frontal within 10°. The output is a PNG with alpha. |
| Hair Transfer v2.1 | **jpg/jpeg only** | **long side ≤ 1024**; face width ≥ 128 | Single face, full face, **shoulders visible**; pitch ±10°, yaw ±45°, roll ±15°. |
| Earrings | jpg, jpeg, png | long side ≤ 4096 | Side-facing works best; frontal is OK. Ref: a single earring, front view. |
| Necklace | jpg, jpeg, png | long side ≤ 4096 | Frontal, neck visible, **neck ≥ 15% of image width**, head yaw ≤ 20°. Ref: front-facing, background removed. A pendant can fall below the frame on a tight portrait (Ajayfrizzy had to retry with a wider shot). |
| Ring / bracelet / watch | jpg, jpeg, png | long side ≤ 4096 | **Back of the hand/wrist with all five fingers visible.** Ring ref at about 45° front view; watch ref face-on. |
| Skin tone, face attributes | jpg, jpeg, png (Fitzpatrick: jpg only) | each side ≥ 320, long side ≤ 4096 (auto-resized above 1080) | **Face width > 60% of image width**, single person, frontal. A tight face crop, unlike hair. |

> **Architecture consequence:** one "portrait" upload cannot satisfy every feature. Derive per-feature copies server-side: an analysis crop (face ≥ 60% of width, JPEG), a hair copy (JPEG, ≤ 1024, shoulders in frame), and a makeup copy (< 1920). This needs `sharp` (not installed; `image-size` only reads dimensions). The face box can come from the vision model, or from a centre-crop heuristic and a retry.

### 1.6 Engine error codes worth mapping (VERIFIED)

- Generic: `exceed_max_filesize`, `invalid_parameter`, `error_download_image`, `error_decode_image`, `error_nsfw_content_detected`, `error_no_face`, `error_pose`, `error_face_parsing`, `error_inference`, `error_multiple_people`, `error_no_shoulder`, `error_large_face_angle`, `error_hair_too_short`, `error_bald_image`, `error_unsupport_ratio`, `unknown_internal_error`, `error_exceed_max_image_size`.
- Clothes: `error_below_min_image_size` (long side < 128), `error_pose`, `error_invalid_ref`, `error_apply_region_mismatch` (src and ref regions do not match), `error_invalid_src` (src shows only the lower body or feet), `error_editing_failed` (the result is too similar to the src), `error_multi_person`.
- Makeup: `error_below_min_image_size`, `error_exceed_max_image_size`, `error_face_position_invalid`, `error_face_position_too_small`, `error_face_position_out_of_boundary`, `error_face_angle_invalid`.
- Hair: `error_no_shoulder`, `error_large_face_angle`, `error_insufficient_landmarks`, `error_hair_too_short`, `error_face_pose`.
- Skin tone and face attributes: `error_below_min_image_size`, `error_face_position_invalid`, `error_face_position_too_small`, `error_face_position_out_of_boundary`, `error_face_not_forward_facing`, `error_face_angle_upward`, `error_face_angle_downward`, `error_face_angle_leftward`, `error_face_angle_rightward`, `error_face_angle_left_tilt`, `error_face_angle_right_tilt`.
- 2D jewellery (UPPER CASE): `RUNTIME_ERROR`, `PHOTO_DETECTION_FAIL` (no hand or face detected), `OBJECT_DETECTION_FAIL` (no product detected), `PHOTO_CHECK_INVALID` (pose or size), `INPUT_ERROR`, `INPUT_MAIN_IMAGE_EMPTY`.

### 1.7 Unit costs (VERIFIED: live `feature-cost`, 2026-10-10)

| Feature | Path | Units |
|---|---|---|
| Clothes v2 / v3 / v4 | `/s2s/v2.0/task/cloth` / `cloth-v3` / `cloth-v4` | 2 each |
| Shoes V2 (gender + style preset) | `/s2s/v2.0/task/shoes` | 2 |
| Shoes V3 | `/s2s/v2.0/task/shoes-transfer` | 2 |
| Makeup VTO | `/s2s/v2.0/task/makeup-vto` | 1 |
| Look VTO (template makeup) | `/s2s/v2.0/task/look-vto` | 2 |
| Hairstyle V1.0 (template, old) | `/s2s/v2.0/task/hair-style` | 1 |
| Hairstyle V2.0 custom | `/s2s/v2.0/task/hair-transfer` | 2 |
| Hairstyle V2.1 (preset or custom) | `/s2s/v2.1/task/hair-transfer` | 2 |
| Earrings single / stacked | `/s2s/v2.0/task/2d-vto/earring` | 1 / 2 |
| Necklace | `/s2s/v2.0/task/2d-vto/necklace` | 1 |
| Ring single / stacked | `/s2s/v2.0/task/2d-vto/ring` | 1 / 2 |
| Bracelet single / stacked | `/s2s/v2.0/task/2d-vto/bracelet` | 1 / 2 |
| Watch | `/s2s/v2.0/task/2d-vto/watch` | 1 |
| Facial Color Tones | `/s2s/v2.0/task/skin-tone-analysis` | 20 |
| Face Attributes & Ratio | `/s2s/v2.0/task/face-attr-analysis` | 1–5 features: 10; 6–14: 20; 15–28: 30 |
| Fitzpatrick | `/s2s/v2.0/task/fitzpatrick-scale-analyzer` | 10 |
| Image Generator V2 text-to-image | `/s2s/v2.0/task/text-to-image/youcam` | 1 |
| Image Generator V2 image-to-image | `/s2s/v2.0/task/image-to-image/youcam` | 1 |
| Image-to-video V2 720p | `/s2s/v2.0/task/image-to-video/youcam` | 2 per second |
| Template lists, file API, credit endpoints | | free (not in the price list) |

"Stacked" is not defined anywhere. It presumably means more than one `object_infos` entry (INFERRED). Send exactly one entry to pay 1 unit.

---

## 2. YouCam features

Every create below returns `data.task_id`. Poll with `GET <same path>/<task_id>`. On success, the image is at `data.results.url` unless stated otherwise.

### 2.1 Clothes: `POST /s2s/v2.0/task/cloth-v4` (or `cloth-v3`) (VERIFIED)

| Field | Type | Req | Notes |
|---|---|---|---|
| `src_file_id` \| `src_file_url` | string | one required | The user photo. |
| `ref_file_id` \| `ref_file_url` | string | one required | The garment. |
| `garment_category` | enum | required | v4: `"upper_body" \| "lower_body" \| "full_body" \| "shoes" \| "auto" \| "outer"`. v3: the same **without `outer`**. An invalid value fails as `invalid_parameter`. |
| `change_shoes` | boolean | optional, default `true` | Only applies to `full_body` and `lower_body`. Set `false` once shoes have been rendered, or on a second pass. |
| `filter_multi_person` | `"off" \| "normal" \| "strict"` | v4 only, default `"off"` | `off` uses the largest person. |

```json
{"src_file_id":"<fid>","ref_file_id":"<fid>","garment_category":"full_body","change_shoes":true,"filter_multi_person":"off"}
```

- **Use `cloth-v4`.** It costs the same, adds `outer`, and is used in production by kostuma. V2 `cloth` is the only version with `template_id` (`GET /s2s/v2.0/task/template/cloth`), which we do not need.
- One garment per call. For top + bottom, run `upper_body`, then `lower_body` on the re-uploaded result.
- Our `GarmentCategory` (`upper_body | lower_body | full_body | outer | shoes`) maps 1:1 onto the v4 enum.
- Worn vs flat refs: tops, dresses and outerwear accept a flat front-facing product shot. **`lower_body` needs a worn photo** (a person wearing the trousers or skirt, legs fully visible).

### 2.2 Shoes

Preferred: `cloth-v4` with `garment_category:"shoes"` (VERIFIED enum; nobody showed it live). Alternative: Shoes V3.

```http
POST /s2s/v2.0/task/shoes-transfer
{"src_file_id":"<full-body fid>","ref_file_id":"<shoe product fid>"}
```
- V3 body is INFERRED: the vendor blog says user photo + reference image (URL or id), one person, face visible, no style parameters, 2 credits.
- **Avoid Shoes V2** (`/s2s/v2.0/task/shoes`). It is a style generator: it requires `gender` (`"male"|"female"`) and `style` (`"random"|"style_minimalist"|"style_bohemian"|"style_cottagecore"|"style_french_elegance"|"style_retro_fashion"`), and outputs a fixed 1008×1344 image. VERIFIED (hatif03 bundle notes; Aniket2812 code).

### 2.3 Makeup VTO: `POST /s2s/v2.0/task/makeup-vto` (VERIFIED)

```json
{"src_file_id":"<fid>","version":"1.0","effects":[ /* Effect[] */ ]}
```
- `version` is optional and defaults to `"1.0"`. Send it anyway.
- `effects` is required. Several effects go in one call for 1 unit.
- **If no `skin_smooth` effect is sent, smoothing 50 is applied automatically.** Send `{"category":"skin_smooth","skinSmoothStrength":0,"skinSmoothColorIntensity":0}` for none.
- The result is `data.results.url`, a PNG with alpha, about 2 s.

#### 2.3.1 Effect schema (all integers are 0–100 unless noted; colours are `"#RRGGBB"`)

| `category` | Required keys | Palette object (every key required unless marked) | `texture` enum and conditional extras |
|---|---|---|---|
| `skin_smooth` | `skinSmoothStrength`, `skinSmoothColorIntensity` (top-level, no palettes) | n/a | n/a |
| `foundation` | `palettes[1]` | `color, colorIntensity, glowIntensity, coverageIntensity` | none |
| `concealer` | `palettes[1]` | `color, colorIntensity, colorUnderEyeIntensity, coverageLevel` | none |
| `blush` | `pattern.name`, `palettes[colorNum]` | `color, texture, colorIntensity` | `matte` · `satin` adds `glowStrength` · `shimmer` adds `shimmerColor, shimmerDensity` |
| `bronzer` | `pattern.name`, `palettes[1]` | `color, colorIntensity` | none |
| `contour` | `pattern.name`, `palettes[1]` | `color, colorIntensity` | none |
| `highlighter` | `pattern.name`, `palettes[1]` | `color, colorIntensity, glowIntensity, shimmerIntensity, shimmerDensity, shimmerSize` | none |
| `eyebrows` | `pattern.type`; if `"shape"`: `pattern.name, curvature (-100..100), thickness (-100..100), definition (0..100)` (**all required**, live-confirmed); `palettes[1]` | `color, colorIntensity, texture` | `matte` · `shimmer` adds `shimmerColor, shimmerIntensity, shimmerSize, shimmerDensity` |
| `eye_shadow` | `pattern.name`, `palettes[colorNum]` | `color, texture, colorIntensity` | `matte` · `shimmer` adds `shimmerColor, shimmerIntensity` · `metallic` adds `shimmerColor, shimmerIntensity, metallicIntensity` |
| `eye_liner` | `pattern.name`, `palettes[colorNum]` | same as `eye_shadow` | same as `eye_shadow` |
| `eyelashes` | `pattern.name`, `palettes[1]` | `color, colorIntensity` | none |
| `lip_color` | `shape.name`, **`style.type`** (required, live-confirmed), `palettes[≥1]`; optional `morphology:{fullness, wrinkless}` | `color, texture, colorIntensity` | `matte` and `satin`: no extras · `gloss`: `gloss, transparencyIntensity` · `sheer`: `gloss, transparencyIntensity` · `shimmer`: `gloss, transparencyIntensity, shimmerColor, shimmerIntensity, shimmerDensity, shimmerSize` · `metallic` and `holographic`: `gloss, shimmerColor, shimmerIntensity, shimmerDensity, shimmerSize` |
| `lip_liner` | `pattern.name`, `palettes[1]` | `color, texture, colorIntensity, thickness, smoothness` | `matte` \| `satin` |

- `eyebrows` with `pattern:{"type":"color"}` takes no shape fields and only recolours the brows.
- `lip_color.style`: `{"type":"full"}` · `{"type":"ombre","innerRatio":0..100,"featherStrength":0..100}` (both required for ombre) · `{"type":"twoTone"}`. twoTone presumably takes 2 palettes (INFERRED: not documented; avoid it).
- The note `wrinkless` (sic) is the real key.
- **Palette count rule:** `palettes.length` must equal the pattern's `colorNum`. Labels named `NcolorM` or `NcolorsM` take N palettes (`2colors1` → 2). Every other label (`Drama8`, `Arabic3`, `OvalFace6`, …) takes 1.

#### 2.3.2 Allowed pattern labels (whitelist for validating the LLM's output)

The catalogs are much larger (for example eye_shadow goes up to `2colors167`). The labels below are confirmed: they appear in the official docs examples, or other projects checked them against the live catalog JSON (`kostuma check-patterns.mjs`, `touchstone patterns.check.ts`), and touchstone and kostuma rendered them live. **Restrict the LLM to this list**: an unknown label fails silently with `invalid_parameter`. Labels are case-sensitive.

| Category | Labels (colorNum) | Notes |
|---|---|---|
| `eye_shadow` | `1color1` `1color8` `1color9` `1color22` `1color23` `1color30` `1color55` `1color57` `1color67` (1) · `2colors1` `2colors25` `2colors40` `2colors83` `2colors164` `2colors167` (2) · `3colors1` `3colors100` `3colors103` (3) · `4colors1` (4) · `5colors1` (5) | `1color9` is a whole-eye wash; `2colors1` is a fan on the upper lid; `2colors40` and `2colors164` are cat eye; `2colors83` is smoky; `2colors167` is cut crease; `3colors100` is smoky whole eye; `3colors103` is a blended socket |
| `eye_liner` | `Arabic3` `Lower1` `Lower11` `OpenWings1` `OpenWings2` `OpenWings3` `Smoke11` `Drama8` `Drama12` `Drama13` `Drama34` `Drama40` `Drama42` `Drama47` `Drama51` `PandaSmudge1` `PandaSmudge11` `FullRim7` (1) · `2colors1` (2) · `3colors2` `3colors5` (3) | `OpenWings3` is a classic wing; `Lower11` is a thin upper lash line; `PandaSmudge1` is softly smudged; `FullRim7` is kohl all round |
| `eyebrows` (`type:"shape"`) | `Arrow1` `Arrow13` `Curved1` `Drama2` `Drama4` `Drama7` `Drama14` `HighArch1` `HighArch4` `Original2` `Original5` `SoftArch1` `Straight1` `Straight2` `Thin1` `Upward4` | All colorNum 1 |
| `eyelashes` | `Natural1` `Upper1` `UpperDense1` `Upper&Lower1` `Upper&Lower4` `Winged1` `Wispies1` `Artistic1` | |
| `blush` | `1color1` `Round1` `Round2` `Oblique1` `Oblique2` `Circle2` `Rectangle7` `Triangle3` (1) · `2colors1` `2colors6` (2) · `3colors1` `3colors8` (3) | `Oblique*` sweeps along the cheekbones; `Round*` is a wide flush |
| `contour` | `OvalFace6` `OvalFace13` `HeartFace2` `HeartFace3` `Invtriangle1` `RoundFace4` `TriangleFace2` `TriangleFace5` | Pick by face shape |
| `bronzer` | `Bronzer1` `Bronzer2` `Bronzer3` `Bronzer5` | |
| `highlighter` | `OvalFace2` `OvalFace5` `OvalFace62` `HeartFace4` `Invtriangle2` `Oblong11` `RoundFace3` `SquareFace3` `TriangleFace3` | |
| `lip_liner` | `Natural1` `Large&Full1` `LargerLower1` `LargerUpper1` `Rosebud1` `Small1` `Wider1` | |
| `lip_color` → `shape.name` | `original` `heart-shaped` `m-shaped` `petal` `plump` `pouty` `smile` `vintage` | This is the complete catalog |

Full catalogs, if we ever want thumbnails: `https://plugins-media.makeupar.com/wcm-saas/patterns/{blush,bronzer,contour,eyebrows,eyeliner,eyeshadow,eyelashes,highlighter,lipliner}.json` and `.../wcm-saas/shapes/lipshape.json`. Each is an array of `{category,label,thumbnail,tags[],colorNum?}`. Note the file names `eyeliner` and `eyeshadow` have no underscore.

#### 2.3.3 Valid gala example (all labels from the whitelist)

```json
{"src_file_id":"<fid>","version":"1.0","effects":[
 {"category":"skin_smooth","skinSmoothStrength":45,"skinSmoothColorIntensity":38},
 {"category":"foundation","palettes":[{"color":"#C68E6E","colorIntensity":40,"glowIntensity":20,"coverageIntensity":50}]},
 {"category":"contour","pattern":{"name":"OvalFace6"},"palettes":[{"color":"#7A4E3A","colorIntensity":30}]},
 {"category":"highlighter","pattern":{"name":"OvalFace2"},"palettes":[{"color":"#F3D9B1","colorIntensity":45,"glowIntensity":55,"shimmerIntensity":40,"shimmerDensity":40,"shimmerSize":30}]},
 {"category":"blush","pattern":{"name":"Oblique1"},"palettes":[{"color":"#C9706B","texture":"satin","glowStrength":35,"colorIntensity":55}]},
 {"category":"eyebrows","pattern":{"type":"shape","name":"SoftArch1","curvature":8,"thickness":5,"definition":55},"palettes":[{"color":"#3B2A20","colorIntensity":50,"texture":"matte"}]},
 {"category":"eye_shadow","pattern":{"name":"2colors83"},"palettes":[
   {"color":"#5B3A29","texture":"shimmer","shimmerColor":"#E6C27A","shimmerIntensity":60,"colorIntensity":65},
   {"color":"#2B1B14","texture":"matte","colorIntensity":70}]},
 {"category":"eye_liner","pattern":{"name":"OpenWings3"},"palettes":[{"color":"#000000","texture":"matte","colorIntensity":80}]},
 {"category":"eyelashes","pattern":{"name":"UpperDense1"},"palettes":[{"color":"#000000","colorIntensity":85}]},
 {"category":"lip_color","shape":{"name":"original"},"style":{"type":"full"},"palettes":[{"color":"#8E1B2C","texture":"matte","colorIntensity":85}]}
]}
```

**Debugging tip (free):** if a payload fails with `invalid_parameter`, resend each effect on its own until one fails. Failed tasks cost nothing.

### 2.4 Hairstyle V2.1 (VERIFIED)

**Templates.** `GET /s2s/v2.1/task/template/hair-transfer?page_size=20&starting_token=<t>` (page_size 1..20, free):
```json
{"status":200,"data":{"templates":[{"id":"all_classic_hollywood_waves","thumb":"https://app-cdn.makeupar.com/cms/.../file.jpg","title":"Classic Hollywood Waves","category_name":"Female","keep_users_color":true}],"next_token":"<string|null>"}}
```
- `category_name` is `"Male"` or `"Female"`.
- `keep_users_color: true` means the style keeps the user's own hair colour; prefer these for realism.
- There were 116 templates on 2026-10-10. Cache the list at startup.
- Gala-relevant ids (Female): `all_classic_hollywood_waves`, `all_goddess_waves`, `all_romantic_waves`, `all_half_up_soft_waves`, `female_casual_updo`, `all_high_pony_tail`, `female_sleek_middle_part`, `all_gentle_waves`, `all_french_bob`, `female_long_straight`, `female_side_part_straight`, `all_curly_double_buns`, `female_boho_side_braid`, `all_defined_waves`, `female_messy_bun`.
- Gala-relevant ids (Male): `male_textured_comma`, `all_side_swept_undercut`, `male_wavy_undercut`, `male_tousled_cut`, `all_tousled_waves`, `male_afro`, `all_dreadlocks`, `all_buzz_cut`.
- The ids are stable slugs, but verify each against the live list before use.

**Create.** `POST /s2s/v2.1/task/hair-transfer`
```json
{"src_file_id":"<jpg ≤1024 fid>","template_id":"all_classic_hollywood_waves"}
```
- Body: `src_file_id|src_file_url` plus **exactly one** of `template_id`, `ref_file_id` or `ref_file_url`.
- Optional `hair_color: "ref" | "src"` (default `ref`) applies in reference-photo mode only.
- 2 units. The result is `data.results.url`.
- V2.0 (`/s2s/v2.0/task/hair-transfer`) is reference-photo only and also costs 2, so it is not cheaper. V1.0 `/s2s/v2.0/task/hair-style` (1 unit, `template_id` required, templates at `GET /s2s/v2.0/task/template/hair-style`) is an older engine.
- There is no text prompt.

### 2.5 Jewellery and watch, "2D VTO" (VERIFIED live for earring, necklace, ring and watch: Ajayfrizzy 2026-10-07)

Paths: `POST /s2s/v2.0/task/2d-vto/{earring|necklace|ring|bracelet|watch}`. Note `earring` is **singular**. Poll with `GET .../2d-vto/<item>/<task_id>`.

**Body shape (unlike every other feature):**
```json
{
  "src_file_id": "<user photo fid>",
  "ref_file_urls": ["https://.../product.jpg"],
  "source_info": { "name": "<same value as src_file_id or src_file_url>" },
  "object_infos": [ { "name": "<same value as the ref entry>", "parameter": { } } ]
}
```
- The reference fields are **plural arrays**: `ref_file_ids: string[]` or `ref_file_urls: string[]`.
- `source_info.name` must equal the src value. Each `object_infos[].name` must equal one entry in `ref_file_*`.
- `parameter` is optional; `{}` or omitting it uses the engine defaults. This is exactly what the live-verified code sent, so start there.
- Optional masks: `srcmsk_file_id|srcmsk_file_url`, and `refmsk_file_ids|refmsk_file_urls` (earring only).
- Send one `object_infos` entry: 1 unit. "Stacked" pricing is presumably for several entries.
- Pass shop product photos by URL (`ref_file_urls`) if they are public, or upload them and use `ref_file_ids`.

`parameter` keys (all optional; prefix by item):

| Item | Keys |
|---|---|
| earring | `earring_need_remove_background` (bool, default true), `earring_is_right_ear` (bool, default true), `earring_occluded_type` (0 auto, 1 occluded, 2 none), `earring_scale` (cm > 0), `earring_wearing_location` ([x,y]), `earring_anchor_point` ([x,y]), `earring_shadow_intensity` (0–1), `earring_ambient_light_intensity` (0–1). These only apply when the ref shows **one** earring; if it shows a pair, everything is auto-detected and mirrored. |
| necklace | `necklace_need_remove_background`, `necklace_wearing_location` ([[x,y],[x,y]]), `necklace_anchor_point` ([[x,y],[x,y]]), `necklace_shadow_intensity`, `necklace_ambient_light_intensity` |
| ring | `ring_need_remove_background`, `ring_wearing_finger` (int 0 thumb, 1 index, 2 middle, 3 ring, 4 little) (INFERRED from 2 projects' code) |
| bracelet | `bracelet_need_remove_background`, `bracelet_wearing_location` (number), `bracelet_shadow_intensity`, `bracelet_ambient_light_intensity` (INFERRED from code) |
| watch | `watch_need_remove_background` (INFERRED from code); otherwise defaults |

- The default shadow and ambient values contradict each other (the schema says 0.5/0.5, the text says 0.15/1.0). If you send them, send both explicitly.
- Recommended: `{"earring_need_remove_background":true}` only.
- Inputs: earrings and necklace go on the portrait (necklace needs the neck ≥ 15% of image width; a pendant can be clipped on a tight crop). Ring, bracelet and watch go on the **hand photo** (back of the hand or wrist, five fingers visible).
- Docs sample images for manual tests: hand `https://bcw-media.s3.ap-northeast-1.amazonaws.com/strapi/assets/ring_user_01_6d9893abd0_c7427cdb78.jpg`, wrist `.../watch_and_bracelet_user_01_09f16603cb_878dc89179.jpg`, watch `.../watch_product_01_aab8053028_50ab7fe9a5.jpg`, earring `.../earring_product_01_41c943f9fc_037ffb1241.jpg`, necklace `.../necklace_product_01_124206cfbe_3993a2128d.jpg`.

### 2.6 Facial Color Tones (skin tone): `POST /s2s/v2.0/task/skin-tone-analysis` (VERIFIED live, touchstone)

```json
{"src_file_id":"<face-crop fid>","face_angle_strictness_level":"medium"}
```
- `face_angle_strictness_level` is optional: `strict | high (default) | medium | low | flexible`. The pitch, yaw and roll limits are 4/6/4°, 10°, 15°, 20° and 30° respectively.
- Costs 20 units and takes about 1.5 s.
- Success response (no image URL):
```json
{"status":200,"data":{"error":null,"task_status":"success","results":{
 "color":{"skin_color":"#bc9d88","eye_color":"#342724","eye_color_name":"Brown","lip_color":"#be8782",
          "eyebrow_color":"#805d47","hair_color":"#B56637","hair_color_name":"Auburn"},
 "face_quality":{"has_face":true,"area":"good","frontal":"good","lighting":"good","faceangle":"good"}}}}
```
- `eye_color_name` is one of `Amber | Brown | Green | Blue | Gray | Other`. `hair_color_name` is one of `Auburn | Black | Blonde | Brown | Grey/White | Red`.
- **There is no undertone field.** `FaceProfile.undertone` must be derived from `skin_color` (in Lab, b* relative to a*) or judged by the LLM. Label it as our estimate.

### 2.7 Face Attributes & Ratio: `POST /s2s/v2.0/task/face-attr-analysis` (VERIFIED docs; result shape from schema, no live example)

```json
{"src_file_id":"<face-crop fid>","features":["faceShape","eyeShape","eyelid","lipShape","eyebrowShape"],"face_angle_strictness_level":"medium"}
```
- `features` is required. **The unit cost depends on how many you send**: 1–5 cost 10, 6–14 cost 20, 15–28 cost 30.
- Selectable values:
  - `faceShape`
  - eyes: `eyeShape`, `eyeSize`, `eyeAngle`, `eyeDistance`, `eyelid`
  - brows: `eyebrowShape`, `eyebrowThickness`, `eyebrowDistance`, `eyebrowShortness`
  - `cheekbones`, `lipShape`, `noseWidth`, `noseLength`, `age`, `gender`
  - colours: `eyeColor`, `lipColor`, `eyebrowColor`, `hairColor`
  - ratios: `horizontalThird`, `verticalFifth`, `faceAspectRatio`, `eyeAspectRatio`, `eyebrowPosition`, `eyebrowArch`, `eyeHeightToEyebrowDistance`, `noseAspectRatio`, `noseWidthToMouthWidth`, `noseToLipToChin`, `upperLipToLowerLip`
- **Recommended 5 for makeup:** `faceShape, eyeShape, eyelid, lipShape, eyebrowShape` (10 units). Colours come from skin-tone.
- Result keys (`data.results`) are **lower-case and differently named** from the request features:
  - `faceshape`: `Triangle|Diamond|Heart|InvTriangle|Oblong|Oval|Round|Square|Unknown`
  - `eyelid`: `{left_eyelid,right_eyelid: Hooded-lid|Single-lid|Double-lid|Deep-Set; left_shape,right_shape: Narrow|Round|Almond; left_angle,right_angle: Downturned|Upturned|Average; setting: Close-set|Wide-Set|Average; size: Big|Small|Average}`. Eye shape, angle, distance and size all live under `eyelid`.
  - `eyebrow`: `{left_shape,right_shape: Hard Angled|Soft Angled|Straight|Rounded|Obscured; gap: Far-Apart|Close|Average; *_thickness: Dense|Sparse|Average|Unknown; ...}`
  - `lipshape`: an **array** from `Bow|Downturned|Full|Heavy Lower Lip|Heavy Upper Lip|Narrow|Round|Thin|Wide|Average`
  - `nose`: `{width: Narrow|Broad|Average, length: Long|Short|Average}`
  - `cheekbone`: `{left,right,overall: Flat Cheekbone|High Cheekbone|Low Cheekbone|Round Cheeks}`
  - `agegender`: `{age, gender: female|male|unknown}`
  - `color`: like §2.6 but without `skin_color`
  - `facialratio`: arrays of numbers
  - `face_quality`
- Whether unrequested keys also appear is unverified. Parse defensively (every key optional) and store the raw JSON.
- Mapping `faceshape` to makeup patterns: contour and highlighter labels exist for `Oval`, `Heart`, `InvTriangle` (`Invtriangle*`), `Round`, `Triangle`, `Square` (highlighter) and `Oblong` (highlighter).

### 2.8 Image Generator V2 (text-to-image): `POST /s2s/v2.0/task/text-to-image/youcam` (VERIFIED live, DevDaring and is-it-working)

```json
{"model":"youcam-image-v2","prompt":"Front-facing e-commerce product photo of a single floor-length emerald satin gown ... plain white background, no person",
 "negative_prompt":"person, face, hands, mannequin, text, watermark, cropped","size":"1104*1472","prompt_extend":false}
```
- `model` is the only value seen: `"youcam-image-v2"`.
- `size` uses a literal `*` separator. One of `"1664*928" | "1472*1104" | "1328*1328" | "1104*1472" | "928*1664"` (portrait `1104*1472` is best for garments).
- `negative_prompt` and `prompt_extend` (bool; `false` keeps the prompt literal) are optional.
- Result `data.results.url`, 1 unit.
- Image-to-image is at `/s2s/v2.0/task/image-to-image/youcam` (1 unit); its body was not researched.

---

## 3. OpenAI (Node SDK `openai@7.45.1`, Responses API)

> **Historical.** The app no longer uses OpenAI: the agent moved to Anthropic Claude on 2026-10-30 (see [the model layer](../app/src/lib/server/llm/README.md)). This section is kept as research notes only.

### 3.1 Models (ids VERIFIED in the SDK's `ChatModel` union; positioning from launch coverage, 2026-10)

| Use | Model id | Why |
|---|---|---|
| Agent: tools + vision + web search | **`gpt-6.1-terra`** | Released 2026-10-26. The mid-tier, pitched for agents, visual reasoning and computer use. $1 in / $5 out per 1M tokens. More than 3× faster than Sol and Astra. |
| Agent fallback / harder reasoning | `gpt-6.1-sol` | $2 / $10. Requires the Responses API for tools, and reasoning cannot be set to `none`. |
| Cheap extraction (invitation fields, product JSON) | **`gpt-6-luna`** | $0.10 / $0.50. Supports image input, function calling and structured output. |
| Flagship (not needed) | `gpt-6-astra` | $10 / $50 |

- Put the model ids in config (`OPENAI_AGENT_MODEL`, `OPENAI_FAST_MODEL`) so they can be swapped without a deploy.
- `reasoning.effort` accepts `'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'`, but not every model supports every value. Use **`'low'`** for the agent and the extractor. INFERRED: `low` is safe everywhere, while `none` and `minimal` are not supported on all models, and older models rejected `minimal` together with web search.

### 3.2 Streaming tool-call loop (typechecked against the installed SDK)

```ts
import OpenAI from 'openai';
import type { ResponseInputItem, ResponseFunctionToolCall, Tool } from 'openai/resources/responses/responses';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tools: Tool[] = [
	{ type: 'web_search', user_location: { type: 'approximate', country: 'NG', city: 'Lagos' }, search_context_size: 'medium' },
	{
		type: 'function',
		name: 'try_on_outfit',
		description: 'Render a garment on the user.',
		strict: true, // FunctionTool.strict is REQUIRED in the type (boolean | null)
		parameters: {
			type: 'object',
			properties: {
				lookId: { type: 'string' },
				garmentCategory: { type: 'string', enum: ['upper_body', 'lower_body', 'full_body', 'outer'] },
				note: { type: ['string', 'null'] } // optional => nullable + still listed in required
			},
			required: ['lookId', 'garmentCategory', 'note'],
			additionalProperties: false
		}
	}
];

export async function turn(input0: ResponseInputItem[], previousResponseId?: string) {
	let input = input0;
	let prev = previousResponseId;
	for (let round = 0; round < 8; round++) {
		const stream = await client.responses.create({
			model: 'gpt-6.1-terra',
			instructions: SYSTEM_PROMPT, // NOT carried over by previous_response_id: send it every call
			input,
			previous_response_id: prev,
			tools,
			reasoning: { effort: 'low' },
			include: ['web_search_call.action.sources'],
			stream: true
		}); // type: Stream<ResponseStreamEvent>, async-iterable
		const calls: ResponseFunctionToolCall[] = [];
		let responseId = '';
		for await (const ev of stream) {
			switch (ev.type) {
				case 'response.created': responseId = ev.response.id; break;
				case 'response.output_text.delta': emitText(ev.delta); break; // ev.item_id, ev.output_index
				case 'response.output_text.annotation.added':
					if (ev.annotation?.type === 'url_citation') addSource(ev.annotation.url, ev.annotation.title);
					break;
				case 'response.web_search_call.in_progress':
				case 'response.web_search_call.searching': activity('Searching the web…'); break;
				case 'response.web_search_call.completed': activityDone(); break;
				case 'response.output_item.added': // ev.item.type === 'function_call' => show "running tool" early
					break;
				case 'response.output_item.done':
					if (ev.item.type === 'function_call') calls.push(ev.item); // has name, call_id, arguments (JSON string)
					break;
				case 'response.completed': responseId = ev.response.id; break;
				case 'response.incomplete': /* ev.response.incomplete_details?.reason e.g. max_output_tokens */ break;
				case 'response.failed': throw new Error(ev.response.error?.message ?? 'OpenAI response failed');
				case 'error': throw new Error(ev.message);
			}
		}
		if (calls.length === 0) return responseId; // store it on the session for the next user turn
		prev = responseId;
		input = await Promise.all(
			calls.map(async (c): Promise<ResponseInputItem> => ({
				type: 'function_call_output',
				call_id: c.call_id,
				output: await runTool(c.name, JSON.parse(c.arguments)) // string, or [{type:'input_image',...}]
			}))
		);
	}
	throw new Error('Too many tool rounds');
}
```

Event facts (VERIFIED from the `.d.ts`):
- `response.function_call_arguments.delta` and `.done` carry only `item_id` and `arguments`, **with no name and no call_id**. Take the complete call from `response.output_item.done` where `item.type === 'function_call'`.
- Text arrives as `response.output_text.delta`, and the full text again in `response.output_text.done`.
- Reasoning summaries arrive as `response.reasoning_summary_text.delta`. They only appear if you request `reasoning.summary`.
- Assistant `message` items carry `phase?: 'commentary' | 'final_answer'`. New models may stream a short commentary message before tool calls; it is fine to show it.
- If you resend history **manually** instead of using `previous_response_id`, resend the output items verbatim, phase included. The SDK warns that dropping `phase` degrades quality.
- A tool can return images: `output` may be `Array<{type:'input_text',text} | {type:'input_image',image_url,detail?} | {type:'input_file',...}>`. That lets the agent look at a rendered try-on.

### 3.3 Conversation state

- **Use `previous_response_id`** (the server keeps state; `store` defaults to `true`; responses are retained about 30 days).
- Within a turn, chain each tool round with the id of the previous round. Across turns, store `lastResponseId` on the session and pass it with the new user message.
- This avoids re-sending base64 images on every call.
- `instructions` is not inherited, so send it on every request.
- Demo mode never calls OpenAI, so stale ids are not a problem. A live session restored after more than 30 days needs a fresh chain: re-seed it with a text summary.

### 3.4 Web search tool (VERIFIED types)

- Type string: **`'web_search'`** (or the pinned `'web_search_2025_08_26'`). `'web_search_preview'` is the older tool.
- Options:
  - `user_location: { type:'approximate', country?: 'NG' (ISO-2), city?, region?, timezone?: 'Africa/Lagos' }`. If omitted, it **defaults to the US**.
  - `search_context_size: 'low'|'medium'|'high'`
  - `filters: { allowed_domains?: string[] }`
  - `external_web_access?: boolean`
- Citations arrive in the final message as `output_text.annotations[]` items `{type:'url_citation', url, title, start_index, end_index}`, and when streaming as `response.output_text.annotation.added`.
- `include: ['web_search_call.action.sources']` adds every consulted URL at `web_search_call.action.sources[].url` (the item has `type:'web_search_call'` and `action.type:'search'|'open_page'|'find_in_page'`). Use these for `EventBrief.sources` and `Product.url`.
- `tool_choice` cannot name `web_search` directly: `ToolChoiceTypes` only lists `web_search_preview`. Leave it at `'auto'`, or use `{type:'allowed_tools', mode:'required', tools:[{type:'web_search'}]}`.

### 3.5 Vision and PDF input (VERIFIED types)

```ts
const userItem: ResponseInputItem = {
	role: 'user',
	content: [
		{ type: 'input_text', text: 'Here is my invitation.' },
		{ type: 'input_image', image_url: `data:image/jpeg;base64,${b64}`, detail: 'auto' }, // detail is REQUIRED in the type: 'low'|'high'|'auto'|'original'
		{ type: 'input_file', filename: 'invite.pdf', file_data: `data:application/pdf;base64,${pdfB64}` } // file_url / file_id also allowed
	]
};
```
- Use `detail: 'low'` for wardrobe thumbnails and `'high'` for an invitation with small print.
- Errors arrive as `response.error.code`, for example `invalid_image_format`, `image_too_large` or `invalid_base64_image`.

### 3.6 Structured outputs and strict schemas (VERIFIED types; strict-mode rules are long-standing OpenAI behaviour)

```ts
const r = await client.responses.create({
	model: 'gpt-6-luna',
	input,
	reasoning: { effort: 'low' },
	text: { format: { type: 'json_schema', name: 'event_brief', strict: true, schema: EVENT_SCHEMA } }
});
const brief = JSON.parse(r.output_text);
```
- In strict mode (for both function `parameters` and `json_schema`):
  - **every object needs `additionalProperties: false`**;
  - **every property must be listed in `required`**;
  - express an optional field as `type: ['string','null']`;
  - `enum`, `anyOf`, arrays and nested objects are fine;
  - avoid `minLength`, `pattern` and `format` on fields where a violation must not fail the call; validate ranges such as 0–100 ourselves.
- For the makeup tool, give the model a **strict schema with enums from §2.3.2**, but still run our own validator: the colorNum ↔ palettes count rule and the texture-conditional fields cannot be expressed cleanly.
- To keep the strict schema simple, let the LLM produce a simplified spec, for example `{category, pattern, colors[], finish, intensity}`, and have code expand it into the YouCam effect, filling the texture-required fields with defaults.

---

## 4. SvelteKit 3.1 (installed) — what a Kit-2-trained coder will trip on

All VERIFIED from `node_modules/@sveltejs/kit@3.1.1`. `pnpm check` passes on the current scaffold (0 errors).

| Topic | Kit 3 reality |
|---|---|
| Config | **No `svelte.config.js`.** Kit options go straight into `sveltekit({ adapter, csrf, paths, ... })` in `vite.config.ts`, as the scaffold already does. A `vitePlugin` key is removed: pass vite-plugin-svelte options to `sveltekit()` as well. |
| `$lib` | **Removed.** Importing `$lib/...` throws `module_removed_lib`. Use `#lib/...` (`package.json` `"imports"` plus tsconfig `paths`, already set up). The `kit.files.lib` and `alias` options are removed or deprecated. |
| `+server.ts` typing | `import type { RequestHandler } from './$types';` then `export const POST: RequestHandler = async ({ params, request }) => {...}`. This is unchanged and the scaffold uses it. A generic `RequestHandler` is still exported from `@sveltejs/kit`. `json`, `text`, `error` and `redirect` still come from `@sveltejs/kit`. |
| `$app/environment` | **Deprecated** (it warns): use **`$app/env`** (`browser`, `dev`, `building`, `version`). |
| `$app/stores` | **Removed** (it throws `app_stores_removed`): use `$app/state` (`page`, `navigating`, `updated`, all rune-based objects, so no `$` prefix). |
| `$app/navigation` | Still exists: `goto`, `invalidate`, `invalidateAll`, `refreshAll`, `preloadData`, `preloadCode`, `pushState`, `replaceState`, `beforeNavigate`, `afterNavigate`, `onNavigate`, `disableScrollHandling`. |
| `$app/paths` | Only **`asset()`, `resolve()`, `match()`**. The `base` and `assets` constants are **gone**. Use `resolve('/api/sessions')` or plain absolute paths (we have no base path). |
| `$env/*` | `$env/static/private`, `$env/dynamic/private` and the public variants are **deprecated**, replaced by `$app/env/private` and `$app/env/public` with an optional `src/env.ts` `defineEnvVars`. We use `process.env` in `config.ts`, so this does not matter. Do not add `$env` imports. |
| `$service-worker` | Removed; use `$app/service-worker`. |
| `$app/server` | `getRequestEvent()`, `read()`, plus remote functions (`query`, `command`, `form`, `prerender`). We do not need remote functions. |
| tsconfig | `extends: "$app/tsconfig"`, `types: ["$app/types", "node"]`. `./$types` is generated by `svelte-kit sync`, so run `pnpm check` (which syncs first) after adding routes. |
| `csrf.checkOrigin` | Removed. Use `csrf: { trustedOrigins: [...] }`, where `['*']` disables the check. |

**SSE from `+server.ts`.** Return a standard `Response` whose body is a `ReadableStream<Uint8Array>`, with headers `content-type: text/event-stream`, `cache-control: no-cache, no-transform` and `x-accel-buffering: no`. `src/lib/server/sse.ts` already does this correctly, including a heartbeat and keeping the run going after the client disconnects. Nothing Kit-specific is needed. Do not wrap it in `json()`.

**adapter-node 6 environment variables** (read at runtime, from `adapter-node/src/env.js`): `HOST`, `PORT`, `SOCKET_PATH`, `XFF_DEPTH`, `ADDRESS_HEADER`, `PROTOCOL_HEADER`, `HOST_HEADER`, `PORT_HEADER`, **`BODY_SIZE_LIMIT`** (default **`512K`**; accepts a `K`, `M` or `G` suffix), `SHUTDOWN_TIMEOUT`, `IDLE_TIMEOUT`, `KEEP_ALIVE_TIMEOUT`, `HEADERS_TIMEOUT`.
- For 10 MB photos, set **`BODY_SIZE_LIMIT=12M`**: multipart framing adds overhead, and invitation PDFs also need room. In `vite dev` the limit does not apply.
- **There is no `ORIGIN` env var any more.** The origin is `paths.origin` (set at build time in `sveltekit({ paths: { origin } })`) or is derived from the request: protocol from `PROTOCOL_HEADER`, **defaulting to `https`**, and host from `HOST_HEADER` or the Host header.

> **Upload CSRF trap (production build only).** Kit rejects `POST`/`PUT`/`PATCH`/`DELETE` requests with a **form content type** (`multipart/form-data`, `x-www-form-urlencoded`, `text/plain`) **or no content type** when the `Origin` header does not equal the self-origin. It answers 403 "Cross-site POST form submissions are forbidden".
>
> Running `node build` over plain `http://localhost:3000` makes the self-origin `https://localhost:3000`, so our multipart `POST /api/sessions/:id/assets` fails, and so does any body-less POST.
>
> Fixes, pick one:
> 1. Deploy behind HTTPS. Behind a TLS-terminating proxy, also set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`.
> 2. Set `csrf: { trustedOrigins: ['http://localhost:3000'] }` in `sveltekit({...})` for local prod tests.
> 3. Always send a JSON body, with `content-type: application/json`, on body-less POSTs.
>
> JSON POSTs, including `/messages`, are never affected, and `vite dev` skips the check.

---

## 5. What this changes in our architecture

1. **Base URL**: switch to `yce-api-01.makeupar.com`.
2. **Image derivation layer** (new, needs `sharp`). Each feature has incompatible limits (§1.5):
   - analysis: face crop ≥ 60% of width, JPEG;
   - hair: JPEG, ≤ 1024 px, shoulders visible;
   - makeup: < 1920 px;
   - clothes: ≤ 4096 px.

   Flatten makeup PNG-with-alpha results onto white. Chain renders by download → re-encode → re-upload, not by passing result URLs.
3. **The face panel is sequential**: makeup, then hair (on the makeup result), then earrings, then necklace. Each step re-uploads the previous result. The hair step needs a JPEG ≤ 1024 with shoulders, so render the portrait panel at ≤ 1024 throughout.
4. **There is no undertone from YouCam.** Derive it from `skin_color` and label it as an estimate. Face-attr result keys differ from the request names (§2.7).
5. **Jewellery uses a different body shape** (`source_info` / `object_infos` / `ref_file_urls[]`). Keep it in its own wrapper.
6. **Makeup safety**: the agent must choose labels from the §2.3.2 whitelist, and a validator must enforce palette counts and texture extras before spending. Invalid payloads fail silently, but cost nothing.
7. **Global YouCam rate limiter** (about 0.8 req/s) shared by all sessions. No create retries.
8. **Deployment**: HTTPS (or `trustedOrigins`) plus `BODY_SIZE_LIMIT=12M`. There is no `ORIGIN` env var.
9. **OpenAI**: `gpt-6.1-terra` for the agent, `gpt-6-luna` for extraction, `previous_response_id` chaining, `web_search` with `user_location` set from `session.location`.

## 6. Sources

- YouCam docs dump: https://github.com/TanishaJayabalan/atelier-youcam/blob/HEAD/api.md (Makeup, Clothes, Hair, Earrings, Skin tone and Face attributes sections)
- Verified notes and live price list: https://github.com/DevDaring/YouCam_Hackathon/blob/HEAD/Codes/docs/API_NOTES.md, `Codes/fixtures/youcam/feature_cost.json`, `Codes/fixtures/youcam/hair_templates.json`
- Live verification: https://github.com/Bowen1314/unstack/blob/HEAD/docs/API_NOTES.md
- Live makeup and skin tone, corrections: https://github.com/habeebsl/touchstone/blob/HEAD/docs/youcam-api-notes.md, `app/src/lib/colorEngine/template.ts`
- Live 2D jewellery: https://github.com/Ajayfrizzy/shopping_concierge/blob/HEAD/apps/api/src/youcam/live.ts, `docs/evidence/youcam-live/http-operations.json`
- Production cloth-v4 and makeup client, catalog-checked labels: https://github.com/vlad-ed-git/kostuma/blob/HEAD/lib/fitting-room/youcam.ts, `lib/makeup.ts`, `scripts/makeup/check-patterns.mjs`
- Jewellery and bracelet params: https://github.com/Ritesh-Root/YOUcam/blob/HEAD/src/stylist/features.ts, https://github.com/simple-deploy/jewelry-try-on/blob/HEAD/app.js
- Shoes V2 and text-to-image: https://github.com/hatif03/modelier/blob/HEAD/lib/youcam/fashionAccessories.ts, `lib/youcam/textToImage.ts`
- Shoes V3 announcement: https://www.perfectcorp.com/business/blog/general/ai-shoes-virtual-try-on-v3-api
- OpenAI models: https://bleepingcomputer.com/news/artificial-intelligence/openai-launches-gpt-61-terra-with-3x-faster-ai-agents-50-percent-lower-pricing, https://docs.litellm.ai/blog/gpt_6_sol_luna, https://vercel.com/i/gpt-6-sol-vs-luna, https://www.lindy.ai/blog/gpt-6
- Installed packages: `app/node_modules/openai` (7.45.1), `@sveltejs/kit` (3.1.1), `@sveltejs/adapter-node` (6.0.1)
