# Devpost submission

The text and checklist for the submission form. Deadline: Monday, Nov 2, 2026, 11:45am EST (5:45pm in Nigeria).

## Checklist

- [ ] Demo video on YouTube, public or unlisted as the form allows, between 1 and 3 minutes
- [ ] The video names the YouCam APIs used and shows the app running
- [ ] No third-party trademarks or copyrighted music in the video
- [ ] Video link pasted into the root `README.md` (replace the TODO) and pushed
- [ ] Screenshots uploaded, including real results from the live app
- [ ] Repository URL: https://github.com/AlphaTechini/Godmother
- [ ] Track: eCommerce VTO
- [ ] Test the live site once more right before submitting

## Short tagline

An AI stylist that dresses you for one specific event, on your own photos, from dress code to shopping list.

## About the project

### Inspiration

Try-on tools usually start from one product on one shop page. That answers "how does this shirt look on me?", but the question people actually have is "what do I wear to this wedding, and what do I need to buy?" I wanted try-on to start from the event.

### What it does

Tell Godmother about your event by name, link, description or a photo of the invitation. It finds the dress code, colours and setting, then shows you, on your own photos, in three complete looks. Pieces come from clothes you already own, from real shop listings, or from a design for a made-to-measure piece.

Say what you dislike and only that look changes, or ask it to decide for you. It then finishes the chosen look with shoes, makeup with DIY steps, a hairstyle, and jewellery. Finally you get a shopping list priced in your currency, leaving out what you own, and you can film the finished look as a 10-second video.

### Consumer and retail value

Shoppers see the whole outfit on themselves before buying, across shops, for a real occasion. Each try-on links back to a real listing, so the path from "I like this" to buying it is short. The dress code rule also stops the common mistake of buying something that doesn't suit the event.

### How I built it

A Claude agent with 16 tools runs the conversation and research, and every image of the user comes from the YouCam API:

- **Clothes try-on and shoes:** the outfit on the full-body photo
- **Facial colour tones and face attributes:** these drive the makeup and hair choices
- **Makeup try-on and hairstyle:** applied to the chosen look
- **Jewellery try-on (earrings, necklace, ring, bracelet, watch):** on the portrait and hand photos
- **Image Generator:** designs for made-to-measure pieces
- **Image to Video:** the optional film of the finished look

It's one SvelteKit codebase, with pages on Vercel and the API on Cloud Run behind Cloudflare. Sessions are stored in Postgres and images in private storage.

### Challenges

- **Units are real money,** so the server reserves them before any call. Parallel looks can't overshoot the limit, and an interrupted turn finds its task instead of paying twice.
- **Each API frames the body differently,** so one photo couldn't serve them all. That's why there are three, with an input prepared for each feature.
- **Video takes one image and one prompt.** To carry the finished hairstyle into the film, the app pastes the finished head onto the full-body shot, and Claude describes the exact colours and accessories from the pictures.

### What I learned

Asking for the right look isn't enough: the order of operations matters. Trying only outfits on all three looks and finishing just the chosen one keeps a full run at about 45 units.

### Known limits

The video is AI-imagined, so details like a watch dial can drift and the camera path varies. Closing the tab during a video can lose it. The repository's [claims file](CLAIMS.md) lists what is proven and what isn't.

### What's next

Webhooks, so a video finishes and saves after the tab closes. Then a video model with keyframes for a reliable camera path.

## For judges

Open https://godmother.cyberpunkinc.xyz, press **Start**, and continue as a guest. No sign-up is needed, and guests get 50 units, enough for a full run. The video needs 10 more units, so create an account for that.

You'll need a full-body photo, and a portrait and a hand photo for the finishing steps.

To check the code without keys: `cd app`, `pnpm install`, `pnpm verify`.

## Built with

svelte, sveltekit, typescript, node.js, youcam-api, claude, postgresql, supabase, cloudinary, resend, google-cloud-run, vercel, cloudflare, docker
