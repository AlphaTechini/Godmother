<!-- An image frame for try-on results and product shots. `contain` never crops: the image
     sits over a soft, blurred copy of itself, like a print on a mount. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Asset } from '#lib/types';

	let {
		asset,
		alt,
		ratio = '2 / 3',
		fit = 'cover',
		rounded = true,
		loading = false,
		children
	}: {
		asset?: Asset;
		alt: string;
		ratio?: string;
		fit?: 'cover' | 'contain';
		rounded?: boolean;
		loading?: boolean;
		children?: Snippet;
	} = $props();

	let loaded = $state(false);
</script>

<div class="plate" class:rounded style:aspect-ratio={ratio} class:loaded>
	{#if asset}
		{#if fit === 'contain'}
			<img class="backdrop" src={asset.url} alt="" aria-hidden="true" />
		{/if}
		<img
			class="img"
			class:contain={fit === 'contain'}
			src={asset.url}
			{alt}
			width={asset.width}
			height={asset.height}
			decoding="async"
			onload={() => (loaded = true)}
		/>
	{/if}
	{#if loading || !asset}
		<div class="placeholder" class:shimmer={loading}></div>
	{/if}
	{#if children}<div class="overlay">{@render children()}</div>{/if}
</div>

<style>
	.plate {
		position: relative;
		overflow: hidden;
		background: var(--surface-2);
		isolation: isolate;
		width: 100%;
	}
	.rounded {
		border-radius: var(--radius-sm);
	}
	.img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 30%;
		opacity: 0;
		transition: opacity var(--dur-3) var(--ease-out);
	}
	.img.contain {
		object-fit: contain;
	}
	.loaded .img {
		opacity: 1;
	}
	.backdrop {
		position: absolute;
		inset: -10%;
		width: 120%;
		height: 120%;
		object-fit: cover;
		filter: blur(28px) saturate(1.1);
		opacity: 0.6;
	}
	.placeholder {
		position: absolute;
		inset: 0;
	}
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
	}
</style>
