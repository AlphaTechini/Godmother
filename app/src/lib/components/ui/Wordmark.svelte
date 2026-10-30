<script lang="ts">
	let { size = 22, href }: { size?: number; href?: string } = $props();
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	{href}
	class="wordmark"
	style:--size="{size}px"
	aria-label={href ? 'Godmother, home' : undefined}
>
	<svg viewBox="0 0 64 64" aria-hidden="true">
		<!-- The glass slipper, with a spark of her magic. -->
		<path
			d="M6.5 47.5c0-1.7 1.2-2.9 3-3.3 6.7-1.5 12.1-3.9 16.3-7.8 3.6-3.4 6.3-8 9.3-12.5 1.3-2 2.9-3 4.7-3 2.3 0 3.7 1.5 4.2 4.2l3.7 28.4h-3.4l-4.9-20.5c-3.3 2.6-5.4 6-7.4 9.5-2 3.5-4.9 7-10.3 7H11c-2.9 0-4.5-.5-4.5-2z"
			fill="currentColor"
		/>
		<path
			d="M50 2c1.400 7.200 2.800 8.600 10 10-7.200 1.400-8.600 2.800-10 10-1.400-7.200-2.800-8.600-10-10 7.200-1.400 8.600-2.800 10-10z"
			fill="currentColor"
		/>
		<path
			d="M29 11c.56 2.88 1.12 3.44 4 4-2.88.56-3.44 1.12-4 4-.56-2.88-1.12-3.44-4-4 2.88-.56 3.44-1.12 4-4z"
			fill="currentColor"
		/>
	</svg>
	<span class="name">Godmother</span>
</svelte:element>

<style>
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: calc(var(--size) * 0.32);
		color: var(--text);
		text-decoration: none;
		line-height: 1;
	}
	svg {
		width: calc(var(--size) * 1.15);
		height: calc(var(--size) * 1.15);
		color: var(--accent);
		flex: none;
	}
	.name {
		font-family: var(--font-display);
		font-size: var(--size);
		font-weight: 500;
		font-style: italic;
		letter-spacing: -0.01em;
		padding-bottom: 0.08em;
	}
	a.wordmark {
		border-radius: var(--radius-sm);
	}
</style>
