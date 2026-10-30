# Godmother: Product Requirements

> **Prepare for the gala.**

Godmother is an AI agent that gets you ready for an event. It finds out what the event expects (dress code, colours, setting), then shows **you** wearing the outfit, shoes, accessories, makeup and hairstyle that fit, and tells you what any missing pieces will cost.

- **Hackathon:** YouCam API Skin AI & eCommerce VTO Hackathon (see [HACKATHON.md](HACKATHON.md))
- **Track:** eCommerce VTO
- **Platform:** web app only
- **Status:** built; live API runs pending (see [§12](#12-open-questions-and-capability-checks)).

---

## 1. The problem

You have an event coming up: a gala, a wedding, a dinner. You've showered, you're standing in front of your wardrobe, and you don't know what to wear, how it should go together, or what to do with your face and hair. Or the event is weeks away and you want a new look, but you can't picture what would fit the occasion, the dress code and you.

Today that means guessing, asking friends, scrolling, or paying a stylist and a makeup artist. More and more people do their own makeup at home, which means they get no expert eye on what suits their face for that specific event.

The pieces exist separately (outfit apps, makeup try-on, event pages) but nothing takes you from "I have this event" to "this is exactly how you'll look, and here's what to buy".

_Sourced, current statistics for the pitch and README are still to be gathered (no studies older than a few years)._

## 2. Who it's for

- Anyone getting ready for a specific event who wants to see the full look on themselves before committing.
- People who do their own makeup and hair and want guidance matched to their face and the occasion.
- Shoppers deciding what to buy or have sewn for an event (the retail angle: Godmother ends in a priced shopping list of real products).

## 3. How it works (user flow)

Everything happens in **one chat window** with file attachments.

1. **Tell it about the event.** Any of:
   - The event's name or link. The agent **searches the web** for it and pulls the date, venue, theme, colours and dress code.
   - Typed details, if the event isn't online.
   - **An invitation** (photo or PDF). A vision model reads it and extracts the text, hands-free. No custom parser needed.
2. **Location.** The agent gets the user's location (asked or detected) so suggestions fit local culture and norms. Someone in India gets Indian occasion wear, not an American default.
3. **Rules of priority.** A stated **dress code overrides everything**. Then event colours and theme, then location and culture, then the user's taste.
4. **Photos of the user.** Full-body photo, a portrait, and (for watches and rings) a hand photo. See §6 for why there are three.
5. **Wardrobe, buy, or sew.** The user can:
   - **Snap clothes they own.** Godmother picks from them, with accessories, and puts the full outfit on them.
   - **Buy:** the agent searches real shops (local ones where possible) for pieces that fit, and tries the **actual product photo** on the user.
   - **Sew:** the agent designs a garment with the image generator, so the user can take the design to a tailor.
6. **Top three looks.** Godmother proposes three complete looks with colour combinations, each tried on the user.
7. **"Decide for me" button.** Instead of adding another decision, Godmother ranks the three and commits to one, with a short reason.
8. **Revise.** The user says what they don't like ("no red", "something less formal", "I hate the shoes") and the agent revises.
9. **Finishing touches** on the chosen look:
   - **Makeup:** face analysis (skin, lip, eye and hair colours, face and feature shapes) drives a makeup choice, shown **on the user's face**, plus step-by-step instructions for doing it themselves.
   - **Hairstyle:** previewed on the user.
   - **Accessories:** shoes, watch, earrings, necklace, other jewellery.
10. **Shopping list** (see §5).
11. **Optional:** a short video of the user turning in the outfit so they see front, back and sides.

## 4. Feature list

| Feature | Detail | Priority |
|---|---|---|
| Chat agent with attachments | One conversational interface for everything | Must |
| Event lookup | Web search for a named event: dress code, theme, colours, venue | Must |
| Invitation reading | Image or PDF, read by a vision model, fed into the conversation | Must |
| Typed event details | Fallback when the event isn't online | Must |
| Location awareness | Culturally appropriate suggestions | Must |
| Dress-code override | Dress code beats every other signal | Must |
| Wardrobe photos | User snaps own clothes; agent selects from them | Must |
| Buy path | Real shop listings; try on the real product photo | Must |
| Outfit try-on | Top, bottom, full-body, outerwear, shoes on the user | Must |
| Top three looks + colour combinations | Three complete looks | Must |
| "Decide for me" | Ranks and commits to one look with a reason | Must |
| Revise from feedback | User states dislikes, agent revises | Must |
| Makeup try-on driven by analysis | Shown on face, plus DIY steps | Must |
| Hairstyle preview | From YouCam templates, chosen by the agent | Must |
| Shopping list with prices | §5 | Must |
| Demo mode | Saved real results so judges can run it without spending units | Must |
| Accessories: earrings, necklace | On the portrait | Should |
| Accessories: watch, ring, bracelet | On the hand photo | Should |
| Sew path | AI-generated garment design, estimated tailoring price | Should |
| Turnaround video | Image-to-video, labelled as AI-imagined back view | Could (cut first) |

## 5. Shopping list

For every piece that **isn't from the user's own wardrobe** (bought or sewn):

- **Total price range** at the top.
- **Expandable breakdown**, one line per item: exact product name (e.g. the specific watch model), shop, price, link.
- A note that the list only covers items the user didn't upload, i.e. pieces they'd have to procure.
- Prices in the user's local currency, with the date they were checked.
- Sewn items show an **estimated** range and are labelled as estimates.

Real listings come first: the agent finds actual products, and the product photo is what gets tried on, so the price shown is for exactly what the user saw on themselves.

## 6. The look board (why three photos)

YouCam's try-on APIs need different input photos:

| Panel | User photo | What goes on it | Why |
|---|---|---|---|
| Full look | Full-body, front-facing | Outfit, outerwear, shoes | Clothes and shoes need the body and feet |
| Face | Portrait / headshot | Makeup, hairstyle, earrings, necklace | Makeup needs face width ≥100 px; hair needs ≥128 px and ≤1024 px long side; necklace needs neck ≥15% of image width |
| Hand | Back of the wrist, five fingers visible | Watch, ring, bracelet | Required by the watch/ring/bracelet APIs |

So the result is a three-panel **lookbook**, presented as a deliberate design. Capability check 8 tests whether a face crop from the full-body photo is good enough for makeup (fewer photos for the user).

## 7. YouCam APIs used

| Step | API | Units |
|---|---|---|
| Face analysis for makeup | Facial Color Tones (skin tone) | 20 |
| Face shape for makeup patterns | Face Attributes & Ratio (1-5 features) | 10 |
| Outfit | Clothes try-on (cloth v3/v4), one garment per call | 2 per garment |
| Shoes | Shoes try-on | 2 |
| Makeup | Makeup try-on (full product control: foundation, concealer, blush, bronzer, contour, highlighter, brows, eyeshadow, eyeliner, lashes, lips) | 1 |
| Hair | Hairstyle V2.1 (templates or reference image) | 2 |
| Earrings / necklace / watch / ring / bracelet | Jewellery & watch try-on | 1 each (2 stacked) |
| Sew path | Image Generator V2 | 1 |
| Optional video | Image to video V2, 720p | 2/sec |

### Cost per session

| Item | Units |
|---|---|
| Face analysis (skin tone 20 + face attributes 10) | 30 |
| Outfit on all three looks (3 × 2) | 6 |
| Finishing the chosen look: shoes 2, makeup 1, hair 2, earrings 1, necklace 1, watch 1 | 8 |
| **Total** | **≈44 units ≈ $2.40** |
| Optional 10 s 720p video | +20 units ≈ $1.10 |

(About $0.055 per unit, based on Devpost's round 1 valuation.)

Unit-saving rules:
- Only the outfit is rendered for all three looks; makeup, hair and accessories only for the chosen one.
- Face analysis runs once per user, not per look.
- Demo mode serves saved results.
- Hard per-session unit cap in the backend.

## 8. Other integrations

- **Anthropic Claude** is the only external AI integration besides YouCam: the agent (reasoning, tool calls), web search for events and shop listings, and vision for invitations and wardrobe photos.

## 9. Known API constraints (from the docs)

- One garment per clothes call; top + bottom = two calls in sequence. Categories: `upper_body`, `lower_body`, `full_body`, `shoes`, `auto`, plus `outer` on v4.
- Clothes references: tops and dresses need a front-facing single-garment product shot (no composites). **Lower-body references must be worn photos**, not flat product shots.
- The clothes docs contradict themselves on full-body vs chest-up user photos (check 1).
- Hairstyle has **no text prompt**: templates or a reference photo only.
- Results come back as a download URL valid for **2 hours**; task IDs and files last 30 days. Whether a result URL can be passed straight into the next task is undocumented (check 5).
- Rate limit: 250 requests per 300 s and 5 QPS, per IP and per key.
- Units are charged only on success, but a task not polled before timeout is still charged.
- The API is server-to-server (browser calls are blocked by CORS), so keys stay in the backend.
- The turnaround video has no 360° control; "turn around" is a prompt and may not work, and the back of the outfit would be invented.

## 10. Demo plan

- A **real gala that is publicly listed online**, found live by the agent in the video.
- An invitation image uploaded and read hands-free.
- People photos: free stock photos and AI-generated people. No real users needed; round 1 winners won without them.
- Show: event found → three looks on the person → "Decide for me" → a revision → makeup and hair on the face → shopping list with real prices and links.
- End by showing the original upload next to the final look board.

### Evidence we'll show (decided before building)

- Real event details pulled live from the web, with the source link visible.
- Real try-on outputs from the YouCam API on real input photos, committed to `evidence/`.
- Real shop listings with working links and prices.
- Measured numbers: units per session, seconds per look, capability-check pass/fail.

## 11. Scope and timeline (deadline Mon Nov 2, 11:45am EST)

| When | Work |
|---|---|
| Thu Oct 29 - Fri Oct 30 | Capability checks; lock the plan around what passes |
| Fri - Sat | Core flow: chat agent, event lookup, invitation reading, outfit try-on, three looks, decide for me, revise |
| Sat - Sun | Makeup, hair, accessories, shopping list, demo mode, deploy |
| Mon morning | Demo video, README (AI-judge format), submit |

**Cut first if short on time:** turnaround video, then sew path, then hand-panel accessories.

## 12. Open questions and capability checks

Scripts in `capability-checks/` test each of these before major code is written:

| # | Question | Decides |
|---|---|---|
| 1 | Does clothes try-on accept a full-body user photo and keep the whole body? | Photo flow |
| 2 | Is a phone snap of a garment on a hanger accepted as a reference? | Whether "snap your wardrobe" works |
| 3 | Is a real shop product photo accepted? | The buy path and shopping list |
| 4 | Is an AI-generated garment accepted and wearable? | The sew path |
| 5 | Can a result URL be fed straight into the next task (outfit → shoes)? | Chaining vs download/re-upload |
| 6 | Does makeup try-on look real, not like a filter? | Makeup feature quality |
| 7 | Do hairstyle templates cover gala styles for men and women? | Hair feature |
| 8 | Is a face crop from the full-body photo good enough for makeup? | Two photos instead of three |

## 13. Proposed stack

- Frontend: SvelteKit (web).
- Backend: TypeScript (Node), holding YouCam and Anthropic keys server-side, with a YouCam client that handles upload, task creation, polling and unit caps.
- Hosting: to decide at build time.
