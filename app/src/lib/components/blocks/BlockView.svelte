<!-- Compact, in-conversation rendering of an assistant Block. The canvas has the full views. -->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import PersonStanding from '@lucide/svelte/icons/person-standing';
	import ScanFace from '@lucide/svelte/icons/scan-face';
	import Hand from '@lucide/svelte/icons/hand';
	import BlockCard from './BlockCard.svelte';
	import Swatch from '#lib/components/ui/Swatch.svelte';
	import Plate from '#lib/components/ui/Plate.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { getStudio } from '#lib/client/studio.svelte';
	import {
		DRESS_CODE_LABEL,
		PHOTO_SLOTS,
		ROMAN,
		formatDate,
		formatMoney,
		formatRange
	} from '#lib/client/format';
	import type { Block, PhotoSlot } from '#lib/types';

	let { block }: { block: Block } = $props();

	const studio = getStudio();
	const session = $derived(studio.client.session);
	const SLOT_ICON = { fullBody: PersonStanding, portrait: ScanFace, hand: Hand } as const;
	const lookById = (id: string) => session.looks.find((l) => l.id === id);
</script>

{#if block.type === 'event'}
	{@const e = block.event}
	<BlockCard
		eyebrow={e.origin === 'invitation'
			? 'Read from your invitation'
			: e.origin === 'web'
				? 'Found on the web'
				: 'Event brief'}
		action="Open brief"
		onaction={() => studio.show('brief')}
	>
		<h3 class="title display">{e.name}</h3>
		<p class="meta">{[e.date, e.venue, e.city].filter(Boolean).join(' · ')}</p>
		<div class="code">
			<span class="tag tag-accent">Dress code</span>
			<b>{e.dressCode ?? DRESS_CODE_LABEL[e.dressCodeNormalized]}</b>
		</div>
		{#if e.colors.length}
			<div class="swatches">
				{#each e.colors as c (c.hex)}<Swatch color={c} label />{/each}
			</div>
		{/if}
	</BlockCard>
{:else if block.type === 'photo_request'}
	<BlockCard eyebrow="Photos needed" action="Open photos" onaction={() => studio.show('photos')}>
		<p class="body">{block.reason}</p>
		<div class="slots">
			{#each PHOTO_SLOTS.filter((s) => block.slots.includes(s.slot)) as s (s.slot)}
				{@const photo = session.photos[s.slot as PhotoSlot]}
				{@const Icon = SLOT_ICON[s.slot]}
				<button
					type="button"
					class="slot"
					class:filled={!!photo}
					onclick={() => studio.attach(s.slot)}
					aria-label={photo ? `${s.title}: added. Replace` : `Add ${s.title.toLowerCase()}`}
				>
					{#if photo}
						<img src={photo.url} alt="" />
						<span class="ok">
							{#if studio.client.uploading[s.slot]}<Spinner size={10} />{:else}<Check
									size={11}
									strokeWidth={2.4}
								/>{/if}
						</span>
					{:else}
						<Icon size={20} strokeWidth={1.3} aria-hidden="true" />
						<span class="add"><Plus size={11} strokeWidth={2} aria-hidden="true" /></span>
					{/if}
					<span class="slot-label">{s.short}</span>
				</button>
			{/each}
		</div>
	</BlockCard>
{:else if block.type === 'wardrobe'}
	{@const items = session.wardrobe.filter((w) => block.itemIds.includes(w.id))}
	<BlockCard eyebrow="From your wardrobe">
		<ul class="wardrobe">
			{#each items as w (w.id)}
				<li>
					<span class="wthumb"><img src={w.image.url} alt="" /></span>
					<span>{w.description}</span>
				</li>
			{/each}
		</ul>
	</BlockCard>
{:else if block.type === 'products'}
	<BlockCard eyebrow="Found in shops">
		<ul class="products">
			{#each block.products as p (p.url)}
				<li>
					<a href={p.url} target="_blank" rel="noopener noreferrer">
						<span class="pimg"
							>{#if p.image ?? p.imageUrl}<img src={p.image?.url ?? p.imageUrl} alt="" />{/if}</span
						>
						<span class="pshop">{p.shop}</span>
						<span class="ptitle">{p.title}</span>
						{#if p.price}<span class="pprice num">{formatMoney(p.price)}</span>{/if}
					</a>
				</li>
			{/each}
		</ul>
	</BlockCard>
{:else if block.type === 'sew_design'}
	<BlockCard eyebrow="Designed for your tailor">
		<div class="sew">
			<span class="sewimg"><img src={block.design.image.url} alt="Gown design sketch" /></span>
			<div>
				<p class="body">{block.design.notes ?? block.design.prompt}</p>
				<p class="estimate">
					<span class="tag">Estimate</span>
					<span class="num">{formatRange(block.design.estimate)}</span>
				</p>
			</div>
		</div>
	</BlockCard>
{:else if block.type === 'looks'}
	<BlockCard
		eyebrow={block.lookIds.length === 1 ? 'Revised look' : 'Three looks, tried on you'}
		action="View looks"
		onaction={() => studio.show('looks')}
	>
		<div class="looks" style:--n={block.lookIds.length}>
			{#each block.lookIds as id (id)}
				{@const l = lookById(id)}
				{#if l}
					<button
						type="button"
						class="look"
						onclick={() => studio.show('looks')}
						aria-label="Look {l.index}: {l.title}"
					>
						<Plate
							asset={l.render.image}
							alt=""
							ratio="2 / 3"
							loading={l.render.status === 'rendering' || l.render.status === 'pending'}
						>
							{#if l.render.status === 'failed'}<span class="failed"><CircleAlert size={16} /></span
								>{/if}
							{#if session.chosenLookId === l.id}<span class="pick">Chosen</span>{/if}
						</Plate>
						<span class="lnum display">{ROMAN[l.index]}</span>
						<span class="ltitle">{l.title}</span>
					</button>
				{/if}
			{/each}
		</div>
	</BlockCard>
{:else if block.type === 'decision'}
	{@const d = block.decision}
	{@const l = lookById(d.lookId)}
	<BlockCard
		eyebrow="Godmother decides"
		tone="accent"
		action="See ranking"
		onaction={() => studio.show('looks')}
	>
		<div class="decision">
			{#if l}
				<span class="dimg"
					><Plate asset={l.render.image} alt="{l.title}, tried on you" ratio="2 / 3" /></span
				>
			{/if}
			<div>
				{#if l}<p class="dtitle display"><span>{ROMAN[l.index]}.</span> {l.title}</p>{/if}
				<ol class="ranking">
					{#each d.ranking as r (r.lookId)}
						{@const rl = lookById(r.lookId)}
						<li class:top={r.lookId === d.lookId}>
							<span class="rname">{rl ? `${ROMAN[rl.index]}. ${rl.title}` : r.lookId}</span>
							<span class="rbar" aria-hidden="true"><span style:width="{r.score}%"></span></span>
							<span class="rscore num">{r.score}</span>
						</li>
					{/each}
				</ol>
			</div>
		</div>
	</BlockCard>
{:else if block.type === 'face_profile'}
	{@const f = block.profile}
	<BlockCard eyebrow="Your colouring">
		<dl class="face">
			{#each [['Skin', f.skinTone], ['Lips', f.lipColor], ['Eyes', f.eyeColor], ['Hair', f.hairColor]] as const as [label, c] (label)}
				{#if c}
					<div>
						<dt class="eyebrow">{label}</dt>
						<dd><Swatch color={c} size={16} label /></dd>
					</div>
				{/if}
			{/each}
		</dl>
		<p class="facetags">
			{#if f.undertone}<span class="tag">{f.undertone} undertone</span>{/if}
			{#if f.faceShape}<span class="tag">{f.faceShape} face</span>{/if}
			{#each Object.entries(f.features).slice(0, 2) as [k, v] (k)}<span class="tag"
					>{v} {k.replace(/_shape$/, '').replace(/_/g, ' ')}</span
				>{/each}
		</p>
	</BlockCard>
{:else if block.type === 'lookbook'}
	{@const lb = session.lookbook}
	{@const done = lb ? lb.steps.filter((s) => s.status === 'done').length : 0}
	<BlockCard
		eyebrow="Your lookbook"
		action="Open lookbook"
		onaction={() => studio.show('lookbook')}
	>
		{#if lb}
			<div class="triptych">
				<Plate asset={lb.full} alt="" ratio="2 / 3" loading={!lb.full} />
				<Plate asset={lb.face} alt="" ratio="4 / 5" loading={!lb.face} />
				<Plate asset={lb.hand} alt="" ratio="1 / 1" loading={!lb.hand} />
			</div>
			{#if lb.steps.length && done < lb.steps.length}
				<p class="progress num">
					<Spinner size={11} />
					{done} of {lb.steps.length} finishing touches
				</p>
			{/if}
		{/if}
	</BlockCard>
{:else if block.type === 'shopping_list'}
	{@const sl = session.shoppingList}
	<BlockCard eyebrow="Shopping list" action="Open list" onaction={() => studio.show('shopping')}>
		{#if sl}
			<p class="total display num">{formatRange(sl.total)}</p>
			<p class="meta">
				{sl.items.length} pieces to buy or sew · {sl.currency} · checked {formatDate(sl.checkedAt)}
			</p>
		{:else}
			<p class="meta">Preparing…</p>
		{/if}
	</BlockCard>
{:else if block.type === 'error'}
	<div class="error" role="alert">
		<CircleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
		<p>{block.message}</p>
	</div>
{/if}

<style>
	.title {
		font-size: var(--text-xl);
		line-height: 1.1;
	}
	.meta {
		margin-top: 4px;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	.body {
		font-size: var(--text-sm);
		color: var(--text-2);
		line-height: 1.5;
	}
	.code {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--line);
	}
	.code b {
		font-family: var(--font-display);
		font-weight: 500;
		font-size: var(--text-md);
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin-top: var(--space-3);
	}
	.slots {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.slot {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 4 / 5;
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius-sm);
		color: var(--text-3);
		overflow: hidden;
		transition:
			border-color var(--dur-2) var(--ease-out),
			color var(--dur-2) var(--ease-out);
	}
	.slot:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.slot.filled {
		border-style: solid;
		border-color: var(--line);
	}
	.slot img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.slot-label {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 14px 6px 6px;
		font-size: var(--text-2xs);
		font-weight: 560;
		color: var(--text-2);
	}
	.filled .slot-label {
		color: #fff;
		background: linear-gradient(transparent, rgb(0 0 0 / 0.55));
	}
	.add,
	.ok {
		position: absolute;
		top: 6px;
		right: 6px;
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--surface-3);
		color: var(--text-2);
	}
	.ok {
		background: var(--accent);
		color: var(--on-accent);
	}
	.wardrobe {
		display: grid;
		gap: var(--space-2);
	}
	.wardrobe li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}
	.wthumb,
	.pimg {
		display: block;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-xs);
		overflow: hidden;
		background: var(--plate);
		flex: none;
	}
	.wthumb img,
	.pimg img,
	.sewimg img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.products {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 132px;
		gap: var(--space-3);
		overflow-x: auto;
		scrollbar-width: thin;
		padding-bottom: 4px;
	}
	.products a {
		display: grid;
		gap: 3px;
		text-decoration: none;
	}
	.pimg {
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		margin-bottom: 4px;
	}
	.pshop {
		font-size: var(--text-2xs);
		color: var(--text-3);
	}
	.ptitle {
		font-size: var(--text-xs);
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.pprice {
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.sew {
		display: grid;
		grid-template-columns: 72px 1fr;
		gap: var(--space-3);
	}
	.sewimg {
		display: block;
		aspect-ratio: 3 / 4;
		border-radius: var(--radius-xs);
		overflow: hidden;
	}
	.estimate {
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}
	.looks {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: var(--space-2);
		max-width: calc(var(--n) * 130px);
	}
	.look {
		position: relative;
		display: grid;
		gap: 2px;
		text-align: left;
		border-radius: var(--radius-sm);
	}
	.look :global(.plate) {
		transition: transform var(--dur-3) var(--ease-out);
	}
	.look:hover :global(.plate) {
		transform: translateY(-2px);
	}
	.lnum {
		margin-top: 6px;
		font-size: var(--text-xs);
		font-style: italic;
		color: var(--accent);
	}
	.ltitle {
		font-size: var(--text-xs);
		color: var(--text);
		line-height: 1.3;
	}
	.failed {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--danger);
		background: var(--scrim);
	}
	.pick {
		position: absolute;
		left: 6px;
		top: 6px;
		padding: 2px 6px;
		border-radius: var(--radius-xs);
		background: var(--accent);
		color: var(--on-accent);
		font-size: var(--text-3xs);
		font-weight: 650;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.decision {
		display: grid;
		grid-template-columns: 84px 1fr;
		gap: var(--space-4);
		align-items: start;
	}
	.dtitle {
		font-size: var(--text-lg);
		line-height: 1.15;
	}
	.dtitle span {
		font-style: italic;
		color: var(--accent);
	}
	.ranking {
		display: grid;
		gap: 6px;
		margin-top: var(--space-3);
	}
	.ranking li {
		display: grid;
		grid-template-columns: 1fr 52px 22px;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.ranking li.top {
		color: var(--text);
	}
	.rname {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rbar {
		height: 3px;
		background: var(--line-strong);
		border-radius: 2px;
		overflow: hidden;
	}
	.rbar span {
		display: block;
		height: 100%;
		background: var(--text-3);
	}
	.top .rbar span {
		background: var(--accent);
	}
	.rscore {
		text-align: right;
	}
	.face {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3) var(--space-4);
	}
	.face dd {
		margin-top: 4px;
	}
	.facetags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: var(--space-3);
	}
	.triptych {
		display: grid;
		grid-template-columns: 2fr 2fr 2.4fr;
		gap: var(--space-2);
		align-items: end;
	}
	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.total {
		font-size: var(--text-2xl);
		line-height: 1.1;
	}
	.error {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-md);
		background: var(--danger-soft);
		color: var(--danger);
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	.error :global(svg) {
		margin-top: 2px;
		flex: none;
	}
</style>
