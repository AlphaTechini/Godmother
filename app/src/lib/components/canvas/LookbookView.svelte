<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import SectionHead from './SectionHead.svelte';
	import RenderSteps from './RenderSteps.svelte';
	import Plate from '#lib/components/ui/Plate.svelte';
	import Swatch from '#lib/components/ui/Swatch.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { getStudio } from '#lib/client/studio.svelte';
	import { ROLE_LABEL, ROMAN } from '#lib/client/format';
	import type { Asset } from '#lib/types';

	const studio = getStudio();
	const client = $derived(studio.client);
	const s = $derived(client.session);
	const lb = $derived(s.lookbook!);
	const look = $derived(s.looks.find((l) => l.id === lb.lookId));
	const face = $derived(s.face);
	const stepsDone = $derived(lb.steps.filter((x) => x.status === 'done').length);
	const finishing = $derived(lb.steps.some((x) => x.status === 'rendering' || x.status === 'pending'));
	const portraitAcc = $derived(lb.accessories.filter((a) => a.panel === 'portrait'));
	const handAcc = $derived(lb.accessories.filter((a) => a.panel === 'hand'));
	const shoes = $derived(look?.pieces.find((p) => p.role === 'shoes'));

	const panels = $derived([
		{
			key: 'full',
			n: 1,
			title: 'The look',
			caption: [look?.summary ?? 'Outfit and shoes'].join(''),
			asset: lb.full ?? look?.render.image,
			ratio: '2 / 3',
			pending: !lb.full && finishing,
			waiting: 'Adding shoes'
		},
		{
			key: 'face',
			n: 2,
			title: 'The face',
			caption: [lb.makeup?.name, lb.hair?.templateName, ...portraitAcc.map((a) => ROLE_LABEL[a.piece.role].toLowerCase())].filter(Boolean).join(' · '),
			asset: lb.face,
			ratio: '4 / 5',
			pending: !lb.face,
			waiting: 'Makeup, hair and earrings'
		},
		{
			key: 'hand',
			n: 3,
			title: 'The hand',
			caption: handAcc.map((a) => a.piece.name).join(' · ') || 'Watch, ring and bracelet',
			asset: lb.hand,
			ratio: '1 / 1',
			pending: !lb.hand,
			waiting: 'Watch and ring'
		}
	] as { key: string; n: number; title: string; caption: string; asset?: Asset; ratio: string; pending: boolean; waiting: string }[]);
</script>

