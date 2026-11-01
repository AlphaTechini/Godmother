<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Wordmark from '#lib/components/ui/Wordmark.svelte';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import StartDialog from '#lib/components/ui/StartDialog.svelte';
	import { getAuthState, rememberGuestSession, type AuthState } from '#lib/client/account';
	import { createSession, getHealth, type Health } from '#lib/client/api';

	let health = $state<Health | null>(null);
	let healthFailed = $state(false);
	let busy = $state(false);
	let auth = $state<AuthState | null>(null);
	let choosing = $state(false);
	let failure = $state('');
	let scrolled = $state(false);

	const liveReady = $derived(!!health?.live.llm && !!health?.live.youcam);
	const checking = $derived(!health && !healthFailed);

	onMount(() => {
		getHealth()
			.then((h) => (health = h))
			.catch(() => (healthFailed = true));
		void getAuthState().then((a) => (auth = a));
	});

	async function begin() {
		busy = true;
		failure = '';
		try {
			const s = await createSession('live');
			if (!s.ownerId) rememberGuestSession(s.id);
			await goto(`/studio/${s.id}`);
		} catch (e) {
			failure = e instanceof Error ? e.message : String(e);
			choosing = false;
			busy = false;
		}
	}

	/** Someone not signed in chooses first; there's nothing to choose once they are. */
	function start() {
		if (auth?.accounts && !auth.user) choosing = true;
		else void begin();
	}

	const missing = $derived(
		health
			? [!health.live.llm && 'Anthropic', !health.live.youcam && 'YouCam']
					.filter(Boolean)
					.join(' and ')
			: ''
	);

	const APIS = [
		{
			name: 'Clothes try-on',
			use: 'Every garment of all three looks, one call per piece, on your full-body photo.',
			units: '2 per garment'
		},
		{ name: 'Shoes try-on', use: 'The chosen look’s shoes, on your feet.', units: '2' },
		{
			name: 'Makeup try-on',
			use: 'Foundation to lips, chosen from your face analysis, on your portrait.',
			units: '1'
		},
		{ name: 'Hairstyle', use: 'A template picked for the neckline and the evening.', units: '2' },
		{
			name: 'Jewellery & watch',
			use: 'Earrings and necklace on the portrait; watch and ring on your hand.',
			units: '1 each'
		},
		{
			name: 'Face analysis',
			use: 'Skin tone, undertone, face and feature shapes. Runs once.',
			units: '30'
		}
	];
</script>

<svelte:head>
	<title>Godmother · Prepare for the gala</title>
</svelte:head>

<svelte:window onscroll={() => (scrolled = window.scrollY > 12)} />

