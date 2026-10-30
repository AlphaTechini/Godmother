<script lang="ts">
	let { size = 22, href }: { size?: number; href?: string } = $props();
</script>

<svelte:element this={href ? 'a' : 'span'} {href} class="wordmark" style:--size="{size}px" aria-label={href ? 'Godmother, home' : undefined}>
	<svg viewBox="0 0 64 64" aria-hidden="true">
		<path
			d="M41.5 21.6c-2.3-3.2-5.6-4.9-9.5-4.9-8 0-13.3 6.3-13.3 15.3S24 47.3 32 47.3c4 0 7.3-1.5 9.6-4.2V33.6h-9.3"
			fill="none"
			stroke="currentColor"
			stroke-width="3.4"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<circle cx="46.5" cy="16.5" r="2.4" fill="currentColor" />
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