<article>
	<SectionHead
		index="04"
		eyebrow={s.event ? `The lookbook · ${s.event.name}` : 'The lookbook'}
		title={look?.title ?? 'Your lookbook'}
		lede={finishing
			? 'Finishing the look on you: makeup from your face analysis, then hair, then jewellery.'
			: 'Three panels, three photos of you: the full look, the face, the hand.'}
	>
		{#snippet aside()}
			{#if finishing}
				<p class="progress num" role="status"><Spinner size={13} /> {stepsDone} of {lb.steps.length}</p>
			{:else if !s.shoppingList}
				<button type="button" class="btn btn-primary btn-lg mobile-cta" disabled={client.streaming} onclick={() => studio.say('Build my shopping list.', { type: 'shopping_list' })}>
					<ShoppingBag /> Shopping list
				</button>
			{:else}
				<button type="button" class="btn btn-secondary" onclick={() => studio.show('shopping')}>
					Shopping list <ArrowRight />
				</button>
			{/if}
		{/snippet}
	</SectionHead>

	<div class="spread">
		{#each panels as p (p.key)}
			<figure class="panel {p.key}">
				<Plate asset={p.asset} alt="{p.title}: {p.caption}" ratio={p.ratio} fit="contain" loading={p.pending && finishing}>
					{#if p.pending}
						<div class="waiting">
							{#if finishing}<Spinner size={14} />{/if}
							<span>{finishing ? p.waiting : 'Not rendered'}</span>
						</div>
					{/if}
				</Plate>
				<figcaption>
					<span class="pn display">{ROMAN[p.n]}.</span>
					<span><b>{p.title}</b>{#if p.caption}<span class="cap">{p.caption}</span>{/if}</span>
				</figcaption>
			</figure>
		{/each}
	</div>

	{#if finishing}
		<section class="steps-panel" aria-label="Finishing steps">
			<p class="eyebrow">Finishing touches</p>
			<RenderSteps steps={lb.steps} />
		</section>
	{/if}

	<div class="details">
		<section class="makeup" aria-labelledby="mk">
			<p class="eyebrow">The face · makeup</p>
			{#if lb.makeup}
				<h3 id="mk" class="display">{lb.makeup.name}</h3>
				<p class="body">{lb.makeup.rationale}</p>
				<div class="mpal">
					{#each lb.makeup.palette as c (c.hex)}<Swatch color={c} size={18} label />{/each}
				</div>
				<ol class="guide">
					{#each lb.makeup.steps as st, i (i)}
						<li>
							<span class="gn display num">{i + 1}</span>
							<div>
								<p class="garea">
									<span class="eyebrow">{st.area}</span>
									{#if st.colorHex}<span class="gdot" style:background={st.colorHex} aria-hidden="true"></span>{/if}
									<span class="gprod">{st.product}</span>
								</p>
								<p class="ginst">{st.instruction}</p>
							</div>
						</li>
					{/each}
				</ol>
			{:else}
				<h3 id="mk" class="display placeholder">Makeup is next.</h3>
				<p class="body">Chosen from your face analysis, shown on your portrait, with steps to do it yourself.</p>
			{/if}
		</section>

		<aside class="side">
			{#if face}
				<section aria-labelledby="col">
					<p class="eyebrow" id="col">Your colouring</p>
					<dl class="colouring">
						{#each [['Skin', face.skinTone], ['Lips', face.lipColor], ['Eyes', face.eyeColor], ['Hair', face.hairColor]] as const as [label, c] (label)}
							{#if c}<div><dt>{label}</dt><dd><Swatch color={c} size={14} label /></dd></div>{/if}
						{/each}
						{#if face.undertone}<div><dt>Undertone</dt><dd class="cap1">{face.undertone}</dd></div>{/if}
						{#if face.faceShape}<div><dt>Face</dt><dd>{face.faceShape}</dd></div>{/if}
						{#each Object.entries(face.features) as [k, v] (k)}
							<div><dt class="cap1">{k.replace(/_/g, ' ')}</dt><dd>{v}</dd></div>
						{/each}
					</dl>
				</section>
			{/if}

			<section aria-labelledby="hr">
				<p class="eyebrow" id="hr">The hair</p>
				{#if lb.hair}
					<h4 class="display">{lb.hair.templateName}</h4>
					<p class="body">{lb.hair.rationale}</p>
				{:else}
					<p class="body muted">Chosen from YouCam’s hairstyle templates once makeup is done.</p>
				{/if}
			</section>

			<section aria-labelledby="ac">
				<p class="eyebrow" id="ac">Accessories</p>
				<ul class="acc">
					{#if shoes}
						<li>
							<span class="athumb">{#if shoes.image}<img src={shoes.image.url} alt="" />{/if}</span>
							<span><small>Shoes · full look</small>{shoes.name}</span>
						</li>
					{/if}
					{#each lb.accessories as a (a.piece.id)}
						<li>
							<span class="athumb">{#if a.piece.image}<img src={a.piece.image.url} alt="" />{/if}</span>
							<span><small>{ROLE_LABEL[a.piece.role]} · {a.panel === 'hand' ? 'hand' : 'face'}</small>{a.piece.name}</span>
						</li>
					{:else}
						{#if !shoes}<li class="muted body">Earrings and necklace go on the portrait; watch and ring on the hand.</li>{/if}
					{/each}
				</ul>
			</section>
		</aside>
	</div>
</article>

<style>
	article {
		max-width: 1180px;
	}
	.progress {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	/* Editorial spread: the full look as a tall left page; face over hand on the right.
	   Column ratio 3:2 makes the right stack (4:5 + 1:1) match the 2:3 left panel. */
	.spread {
		display: grid;
		grid-template-columns: 3fr 2fr;
		grid-template-rows: auto auto;
		grid-template-areas: 'full face' 'full hand';
		gap: var(--space-5) var(--space-6);
		align-items: start;
		max-width: 880px;
	}
	.panel {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}
	.full {
		grid-area: full;
	}
	.face {
		grid-area: face;
	}
	.hand {
		grid-area: hand;
	}
	figcaption {
		display: flex;
		gap: var(--space-3);
		align-items: baseline;
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	.pn {
		font-style: italic;
		color: var(--accent);
		font-size: var(--text-lg);
		flex: none;
	}
	figcaption b {
		font-weight: 600;
		margin-right: 8px;
	}
	.cap {
		color: var(--text-2);
	}
	.waiting {
		position: absolute;
		inset: auto 0 0 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: var(--space-4);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.steps-panel {
		margin-top: var(--space-6);
		padding: var(--space-5);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		max-width: 420px;
	}
	.steps-panel .eyebrow {
		margin-bottom: var(--space-3);
	}
	.details {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		gap: var(--space-9);
		margin-top: var(--space-10);
		padding-top: var(--space-7);
		border-top: 1px solid var(--line);
	}
	.makeup h3 {
		font-size: var(--text-3xl);
		margin-top: var(--space-3);
	}
	.placeholder {
		color: var(--text-3);
	}
	.body {
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.6;
		margin-top: var(--space-3);
		max-width: 60ch;
	}
	.mpal {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
		margin-top: var(--space-5);
	}
	.guide {
		margin-top: var(--space-7);
		display: grid;
		counter-reset: step;
	}
	.guide li {
		display: grid;
		grid-template-columns: 48px 1fr;
		gap: var(--space-4);
		padding: var(--space-5) 0;
		border-top: 1px solid var(--line);
	}
	.gn {
		font-size: var(--text-2xl);
		font-style: italic;
		color: var(--accent);
		line-height: 1;
	}
	.garea {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}
	.gdot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		box-shadow: 0 0 0 1px var(--line-strong);
	}
	.gprod {
		font-size: var(--text-sm);
		font-weight: 560;
	}
	.ginst {
		margin-top: 6px;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.6;
		max-width: 62ch;
	}
	.side {
		display: grid;
		align-content: start;
		gap: var(--space-8);
	}
	.side h4 {
		font-size: var(--text-xl);
		margin-top: var(--space-2);
	}
	.colouring {
		display: grid;
		margin-top: var(--space-3);
	}
	.colouring div {
		display: grid;
		grid-template-columns: 96px 1fr;
		gap: var(--space-3);
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
		font-size: var(--text-sm);
	}
	.colouring dt {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.cap1 {
		text-transform: capitalize;
	}
	.acc {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.acc li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
		line-height: 1.35;
	}
	.acc small {
		display: block;
		font-size: var(--text-2xs);
		color: var(--text-3);
	}
	.athumb {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-xs);
		overflow: hidden;
		background: var(--plate);
		flex: none;
	}
	.athumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	@media (max-width: 1100px) {
		.details {
			grid-template-columns: 1fr;
			gap: var(--space-8);
		}
	}
	@media (max-width: 760px) {
		.spread {
			grid-template-columns: 1fr 1fr;
			grid-template-areas: 'full full' 'face hand';
		}
		.guide li {
			grid-template-columns: 36px 1fr;
		}
	}
</style>
