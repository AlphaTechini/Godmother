<!-- Component gallery: every major component in every state, for review and screenshots. -->
<script lang="ts">
	import Provider from './Provider.svelte';
	import Specimen from './Specimen.svelte';
	import Wordmark from '#lib/components/ui/Wordmark.svelte';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import UnitsMeter from '#lib/components/ui/UnitsMeter.svelte';
	import Swatch from '#lib/components/ui/Swatch.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import Plate from '#lib/components/ui/Plate.svelte';
	import ActivityLine from '#lib/components/chat/ActivityLine.svelte';
	import Suggestions from '#lib/components/chat/Suggestions.svelte';
	import Message from '#lib/components/chat/Message.svelte';
	import Thread from '#lib/components/chat/Thread.svelte';
	import Composer from '#lib/components/chat/Composer.svelte';
	import BlockView from '#lib/components/blocks/BlockView.svelte';
	import RenderSteps from '#lib/components/canvas/RenderSteps.svelte';
	import LookCard from '#lib/components/canvas/LookCard.svelte';
	import BriefView from '#lib/components/canvas/BriefView.svelte';
	import PhotosView from '#lib/components/canvas/PhotosView.svelte';
	import LooksView from '#lib/components/canvas/LooksView.svelte';
	import LookbookView from '#lib/components/canvas/LookbookView.svelte';
	import ShoppingView from '#lib/components/canvas/ShoppingView.svelte';
	import StudioError from '#lib/components/studio/StudioError.svelte';
	import { sessionAt, variants, assets, looks, event, decision, face } from '#lib/client/fixtures';
	import type { SessionClient } from '#lib/client/session.svelte';
	import type { Block, Session } from '#lib/types';

	const now = Date.now();
	const acts = {
		running: { id: 'a1', label: 'Trying look 2 on you', status: 'running' as const, detail: 'Clothes try-on · 2 units', messageId: null, startedAt: now },
		done: { id: 'a2', label: 'Searching the web for “Eko Heritage Ball”', status: 'done' as const, messageId: null, startedAt: now - 2400, endedAt: now },
		failed: { id: 'a3', label: 'Re-checking the price at Island Watch Co.', status: 'failed' as const, detail: 'The shop page timed out', messageId: null, startedAt: now - 5000, endedAt: now }
	};

	function withLooks(s: Session, l = variants.looksMixed()): Session {
		return { ...s, looks: l };
	}
	function streamingSetup(c: SessionClient) {
		const id = 'stream-1';
		c.session.messages.push({ id, role: 'assistant', createdAt: new Date().toISOString(), text: '', attachments: [], blocks: [] });
		c.streamingId = id;
		c.streaming = true;
		c.apply({ type: 'activity', id: 'x1', label: 'Searching the web for “Eko Heritage Ball”', status: 'running' });
		c.apply({ type: 'activity', id: 'x1', label: 'Searching the web for “Eko Heritage Ball”', status: 'done' });
		c.apply({ type: 'activity', id: 'x2', label: 'Reading the official page and guest guidance', status: 'running', detail: 'example.com' });
		c.apply({ type: 'text_delta', messageId: id, delta: 'Found it. **The Eko Heritage Ball** is on Saturday 14 November at the Grand Ballroom, and the dress code is ' });
	}
	function errorSetup(c: SessionClient) {
		c.error = 'The connection closed before Godmother finished. Your messages are saved; try sending again.';
	}

	const blocks: { label: string; block: Block; stage: Session['stage'] }[] = [
		{ label: 'event', block: { type: 'event', event }, stage: 'photos' },
		{ label: 'photo_request (partly filled)', block: { type: 'photo_request', slots: ['fullBody', 'portrait', 'hand'], reason: 'Clothes go on your full-body photo, makeup and hair on your portrait, the watch and ring on your hand.' }, stage: 'photos' },
		{ label: 'wardrobe', block: { type: 'wardrobe', itemIds: ['w-heels', 'w-ring'] }, stage: 'looks' },
		{ label: 'products', block: { type: 'products', products: looks.flatMap((l) => l.pieces).flatMap((p) => (p.source.type === 'product' ? [p.source.product] : [])).filter((p, i, a) => a.findIndex((x) => x.url === p.url) === i).slice(0, 5) }, stage: 'looks' },
		{ label: 'sew_design', block: { type: 'sew_design', design: looks[0].pieces[0].source.type === 'sew' ? looks[0].pieces[0].source.design : { prompt: '', image: assets.sewDesign, estimate: { min: { amount: 1, currency: 'NGN' }, max: { amount: 2, currency: 'NGN' } } } }, stage: 'looks' },
		{ label: 'looks', block: { type: 'looks', lookIds: ['look-1', 'look-2', 'look-3'] }, stage: 'looks' },
		{ label: 'decision', block: { type: 'decision', decision }, stage: 'chosen' },
		{ label: 'face_profile', block: { type: 'face_profile', profile: face }, stage: 'finishing' },
		{ label: 'lookbook', block: { type: 'lookbook', lookId: 'look-1' }, stage: 'finishing' },
		{ label: 'shopping_list', block: { type: 'shopping_list' }, stage: 'done' },
		{ label: 'error', block: { type: 'error', message: 'YouCam rejected the hand photo: all five fingers need to be visible. Nothing was charged.' }, stage: 'done' }
	];

	const photosPartial = (): Session => {
		const s = sessionAt('photos');
		s.photos = { fullBody: assets.uploadFull };
		return s;
	};
	const lookbookInProgress = (): Session => ({ ...sessionAt('finishing'), lookbook: variants.lookbookInProgress() });
	const tokens = ['--bg', '--surface', '--surface-2', '--surface-3', '--line', '--line-strong', '--text', '--text-2', '--text-3', '--accent', '--primary', '--danger', '--success'];
