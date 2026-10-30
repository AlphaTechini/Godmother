# Hackathon: YouCam API Skin AI & eCommerce VTO Hackathon

Hosted by **Perfect Corp.** (NYSE: PERF) on Devpost. This is their second YouCam API hackathon.

- Page: https://youcam-api-skin-ai-ecommerce.devpost.com/
- Rules: https://youcam-api-skin-ai-ecommerce.devpost.com/rules
- Announcement (Oct 13, 2026): https://www.perfectcorp.com/business/news/YouCam-API-Hackthon-eCommerce

## Deadline

**Submissions close Monday, Nov 2, 2026 at 11:45am EST**
(16:45 UTC, 5:45pm in Nigeria. US daylight saving ends Nov 1, so it is EST, UTC-5.)

## Prizes ($6,000 cash)

| Prize | Cash | Extras |
|---|---|---|
| 1st place | $2,500 | Feature blog, product/developer marketing meeting |
| 2nd place | $1,000 | Feature blog, product/developer marketing meeting |
| 3rd place | $500 | Feature blog, product/developer marketing meeting |
| Women in Tech Special Award | $1,000 | |
| Rising Star Award (students only) | $1,000 | |

Realistically we compete for the top three ($4,000 across three slots).

## Topics (pick the one that fits)

- **Skin AI:** help people understand their skin at the moment it matters (before a purchase, after a breakout, at the mirror) and know what to do next. Skin AI alone or combined with other YouCam APIs.
- **eCommerce VTO:** bring beauty and fashion virtual try-on together into one seamless experience that changes how people shop.

**Godmother enters eCommerce VTO.** It combines fashion try-on (clothes, shoes, accessories) with beauty try-on (makeup, hair) in one flow, and uses face analysis to drive the makeup.

## Requirements

- Integrate **at least one YouCam API** into a **functional web or mobile prototype** with clear consumer or retail value.
- "Fresh, unexpected solutions to real-world pain points in beauty, fashion, or eCommerce, not surface-level wrappers."
- A first-time user should grasp the value instantly.
- Agentic AI workflows are explicitly welcome.
- New builds and major upgrades of existing projects are both allowed.

## What to submit

- **Code repository URL**: public with a licence, or private and shared with the organisers' address listed on the Devpost page. Must contain all source, assets and instructions needed to run it.
- **Text description**: features, functionality, and the consumer or retail value.
- **Screenshots** of the project.
- **Demo video, 1 to 3 minutes**, public on YouTube (preferred), Vimeo or Youku:
  - judges don't have to watch past 3 minutes
  - must explain which YouCam APIs are used
  - must show the project running on the device it was built for
  - no third-party trademarks or copyrighted music without permission
- Winners must do an exit interview and agree to a blog article.

## Judging criteria

1. **Technological implementation:** how thoroughly and skilfully YouCam APIs are integrated; clear consumer or retail value; genuine, working, non-trivial code.
2. **Design:** a complete, coherent product experience, not just a technical proof of concept.
3. **Potential impact:** a credible, specific case for solving a real problem for a real audience, and the demo shows it does.
4. **Quality of idea:** a creative, non-obvious use of YouCam APIs, with real understanding of the problem space.

Traction and live users are not judging criteria.

## Eligibility

Above the legal age of majority. Excluded: Afghanistan, Antarctica, Belarus, Brazil, China, Crimea, Cuba, Djibouti, Donetsk, Iran, Iraq, Italy, North Korea, Luhansk, Quebec, Russia, Somalia, Sudan, Ukraine, Venezuela, Vietnam, Western Sahara. **Nigeria is eligible.**

## Free API units

- 1,000 free API units per registered participant: register on Devpost, get the redeem code by email, then Account > Redeem Code at https://yce.perfectcorp.com/ai-api
- Bonus units for sharing the project online (form linked on the Devpost page).
- Units are only charged when a task succeeds. Failed tasks are free. A task that is not polled before it times out is still charged.
- Check the balance at https://yce.perfectcorp.com/api-console/en/api-keys/ or with `npm run check balance` in `capability-checks/`.

Online Editor **credits** (the consumer web app, 5 on signup) are a different currency from API **units**. Only units matter here.

## API unit costs we care about

From each feature's "Unit Consumption" section at https://docs.perfectcorp.com/reference/

| Feature | Units |
|---|---|
| Clothes try-on (cloth v2/v3) | 2 |
| Shoes try-on (v2/v3) | 2 |
| Hat, scarf, bag | 2 each |
| Earrings, ring, bracelet | 1 single, 2 stacked |
| Necklace, watch | 1 |
| Makeup try-on | 1 |
| Look try-on, makeup transfer | 2 |
| Hairstyle | V2.0: 1 preset / 2 custom; V2.1: 2 |
| Facial Color Tones (skin tone) | 20 |
| Face Attributes & Ratio | 10 (1-5 features), 20 (6-14), 30 (15-28) |
| Skin Analysis | 9-16 SD, 12-22 HD depending on concerns |
| Image Generator | V1: 2, V2: 1 |
| Image to video V2 | 1/sec 480p, 2/sec 720p, 3/sec 1080p |

Value per unit: Devpost valued 5,000 units at about $275 in round 1, so about **$0.055 per unit** (their estimate, not an official price).

## Round 1 (Jul 6 - Aug 17, 2026): what won

1,280 registered, 238 submissions. Gallery: https://youcam-api.devpost.com/project-gallery

| Place | Project | What it is | YouCam APIs |
|---|---|---|---|
| 1st ($5,000) | [Aloud](https://devpost.com/software/aloud-lxqr70) | Voice-first beauty assistant for blind and low-vision shoppers; barcode scan, eyes-free selfie capture, skin read-outs, before/after makeup check | Skin Analysis, Skin Tone, MCP server |
| 2nd ($1,000) | [ShadeSpan](https://devpost.com/software/shadespan) | Audits a clothing catalogue across six Fitzpatrick skin tones and flags garments that disappear on some skin | Clothes try-on, Skin AI for face crops |
| 3rd-5th (5,000 units) | [CASTING](https://devpost.com/software/casting) | One product rendered on eight skin tones, contrast score, product-page image pack | Clothes, Skin Analysis, Fitzpatrick, Skin Tone |
| 3rd-5th | [KeepMe](https://devpost.com/software/keepme) | Verifies try-on results didn't change protected features (face, glasses, body), repairs drift, signed receipt | Clothes v3, Skin Analysis |
| 3rd-5th | [ConfidFit](https://devpost.com/software/confidfit) | Shopify app adding a "Try on" button to product pages | Clothes v3 |

### Lessons

- None of the winners reported real users. They won on a sharp problem, a working end-to-end demo on real inputs, and measured numbers in the write-up (e.g. "2 of 14 garments pass on all skin tones", "10 of 10 eyes-free captures accepted").
- Clothes try-on appeared in four of five winners. Combining several APIs in one coherent flow scored well (CASTING used four).
- Winners shipped a demo mode or fixtures so judges could see results without spending units.
- Budget units: skin tone analysis is 20 units, ten times a try-on; one round 1 team burned 500-800 units on skin-tone calls alone.
