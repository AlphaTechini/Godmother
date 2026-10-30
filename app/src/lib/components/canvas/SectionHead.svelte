<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		index,
		eyebrow,
		title,
		lede,
		aside
	}: { index?: string; eyebrow: string; title: string; lede?: string; aside?: Snippet } = $props();
</script>

<header class="head">
	<div class="text">
		<p class="eyebrow">
			{#if index}<span class="idx num">{index}</span>{/if}{eyebrow}
		</p>
		<h2 class="display">{title}</h2>
		{#if lede}<p class="lede">{lede}</p>{/if}
	</div>
	{#if aside}<div class="aside">{@render aside()}</div>{/if}
</header>

<style>
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-6);
		flex-wrap: wrap;
		padding-bottom: var(--space-5);
		margin-bottom: var(--space-7);
		border-bottom: 1px solid var(--line);
	}
	.text {
		display: grid;
		gap: var(--space-3);
		max-width: 62ch;
	}
	.idx {
		color: var(--accent);
		margin-right: 10px;
	}
	h2 {
		font-size: clamp(2.1rem, 1.2rem + 2vw, 3.4rem);
		line-height: 1.02;
	}
	.lede {
		color: var(--text-2);
		font-size: var(--text-md);
		line-height: 1.5;
		max-width: 56ch;
	}
	.aside {
		flex: none;
	}
</style>
