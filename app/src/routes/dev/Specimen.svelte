<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		label,
		note,
		width,
		height,
		children
	}: { label: string; note?: string; width?: string; height?: string; children: Snippet } = $props();
</script>

<figure class="specimen" style:--w={width ?? 'auto'}>
	<figcaption><span>{label}</span>{#if note}<small>{note}</small>{/if}</figcaption>
	<div class="stage" style:height={height}>{@render children()}</div>
</figure>

<style>
	.specimen {
		display: grid;
		gap: var(--space-2);
		width: var(--w);
		max-width: 100%;
		min-width: 0;
	}
	figcaption {
		display: flex;
		gap: var(--space-3);
		align-items: baseline;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--text-3);
	}
	small {
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}
	.stage {
		position: relative;
		padding: var(--space-5);
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius-sm);
		background: var(--bg);
		overflow: auto;
	}
</style>
