<script lang="ts">
	import type { NamedColor } from '#lib/types';

	let {
		color,
		size = 14,
		label = false,
		hex = false
	}: { color: NamedColor; size?: number; label?: boolean; hex?: boolean } = $props();
</script>

<span class="swatch" title={label ? undefined : `${color.name} ${color.hex}`}>
	<span class="dot" style:--c={color.hex} style:--s="{size}px" aria-hidden="true"></span>
	{#if label}
		<span class="name">{color.name}</span>
		{#if hex}<span class="hex num">{color.hex.toUpperCase()}</span>{/if}
	{:else}
		<span class="visually-hidden">{color.name}</span>
	{/if}
</span>

<style>
	.swatch {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: var(--text-xs);
		color: var(--text-2);
		min-width: 0;
	}
	.dot {
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		background: var(--c);
		box-shadow:
			inset 0 0 0 1px rgb(255 255 255 / 0.12),
			0 0 0 1px var(--line-strong);
		flex: none;
	}
	.name {
		color: var(--text);
		white-space: nowrap;
	}
	.hex {
		color: var(--text-3);
		font-size: var(--text-2xs);
		letter-spacing: 0.04em;
	}
</style>
