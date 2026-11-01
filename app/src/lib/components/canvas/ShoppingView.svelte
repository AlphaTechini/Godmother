<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Info from '@lucide/svelte/icons/info';
	import Scissors from '@lucide/svelte/icons/scissors';
	import SectionHead from './SectionHead.svelte';
	import { getStudio } from '#lib/client/studio.svelte';
	import { ROLE_LABEL, formatDate, formatMoney, formatRange } from '#lib/client/format';
	import type { Money, ShoppingItem } from '#lib/types';

	const studio = getStudio();
	const s = $derived(studio.client.session);
	const list = $derived(s.shoppingList!);
	const look = $derived(s.looks.find((l) => l.id === (s.chosenLookId ?? s.lookbook?.lookId)));

	let open: Record<string, boolean> = $state({});
	const allOpen = $derived(list.items.length > 0 && list.items.every((i) => open[i.pieceId]));

	const sum = (ms: (Money | undefined)[]): Money => ({
		amount: ms.reduce((t, m) => t + (m?.amount ?? 0), 0),
		currency: list.currency
	});
	const bought = $derived(list.items.filter((i) => i.kind === 'buy'));
	const sewn = $derived(list.items.filter((i) => i.kind === 'sew'));
	const boughtTotal = $derived(sum(bought.map((i) => i.price)));
	const sewnRange = $derived({
		min: sum(sewn.map((i) => i.estimate?.min)),
		max: sum(sewn.map((i) => i.estimate?.max))
	});
	const wardrobeCount = $derived(
		look ? look.pieces.filter((p) => p.source.type === 'wardrobe').length : 0
	);

	function piece(i: ShoppingItem) {
		return look?.pieces.find((p) => p.id === i.pieceId);
	}
	function toggleAll() {
		const next = !allOpen;
		for (const i of list.items) open[i.pieceId] = next;
	}
</script>