</script>

<svelte:head><title>Component gallery · Godmother</title></svelte:head>

<div class="gallery">
	<header class="top">
		<Wordmark href="/" size={20} />
		<p class="eyebrow">Component gallery</p>
		<nav aria-label="Gallery sections">
			<a href="#foundations">Foundations</a><a href="#chat">Chat</a><a href="#blocks">Blocks</a><a href="#canvas">Canvas</a><a href="#states">States</a>
		</nav>
		<ThemeToggle />
	</header>

	<main>
		<section id="foundations">
			<h2 class="display">Foundations</h2>
			<div class="row">
				<Specimen label="Colour tokens" width="100%">
					<ul class="tokens">
						{#each tokens as t (t)}<li><span style:background="var({t})"></span><code>{t}</code></li>{/each}
					</ul>
				</Specimen>
				<Specimen label="Type" width="100%">
					<div class="type">
						<p class="display" style:font-size="var(--text-display)" style:line-height=".95">Prepare for the <em>gala.</em></p>
						<p class="display" style:font-size="var(--text-4xl)">Three looks, tried on you.</p>
						<p class="display" style:font-size="var(--text-2xl)">The Emerald Column</p>
						<p style:font-size="var(--text-md)">Instrument Sans for interface text, set at 15px with a 1.55 measure.</p>
						<p class="eyebrow">Eyebrow · small caps label</p>
						<p class="num display" style:font-size="var(--text-3xl)">₦518,500 – ₦618,500</p>
					</div>
				</Specimen>
				<Specimen label="Buttons, tags, swatches">
					<div class="stack">
						<div class="inline">
							<button class="btn btn-primary">Decide for me</button>
							<button class="btn btn-secondary">Choose this look</button>
							<button class="btn btn-ghost">Cancel</button>
							<button class="btn btn-primary" disabled>Disabled</button>
							<button class="btn btn-secondary btn-sm"><Spinner /> Uploading</button>
						</div>
						<div class="inline">
							<span class="tag">Default</span><span class="tag tag-accent">Estimate</span><span class="tag tag-success">Yours</span><span class="tag tag-danger">Failed</span>
						</div>
						<div class="inline">
							{#each event.colors as c (c.hex)}<Swatch color={c} label hex />{/each}
						</div>
						<Suggestions options={['Decide for me', 'Less sequins on look 2', 'Show me something in ivory']} highlightFirst onpick={() => {}} />
					</div>
				</Specimen>
				<Specimen label="Units meter" note="low · near cap">
					<div class="inline">
						<UnitsMeter units={sessionAt('looks').units} />
						<UnitsMeter units={{ spent: 56, cap: 60, ledger: [] }} />
					</div>
				</Specimen>
				<Specimen label="Plate" note="cover · contain · loading · empty">
					<div class="plates">
						<Plate asset={assets.look2} alt="Look 2" />
						<Plate asset={assets.uploadHand} alt="Hand" fit="contain" />
						<Plate alt="" loading />
						<Plate alt="" />
					</div>
				</Specimen>
			</div>
		</section>

		<section id="chat">
			<h2 class="display">Chat</h2>
			<div class="row">
				<Specimen label="Activities" note="running · done · failed" width="440px">
					<ul class="acts">
						<ActivityLine activity={acts.running} />
						<ActivityLine activity={acts.done} />
						<ActivityLine activity={acts.failed} />
					</ul>
				</Specimen>
				<Specimen label="Streaming assistant message" width="440px">
					<Provider session={sessionAt('event')} setup={streamingSetup}><Thread /></Provider>
				</Specimen>
				<Specimen label="User message with attachments" width="440px">
					<Provider session={sessionAt('looks')}>
						<Message message={sessionAt('looks').messages[2]} />
					</Provider>
				</Specimen>
				<Specimen label="Assistant message with blocks + suggestions" width="440px">
					<Provider session={sessionAt('looks')}>
						<Message message={sessionAt('looks').messages[3]} last />
					</Provider>
				</Specimen>
				<Specimen label="Empty conversation" width="440px" height="560px">
					<Provider session={sessionAt('event')}><Thread /></Provider>
				</Specimen>
				<Specimen label="Composer" width="440px">
					<Provider session={sessionAt('photos')}><Composer /></Provider>
				</Specimen>
				<Specimen label="Client error" width="440px">
					<Provider session={sessionAt('photos')} setup={errorSetup}><Thread /></Provider>
				</Specimen>
			</div>
		</section>

		<section id="blocks">
			<h2 class="display">Inline blocks</h2>
			<div class="row">
				{#each blocks as b (b.label)}
					<Specimen label={b.label} width="440px">
						<Provider session={b.label.startsWith('photo_request') ? photosPartial() : sessionAt(b.stage)}>
							<BlockView block={b.block} />
						</Provider>
					</Specimen>
				{/each}
				<Specimen label="lookbook (in progress)" width="440px">
					<Provider session={lookbookInProgress()}><BlockView block={{ type: 'lookbook', lookId: 'look-1' }} /></Provider>
				</Specimen>
				<Specimen label="looks (rendering · failed)" width="440px">
					<Provider session={withLooks(sessionAt('looks'))}><BlockView block={{ type: 'looks', lookIds: ['look-1', 'look-2', 'look-3'] }} /></Provider>
				</Specimen>
			</div>
		</section>

		<section id="canvas">
			<h2 class="display">Canvas</h2>
			<div class="col">
				<Specimen label="Brief · empty" width="100%"><Provider session={sessionAt('event')}><BriefView /></Provider></Specimen>
				<Specimen label="Brief · found" width="100%"><Provider session={sessionAt('photos')}><BriefView event={event} location={sessionAt('photos').location} /></Provider></Specimen>
				<Specimen label="Photos · one of three" width="100%"><Provider session={photosPartial()}><PhotosView /></Provider></Specimen>
				<Specimen label="Look cards" note="done · rendering · failed · chosen" width="100%">
					<div class="cards">
						{#each variants.looksMixed() as l, i (l.id)}
							<LookCard look={l} picked={i === 0} onchoose={() => {}} onretry={() => {}} />
						{/each}
						<LookCard look={looks[0]} chosen onchoose={() => {}} />
					</div>
				</Specimen>
				<Specimen label="Looks · rendering" width="100%"><Provider session={withLooks(sessionAt('looks'), variants.looksPending())}><LooksView /></Provider></Specimen>
				<Specimen label="Looks · decided" width="100%"><Provider session={sessionAt('chosen')}><LooksView /></Provider></Specimen>
				<Specimen label="Render steps" width="360px"><RenderSteps steps={variants.lookbookInProgress().steps} /></Specimen>
				<Specimen label="Lookbook · finishing" width="100%"><Provider session={lookbookInProgress()}><LookbookView /></Provider></Specimen>
				<Specimen label="Lookbook · done" width="100%"><Provider session={sessionAt('finishing')}><LookbookView /></Provider></Specimen>
				<Specimen label="Shopping list" width="100%"><Provider session={sessionAt('done')}><ShoppingView /></Provider></Specimen>
			</div>
		</section>

		<section id="states">
			<h2 class="display">Page states</h2>
			<div class="row">
				<Specimen label="Studio · session not found" width="100%" height="520px"><StudioError reason="not_found" message="This session doesn’t exist, or it has expired." /></Specimen>
				<Specimen label="Studio · server unreachable" width="100%" height="520px"><StudioError reason="unreachable" message="Godmother’s server can’t be reached right now." /></Specimen>
			</div>
			<p class="links">Full flows: {#each ['event', 'photos', 'looks', 'chosen', 'finishing', 'done'] as st (st)}<a href="/studio/mock?stage={st}">{st}</a>{/each}</p>
		</section>
	</main>
</div>

<style>
	.gallery {
		padding: 0 var(--gutter) var(--space-12);
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: var(--space-5);
		height: 60px;
		margin: 0 calc(var(--gutter) * -1) var(--space-6);
		padding: 0 var(--gutter);
		background: color-mix(in srgb, var(--bg) 90%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--line);
	}
	.top nav {
		display: flex;
		gap: var(--space-4);
		margin-left: auto;
		font-size: var(--text-sm);
	}
	.top nav a {
		color: var(--text-2);
		text-decoration: none;
	}
	section {
		padding: var(--space-8) 0;
		border-bottom: 1px solid var(--line);
	}
	h2 {
		font-size: var(--text-3xl);
		margin-bottom: var(--space-6);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-6);
		align-items: flex-start;
	}
	.col {
		display: grid;
		gap: var(--space-7);
	}
	.stack {
		display: grid;
		gap: var(--space-4);
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		align-items: center;
	}
	.tokens {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-3);
	}
	.tokens li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
	}
	.tokens span {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-xs);
		box-shadow: 0 0 0 1px var(--line-strong);
	}
	.type {
		display: grid;
		gap: var(--space-3);
	}
	.type em {
		color: var(--accent);
	}
	.plates {
		display: grid;
		grid-template-columns: repeat(4, 110px);
		gap: var(--space-3);
	}
	.acts {
		display: grid;
		gap: var(--space-2);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-6);
	}
	.links {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-6);
		font-size: var(--text-sm);
	}
	.links a {
		color: var(--accent);
	}
</style>