{#snippet ctas(size: 'lg' | 'md')}
	<div class="ctas">
		{#if liveReady || checking}
			<button
				type="button"
				class="btn btn-primary {size === 'lg' ? 'btn-lg' : ''}"
				disabled={busy || checking}
				onclick={start}
			>
				{#if busy && !choosing}<Spinner />Setting the table…{:else}Start <ArrowRight />{/if}
			</button>
			{#if auth?.accounts}
				<a class="btn btn-secondary {size === 'lg' ? 'btn-lg' : ''}" href="/account">
					{auth.user ? 'History' : 'Sign in'}
				</a>
			{/if}
		{:else}
			<a class="btn btn-primary {size === 'lg' ? 'btn-lg' : ''}" href="/studio/mock?stage=event"
				>Explore the preview <ArrowRight /></a
			>
			<button
				type="button"
				class="btn btn-secondary {size === 'lg' ? 'btn-lg' : ''}"
				disabled
				aria-describedby="live-status">Start</button
			>
		{/if}
	</div>
{/snippet}

<StartDialog
	open={choosing}
	{busy}
	guestUnits={auth?.units?.guest ?? 50}
	userUnits={auth?.units?.user ?? 60}
	onguest={begin}
	onclose={() => (choosing = false)}
/>

<div class="page">
	<nav class="nav" class:scrolled aria-label="Main">
		<Wordmark href="/" size={21} />
		<div class="links">
			<a href="#how">How it works</a>
			<a href="#lookbook">The lookbook</a>
			<a href="#youcam">Powered by YouCam</a>
		</div>
		<div class="nav-right">
			<ThemeToggle />
			{#if health?.live.accounts}
				<a class="btn btn-ghost btn-sm" href="/account">{auth?.user ? 'History' : 'Account'}</a>
			{/if}
			<a class="btn btn-secondary btn-sm nav-cta" href="#start">Get started</a>
		</div>
	</nav>

	<main>
		<!-- ------------------------------------------------------------ hero -->
		<section class="hero" id="start" aria-labelledby="hero-title">
			<div class="hero-text">
				<p class="eyebrow">An AI stylist for the evening ahead</p>
				<h1 id="hero-title" class="display">
					<span class="nowrap">Prepare for</span> <span class="nowrap">the <em>gala.</em></span>
				</h1>
				<p class="lede">
					Tell Godmother about the event. She finds the dress code, then shows <em>you</em>, not a
					model, in three complete looks, finished down to the lipstick, with a priced list of what
					to buy.
				</p>

				{@render ctas('lg')}

				<p class="status" id="live-status" aria-live="polite">
					{#if checking}
						<span class="dot pending"></span>Checking the studio…
					{:else if healthFailed}
						<span class="dot off"></span>The server can’t be reached. The offline preview runs
						entirely in your browser.
					{:else if liveReady}
						<span class="dot on"></span>Live: the agent and YouCam try-on are connected.
					{:else}
						<span class="dot off"></span>Live mode isn’t set up on this server ({missing} key missing).
						The preview runs in your browser with sample data.
					{/if}
				</p>
				{#if failure}<p class="failure" role="alert">{failure}</p>{/if}
			</div>

			<div class="hero-art" aria-hidden="true">
				<figure class="art-full">
					<img src="/landing/woman-full.webp" alt="" width="1024" height="1536" />
					<figcaption><span>I.</span> The look</figcaption>
				</figure>
				<figure class="art-face">
					<img src="/landing/woman-face.webp" alt="" width="1122" height="1402" />
					<figcaption><span>II.</span> The face</figcaption>
				</figure>
				<figure class="art-hand">
					<img src="/landing/woman-hand.webp" alt="" width="1024" height="1024" />
					<figcaption><span>III.</span> The hand</figcaption>
				</figure>
				<div class="art-tag">
					<span class="eyebrow">Dress code</span>
					<b>Black tie</b>
					<span class="sw"
						><i style:background="#16264A"></i><i style:background="#C9A25A"></i><i
							style:background="#F1E9DA"
						></i></span
					>
				</div>
				<p class="art-note">Illustrative images, not try-on results.</p>
			</div>
		</section>

		<!-- ------------------------------------------------------ the rule -->
		<section class="rule-band" aria-label="How Godmother prioritises">
			<p class="display">
				A stated dress code <em>overrides everything.</em> Then the hosts’ colours, then the place and
				its culture, then your taste.
			</p>
		</section>

		<!-- ----------------------------------------------------- three beats -->
		<section class="beats" id="how" aria-labelledby="how-title">
			<header class="section-head">
				<p class="eyebrow">How it works</p>
				<h2 id="how-title" class="display">One conversation, from invitation to checkout.</h2>
			</header>
			<ol>
				<li>
					<span class="beat-n display">i.</span>
					<h3>Tell it about the event</h3>
					<p>
						Name it or paste a link and Godmother searches the web. Or upload the invitation and
						it’s read for you. Date, venue, colours, and the dress code.
					</p>
					<div class="beat-art brief-art">
						<p class="eyebrow">Found on the web</p>
						<p class="ba-title display">The Eko Heritage Ball</p>
						<p class="ba-meta">Sat 14 Nov · Victoria Island, Lagos</p>
						<p class="ba-code"><span class="tag tag-accent">Dress code</span> Black tie</p>
					</div>
				</li>
				<li>
					<span class="beat-n display">ii.</span>
					<h3>See yourself in three looks</h3>
					<p>
						From your wardrobe, real local shops, or a design for your tailor. Each complete look is
						tried on your own photo. Revise freely, or press <b>Decide for me</b>.
					</p>
					<div class="beat-art looks-art">
						<img src="/landing/woman-full.webp" alt="" loading="lazy" /><img
							src="/landing/woman-look-2.webp"
							alt=""
							loading="lazy"
						/><img src="/landing/woman-look-3.webp" alt="" loading="lazy" />
					</div>
				</li>
				<li>
					<span class="beat-n display">iii.</span>
					<h3>Finish it, then shop it</h3>
					<p>
						Makeup chosen from your face analysis with steps to do it yourself, a hairstyle, the
						jewellery. Then a priced list of only what you still need.
					</p>
					<div class="beat-art shop-art">
						<p class="eyebrow">Estimated total</p>
						<p class="sa-total display num">₦518,500 – ₦618,500</p>
						<p class="ba-meta">5 pieces · NGN · checked today</p>
					</div>
				</li>
			</ol>
		</section>

		<!-- ------------------------------------------------------ lookbook -->
		<section class="lookbook" id="lookbook" aria-labelledby="lb-title">
			<div class="lb-text">
				<p class="eyebrow">The lookbook</p>
				<h2 id="lb-title" class="display">Three photos of you.<br /><em>Three panels.</em></h2>
				<p class="lede">
					Virtual try-on needs the right photo for each job, so the finished look is a three-panel
					spread, not a single guess.
				</p>
				<dl class="panels">
					<div>
						<dt><span class="display">I.</span> Full look</dt>
						<dd>Full-body photo · outfit, outerwear, shoes</dd>
					</div>
					<div>
						<dt><span class="display">II.</span> Face</dt>
						<dd>Portrait · makeup, hairstyle, earrings, necklace</dd>
					</div>
					<div>
						<dt><span class="display">III.</span> Hand</dt>
						<dd>Back of the hand · watch, ring, bracelet</dd>
					</div>
				</dl>
			</div>
			<div class="lb-spread" aria-hidden="true">
				<img class="s-full" src="/landing/man-full.webp" alt="" loading="lazy" />
				<img class="s-face" src="/landing/man-face.webp" alt="" loading="lazy" />
				<img class="s-hand" src="/landing/man-hand.webp" alt="" loading="lazy" />
			</div>
		</section>

		<!-- -------------------------------------------------------- youcam -->
		<section class="youcam" id="youcam" aria-labelledby="yc-title">
			<header class="section-head">
				<p class="eyebrow">Powered by YouCam</p>
				<h2 id="yc-title" class="display">Six YouCam APIs, one evening.</h2>
				<p class="lede">
					Only the outfit is rendered for all three looks. Makeup, hair and jewellery are rendered
					once, for the look you choose: about 46 units a session, under a hard cap.
				</p>
			</header>
			<ul class="apis">
				{#each APIS as api, i (api.name)}
					<li>
						<span class="api-n num">{String(i + 1).padStart(2, '0')}</span>
						<h3>{api.name}</h3>
						<p>{api.use}</p>
						<span class="api-u num">{api.units} {api.units === '1' ? 'unit' : 'units'}</span>
					</li>
				{/each}
			</ul>
		</section>

		<!-- ----------------------------------------------------- final CTA -->
		<section class="finale" aria-labelledby="fin-title">
			<h2 id="fin-title" class="display">Your evening, <em>decided.</em></h2>
			{@render ctas('lg')}
			<a class="preview-link" href="/studio/mock?stage=event"
				>Or open the offline preview <ArrowUpRight size={14} /></a
			>
		</section>
	</main>

	<footer class="foot">
		<Wordmark size={16} />
		<p>
			Built for the YouCam API eCommerce VTO Hackathon. Images on this page are AI-generated
			illustrations of fictional people; in the app, every look is a real try-on of your photos.
		</p>
	</footer>
</div>

<style>
	.page {
		overflow-x: clip;
	}
	.nowrap {
		white-space: nowrap;
	}
	/* --------------------------------------------------------------- nav */
	.nav {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-5);
		height: 68px;
		padding: 0 var(--gutter);
		transition:
			background-color var(--dur-3) var(--ease-out),
			border-color var(--dur-3) var(--ease-out);
		border-bottom: 1px solid transparent;
	}
	.nav.scrolled {
		background: color-mix(in srgb, var(--bg) 82%, transparent);
		backdrop-filter: blur(14px) saturate(1.2);
		border-bottom-color: var(--line);
	}
	.links {
		display: flex;
		gap: var(--space-7);
	}
	.links a {
		font-size: var(--text-sm);
		color: var(--text-2);
		text-decoration: none;
		transition: color var(--dur-2) var(--ease-out);
	}
	.links a:hover {
		color: var(--text);
	}
	.nav-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	/* -------------------------------------------------------------- hero */
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
		gap: var(--space-9);
		align-items: center;
		min-height: calc(100dvh - 68px);
		padding: var(--space-7) var(--gutter) var(--space-10);
		max-width: 1480px;
		margin: 0 auto;
	}
	.hero-text {
		display: grid;
		gap: var(--space-6);
		justify-items: start;
	}
	h1 {
		font-size: clamp(3.2rem, 0.6rem + 7.4vw, 8.4rem);
		line-height: 0.92;
		letter-spacing: -0.035em;
		margin-left: -0.04em;
	}
	h1 em,
	h2 em,
	.rule-band em {
		font-style: italic;
		color: var(--accent);
	}
	.lede {
		font-size: var(--text-md);
		line-height: 1.55;
		color: var(--text-2);
		max-width: 46ch;
	}
	.lede em {
		color: var(--text);
		font-style: italic;
	}
	.ctas {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
	.status {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: var(--text-xs);
		color: var(--text-3);
		max-width: 52ch;
		line-height: 1.5;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
		transform: translateY(-1px);
	}
	.dot.on {
		background: var(--success);
		box-shadow: 0 0 0 3px var(--success-soft);
	}
	.dot.off {
		background: var(--text-3);
	}
	.dot.pending {
		background: var(--accent);
		animation: gm-pulse 1.2s infinite;
	}
	.failure {
		color: var(--danger);
		font-size: var(--text-sm);
	}
	.hero-art {
		position: relative;
		aspect-ratio: 1 / 1.08;
		max-height: 78vh;
		width: 100%;
		justify-self: center;
	}
	.hero-art figure {
		position: absolute;
		margin: 0;
		box-shadow: var(--shadow-3);
		animation: gm-fade-up 900ms var(--ease-out) both;
	}
	.hero-art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: var(--radius-xs);
	}
	.hero-art figcaption {
		position: absolute;
		left: 0;
		bottom: -26px;
		font-size: var(--text-2xs);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--text-3);
	}
	.hero-art figcaption span {
		font-family: var(--font-display);
		font-style: italic;
		letter-spacing: 0;
		text-transform: none;
		font-size: var(--text-sm);
		color: var(--accent);
		margin-right: 4px;
	}
	.art-full {
		left: 22%;
		top: 0;
		width: 50%;
		aspect-ratio: 2 / 3;
	}
	.art-full figcaption {
		bottom: auto;
		top: -26px;
	}
	.art-face {
		left: 0;
		bottom: 7%;
		width: 38%;
		aspect-ratio: 4 / 5;
		animation-delay: 150ms !important;
	}
	.art-hand {
		right: 0;
		bottom: 18%;
		width: 34%;
		aspect-ratio: 1;
		animation-delay: 300ms !important;
	}
	.art-tag {
		position: absolute;
		right: 4%;
		top: 9%;
		display: grid;
		gap: 4px;
		padding: var(--space-3) var(--space-4);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-2);
		animation: gm-fade-up 900ms 450ms var(--ease-out) both;
	}
	.art-tag b {
		font-family: var(--font-display);
		font-style: italic;
		font-weight: 400;
		font-size: var(--text-xl);
		line-height: 1.1;
	}
	.art-tag .sw {
		display: flex;
		gap: 4px;
		margin-top: 2px;
	}
	.art-tag i {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		box-shadow: 0 0 0 1px var(--line-strong);
		/* These colours are the content, so contrast themes must not blank them. */
		forced-color-adjust: none;
	}
	.art-note {
		position: absolute;
		right: 0;
		bottom: 7%;
		width: 34%;
		margin: 0;
		font-size: var(--text-2xs);
		color: var(--text-3);
	}
	/* -------------------------------------------------------- rule band */
	.rule-band {
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		padding: var(--space-10) var(--gutter);
		text-align: center;
	}
	.rule-band p {
		font-size: var(--text-3xl);
		line-height: 1.15;
		max-width: 26ch;
		margin: 0 auto;
	}
	/* ------------------------------------------------------- sections */
	.section-head {
		display: grid;
		gap: var(--space-4);
		max-width: 760px;
		margin-bottom: var(--space-9);
	}
	h2 {
		font-size: var(--text-4xl);
	}
	.beats,
	.youcam {
		padding: var(--space-12) var(--gutter);
		max-width: 1480px;
		margin: 0 auto;
	}
	.beats ol {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-top: 1px solid var(--line-strong);
	}
	.beats li {
		display: grid;
		grid-template-rows: auto auto 1fr auto;
		gap: var(--space-3);
		padding: var(--space-6) var(--space-7) 0 0;
	}
	.beats li + li {
		padding-left: var(--space-7);
		border-left: 1px solid var(--line);
	}
	.beat-n {
		font-size: var(--text-2xl);
		font-style: italic;
		color: var(--accent);
	}
	.beats h3 {
		font-size: var(--text-lg);
		font-weight: 560;
		letter-spacing: -0.01em;
	}
	.beats p {
		color: var(--text-2);
		line-height: 1.6;
	}
	.beats b {
		color: var(--text);
		font-weight: 600;
	}
	.beat-art {
		margin-top: var(--space-6);
		height: 220px;
		border-radius: var(--radius-sm);
		background: var(--surface);
		border: 1px solid var(--line);
		overflow: hidden;
	}
	.brief-art,
	.shop-art {
		display: grid;
		align-content: center;
		gap: 6px;
		padding: var(--space-6);
	}
	.ba-title {
		font-size: var(--text-xl);
		line-height: 1.1;
	}
	.ba-meta {
		font-size: var(--text-xs) !important;
		color: var(--text-3) !important;
	}
	.ba-code {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--line);
		font-family: var(--font-display);
		font-size: var(--text-md);
		color: var(--text) !important;
	}
	.looks-art {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2px;
		background: var(--line);
	}
	.looks-art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 20%;
	}
	.sa-total {
		font-size: var(--text-xl);
		white-space: nowrap;
		line-height: 1.1;
		color: var(--text) !important;
	}
	/* -------------------------------------------------------- lookbook */
	.lookbook {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		gap: var(--space-10);
		align-items: center;
		padding: var(--space-12) var(--gutter);
		background: var(--surface);
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
	.lb-text {
		display: grid;
		gap: var(--space-5);
		max-width: 520px;
		justify-self: end;
	}
	.panels {
		margin-top: var(--space-3);
		border-top: 1px solid var(--line-strong);
	}
	.panels div {
		display: grid;
		grid-template-columns: 140px 1fr;
		gap: var(--space-4);
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--line);
		align-items: baseline;
	}
	.panels dt {
		font-weight: 560;
	}
	.panels dt span {
		font-style: italic;
		color: var(--accent);
		margin-right: 6px;
	}
	.panels dd {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.lb-spread {
		display: grid;
		grid-template-columns: 3fr 2fr;
		grid-template-areas: 'full face' 'full hand';
		gap: var(--space-4);
		max-width: 640px;
	}
	.lb-spread img {
		width: 100%;
		border-radius: var(--radius-xs);
		box-shadow: var(--shadow-2);
	}
	.s-full {
		grid-area: full;
	}
	.s-face {
		grid-area: face;
	}
	.s-hand {
		grid-area: hand;
	}
	/* ---------------------------------------------------------- youcam */
	.apis {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-top: 1px solid var(--line-strong);
	}
	.apis li {
		display: grid;
		grid-template-rows: auto auto 1fr auto;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-6) var(--space-7) 0;
		border-bottom: 1px solid var(--line);
	}
	.apis li:not(:nth-child(3n + 1)) {
		padding-left: var(--space-6);
		border-left: 1px solid var(--line);
	}
	.api-n {
		font-size: var(--text-2xs);
		color: var(--accent);
	}
	.apis h3 {
		font-family: var(--font-display);
		font-size: var(--text-xl);
	}
	.apis p {
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
		max-width: 34ch;
	}
	.api-u {
		margin-top: var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	/* ---------------------------------------------------------- finale */
	.finale {
		display: grid;
		justify-items: center;
		gap: var(--space-6);
		padding: var(--space-12) var(--gutter);
		text-align: center;
		border-top: 1px solid var(--line);
	}
	.finale h2 {
		font-size: var(--text-display);
		line-height: 0.95;
		letter-spacing: -0.03em;
	}
	.finale .ctas {
		justify-content: center;
	}
	.preview-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-sm);
		color: var(--text-2);
		text-decoration-color: var(--line-strong);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-6);
		flex-wrap: wrap;
		padding: var(--space-7) var(--gutter);
		border-top: 1px solid var(--line);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.foot p {
		max-width: 70ch;
	}

	/* ---------------------------------------------------------- responsive */
	@media (max-width: 1100px) {
		.links {
			display: none;
		}
		.hero {
			grid-template-columns: 1fr;
			min-height: 0;
			gap: var(--space-10);
			padding-top: var(--space-8);
		}
		.hero-art {
			max-width: 620px;
		}
		.lookbook {
			grid-template-columns: 1fr;
		}
		.lb-text {
			justify-self: start;
		}
		.apis {
			grid-template-columns: repeat(2, 1fr);
		}
		.apis li:not(:nth-child(3n + 1)) {
			padding-left: 0;
			border-left: 0;
		}
		.apis li:nth-child(2n) {
			padding-left: var(--space-6);
			border-left: 1px solid var(--line);
		}
	}
	@media (max-width: 760px) {
		.nav {
			height: 60px;
		}
		.nav-cta {
			display: none;
		}
		.hero {
			padding-top: var(--space-6);
			gap: var(--space-9);
		}
		.hero-text {
			gap: var(--space-5);
		}
		.ctas {
			width: 100%;
		}
		.ctas > :global(*) {
			flex: 1 1 auto;
		}
		.hero-art {
			aspect-ratio: 1 / 1.15;
		}
		.hero-art figcaption {
			display: none;
		}
		.art-tag {
			right: 0;
			top: 4%;
			padding: var(--space-2) var(--space-3);
		}
		.art-tag b {
			font-size: var(--text-md);
		}
		.rule-band {
			padding: var(--space-9) var(--gutter);
		}
		.rule-band p {
			font-size: var(--text-2xl);
		}
		.beats,
		.youcam,
		.lookbook,
		.finale {
			padding-top: var(--space-10);
			padding-bottom: var(--space-10);
		}
		.beats ol,
		.apis {
			grid-template-columns: 1fr;
		}
		.beats li,
		.beats li + li {
			padding: var(--space-6) 0 var(--space-8);
			border-left: 0;
		}
		.beats li + li {
			border-top: 1px solid var(--line);
		}
		.apis li,
		.apis li:nth-child(2n) {
			padding: var(--space-5) 0 var(--space-6);
			border-left: 0;
		}
		.panels div {
			grid-template-columns: 1fr;
			gap: 2px;
		}
	}
</style>