<article>
	<SectionHead index="05" eyebrow="Shopping list" title="What it will take." />

	<section class="total" aria-labelledby="tt">
		<p class="eyebrow" id="tt">{sewn.length ? 'Estimated total' : 'Total'}</p>
		<p class="figure display num">
			{#if list.total.min.amount === list.total.max.amount}{formatMoney(list.total.min)}{:else}<span
					class="nb">{formatMoney(list.total.min)}</span
				> <span class="nb">– {formatMoney(list.total.max)}</span>{/if}
		</p>
		<p class="meta">
			<span>{list.items.length} piece{list.items.length === 1 ? '' : 's'}</span>
			<span>Prices in {list.currency}</span>
			<span>Checked {formatDate(list.checkedAt)}</span>
		</p>
		<p class="note">
			<Info size={15} strokeWidth={1.6} aria-hidden="true" /><span
				>{list.note}{#if wardrobeCount && !/wardrobe|yours|own/i.test(list.note)}
					{wardrobeCount} piece{wardrobeCount > 1 ? 's' : ''} from your wardrobe {wardrobeCount > 1
						? 'are'
						: 'is'} not included.{/if}</span
			>
		</p>
	</section>

	<div class="list-head">
		<p class="eyebrow">Breakdown</p>
		<button type="button" class="btn btn-ghost btn-sm" onclick={toggleAll}
			>{allOpen ? 'Collapse all' : 'Expand all'}</button
		>
	</div>

	<ul class="items">
		{#each list.items as item (item.pieceId)}
			{@const p = piece(item)}
			{@const id = `item-${item.pieceId}`}
			<li class:open={open[item.pieceId]}>
				<button
					type="button"
					class="row"
					aria-expanded={!!open[item.pieceId]}
					aria-controls={id}
					onclick={() => (open[item.pieceId] = !open[item.pieceId])}
				>
					<span class="thumb"
						>{#if item.image}<img
								src={item.image.url}
								alt=""
								data-kind={item.image.kind}
							/>{/if}</span
					>
					<span class="what">
						<span class="role">{ROLE_LABEL[item.role]}</span>
						<span class="name">{item.name}</span>
						<span class="shop">{item.shop ?? (item.kind === 'sew' ? 'Your tailor' : '')}</span>
					</span>
					<span class="cost">
						{#if item.kind === 'sew'}
							<span class="tag tag-accent">Estimate</span>
							<span class="num amt">{formatRange(item.estimate)}</span>
						{:else}
							<span class="num amt">{formatMoney(item.price)}</span>
						{/if}
					</span>
					<ChevronDown class="chev" size={16} strokeWidth={1.6} aria-hidden="true" />
				</button>
				{#if open[item.pieceId]}
					<div class="detail" {id}>
						{#if item.kind === 'sew'}
							<p>
								<Scissors size={14} strokeWidth={1.6} aria-hidden="true" /> Made to measure. Take the
								design to a tailor; the range covers fabric and labour in {s.location?.city ??
									'your city'}.
							</p>
							{#if p?.source.type === 'sew' && p.source.design.notes}<p class="muted">
									{p.source.design.notes}
								</p>{/if}
							{#if item.image}
								<a class="link" href={item.image.url} target="_blank" rel="noopener noreferrer"
									>Open the design sketch <ArrowUpRight size={14} /></a
								>
							{/if}
						{:else}
							<p>The exact item you saw on yourself{look ? ` in ${look.title}` : ''}.</p>
							{#if item.url}
								<a class="link" href={item.url} target="_blank" rel="noopener noreferrer"
									>View at {item.shop ?? 'the shop'} <ArrowUpRight size={14} /></a
								>
							{/if}
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	<dl class="sums">
		{#if bought.length}
			<div>
				<dt>To buy · {bought.length}</dt>
				<dd class="num">{formatMoney(boughtTotal)}</dd>
			</div>
		{/if}
		{#if sewn.length}
			<div>
				<dt>To sew · {sewn.length} <span class="tag">Estimate</span></dt>
				<dd class="num">{formatRange(sewnRange)}</dd>
			</div>
		{/if}
		<div class="grand">
			<dt>Total</dt>
			<dd class="num">{formatRange(list.total)}</dd>
		</div>
	</dl>
</article>

<style>
	article {
		max-width: 920px;
	}
	.total {
		display: grid;
		gap: var(--space-3);
		padding-bottom: var(--space-7);
	}
	.figure {
		font-size: clamp(2.6rem, 1.4rem + 4.6vw, 5.25rem);
		line-height: 1;
		letter-spacing: -0.025em;
		font-variant-numeric: lining-nums;
	}
	.nb {
		white-space: nowrap;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	.meta span + span::before {
		content: '·';
		margin: 0 10px;
		color: var(--text-3);
	}
	.note {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin-top: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		font-size: var(--text-sm);
		color: var(--text-2);
		line-height: 1.5;
		max-width: 64ch;
	}
	.note :global(svg) {
		flex: none;
		margin-top: 2px;
		color: var(--accent);
	}
	.list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--line-strong);
	}
	.items li {
		border-bottom: 1px solid var(--line);
	}
	.row {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr) auto 20px;
		gap: var(--space-4);
		align-items: center;
		width: 100%;
		padding: var(--space-4) 0;
		text-align: left;
		border-radius: 0;
	}
	.row:hover .name {
		color: var(--accent);
	}
	.thumb {
		width: 64px;
		height: 64px;
		border-radius: var(--radius-xs);
		background: var(--plate);
		overflow: hidden;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.what {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.role {
		font-size: var(--text-3xs);
		font-weight: 600;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--text-3);
	}
	.name {
		font-size: var(--text-base);
		line-height: 1.35;
		transition: color var(--dur-2) var(--ease-out);
	}
	.shop {
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.cost {
		display: grid;
		justify-items: end;
		gap: 4px;
	}
	.amt {
		font-size: var(--text-md);
		font-weight: 520;
		white-space: nowrap;
	}
	.row :global(.chev) {
		color: var(--text-3);
		transition: transform var(--dur-2) var(--ease-out);
	}
	.open .row :global(.chev) {
		transform: rotate(180deg);
	}
	.detail {
		display: grid;
		gap: var(--space-2);
		padding: 0 0 var(--space-5) calc(64px + var(--space-4));
		font-size: var(--text-sm);
		color: var(--text-2);
		line-height: 1.55;
		animation: gm-fade-up var(--dur-2) var(--ease-out);
	}
	.detail p {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	.link {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--accent);
		font-weight: 560;
		text-decoration-color: var(--accent-line);
	}
	.sums {
		margin-top: var(--space-6);
		margin-left: auto;
		max-width: 420px;
		display: grid;
	}
	.sums div {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-4);
		padding: 8px 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	.sums dt {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.sums dd {
		color: var(--text);
	}
	.sums .grand {
		margin-top: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--line-strong);
		font-size: var(--text-md);
		color: var(--text);
	}
	.grand dd {
		font-weight: 600;
	}
	@media (max-width: 600px) {
		.row {
			grid-template-columns: 48px minmax(0, 1fr) 16px;
			grid-template-areas: 't w c' 't p c';
			row-gap: 6px;
		}
		.thumb {
			grid-area: t;
			width: 48px;
			height: 48px;
			align-self: start;
		}
		.what {
			grid-area: w;
		}
		.cost {
			grid-area: p;
			justify-items: start;
			grid-auto-flow: column;
			align-items: center;
			justify-content: start;
		}
		.row :global(.chev) {
			grid-area: c;
		}
		.detail {
			padding-left: calc(48px + var(--space-4));
		}
	}
</style>
