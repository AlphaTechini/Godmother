<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import BriefView from './BriefView.svelte';
	import PhotosView from './PhotosView.svelte';
	import LooksView from './LooksView.svelte';
	import LookbookView from './LookbookView.svelte';
	import ShoppingView from './ShoppingView.svelte';
	import { CANVAS_VIEWS, getStudio, viewAvailable, viewForStage } from '#lib/client/studio.svelte';

	const studio = getStudio();
	const s = $derived(studio.client.session);
	const view = $derived(studio.view);
	const live = $derived(viewForStage(s));
	const order = CANVAS_VIEWS.map((v) => v.view);

	let scroller: HTMLElement | undefined = $state();
	let nav: HTMLElement | undefined = $state();
	$effect(() => {
		void view;
		scroller?.scrollTo({ top: 0 });
		// Keep the active section visible in the (horizontally scrolling) index on phones.
		const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
		if (nav && active) {
			const left = active.offsetLeft - nav.offsetLeft;
			if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth) {
				nav.scrollLeft = Math.max(0, left - 24);
			}
		}
	});
</script>

<div class="canvas">
	<nav class="index" aria-label="Canvas sections" bind:this={nav}>
		<ol>
			{#each CANVAS_VIEWS as v, i (v.view)}
				{@const available = viewAvailable(s, v.view)}
				{@const past = order.indexOf(v.view) < order.indexOf(live)}
				<li>
					<button
						type="button"
						aria-current={view === v.view ? 'page' : undefined}
						disabled={!available}
						onclick={() => studio.show(v.view)}
					>
						<span class="n num">
							{#if past && available}<Check size={11} strokeWidth={2.4} aria-hidden="true" />{:else}0{i + 1}{/if}
						</span>
						<span class="l">{v.label}</span>
						{#if v.view === live && view !== live}<span class="live" title="Where Godmother is now"></span>{/if}
					</button>
				</li>
			{/each}
		</ol>
		{#if studio.pinned}
			<button type="button" class="follow" onclick={() => (studio.pinned = null)}>Back to now</button>
		{/if}
	</nav>

	<div class="page" bind:this={scroller}>
		{#key view}
			<div class="view">
				{#if view === 'brief'}
					<BriefView event={s.event} location={s.location} />
				{:else if view === 'photos'}
					<PhotosView />
				{:else if view === 'looks'}
					<LooksView />
				{:else if view === 'lookbook'}
					<LookbookView />
				{:else if view === 'shopping'}
					<ShoppingView />
				{/if}
			</div>
		{/key}
	</div>
</div>

<style>
	.canvas {
		display: grid;
		grid-template-rows: auto 1fr;
		height: 100%;
		min-height: 0;
	}
	.index {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: 0 var(--gutter);
		border-bottom: 1px solid var(--line);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.index ol {
		display: flex;
		gap: var(--space-6);
	}
	.index button {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 48px;
		font-size: var(--text-sm);
		color: var(--text-2);
		white-space: nowrap;
		border-radius: 0;
	}
	.index button::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 1px;
		background: var(--text);
		transform: scaleX(0);
		transform-origin: left;
		transition: transform var(--dur-3) var(--ease-out);
	}
	.index button[aria-current='page'] {
		color: var(--text);
	}
	.index button[aria-current='page']::after {
		transform: scaleX(1);
	}
	.index button:hover:not(:disabled) {
		color: var(--text);
	}
	.index button:disabled {
		color: var(--text-3);
		opacity: 0.55;
		cursor: default;
	}
	.n {
		display: inline-grid;
		place-items: center;
		min-width: 16px;
		font-size: var(--text-2xs);
		color: var(--text-3);
	}
	[aria-current='page'] .n {
		color: var(--accent);
	}
	.n :global(svg) {
		color: var(--accent);
	}
	.live {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		animation: gm-pulse 1.6s var(--ease-in-out) infinite;
	}
	.follow {
		flex: none;
		font-size: var(--text-xs);
		color: var(--accent);
		padding: 4px 8px;
		border-radius: var(--radius-xs);
	}
	.follow:hover {
		background: var(--accent-soft);
	}
	.page {
		overflow-y: auto;
		min-height: 0;
		scrollbar-width: thin;
		scrollbar-color: var(--line-strong) transparent;
	}
	.view {
		padding: var(--space-8) var(--gutter) var(--space-11);
		animation: gm-fade-up var(--dur-3) var(--ease-out);
	}
	@media (max-width: 900px) {
		.view {
			padding-top: var(--space-6);
		}
		.index ol {
			gap: var(--space-5);
		}
	}
</style>
