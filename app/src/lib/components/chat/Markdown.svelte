<script lang="ts">
	import { renderMarkdown } from '#lib/client/markdown';

	let { text, streaming = false }: { text: string; streaming?: boolean } = $props();
	const html = $derived(renderMarkdown(text));
</script>

<!-- renderMarkdown escapes all input before adding its own markup. -->
<div class="md" class:streaming>{@html html}</div>

<style>
	.md {
		font-size: var(--text-base);
		line-height: 1.62;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.md :global(p + p),
	.md :global(p + ul),
	.md :global(p + ol),
	.md :global(ul + p),
	.md :global(ol + p),
	.md :global(h4 + p) {
		margin-top: 0.7em;
	}
	.md :global(strong) {
		font-weight: 620;
		color: var(--text);
	}
	.md :global(em) {
		font-style: italic;
	}
	.md :global(a) {
		color: var(--accent);
		text-decoration-color: var(--accent-line);
	}
	.md :global(a:hover) {
		text-decoration-color: currentColor;
	}
	.md :global(code) {
		font-size: 0.9em;
		padding: 1px 5px;
		border-radius: var(--radius-xs);
		background: var(--surface-2);
	}
	.md :global(h4) {
		font-family: var(--font-display);
		font-size: var(--text-md);
		margin-top: 0.9em;
	}
	.md :global(ul),
	.md :global(ol) {
		margin-top: 0.6em;
		display: grid;
		gap: 0.4em;
	}
	.md :global(ol) {
		counter-reset: md;
	}
	.md :global(li) {
		position: relative;
		padding-left: 1.6em;
	}
	.md :global(ul > li::before) {
		content: '';
		position: absolute;
		left: 0.45em;
		top: 0.72em;
		width: 5px;
		height: 1px;
		background: var(--accent);
	}
	.md :global(ol > li) {
		counter-increment: md;
	}
	.md :global(ol > li::before) {
		content: counter(md);
		position: absolute;
		left: 0;
		top: 0.08em;
		font-family: var(--font-display);
		font-style: italic;
		color: var(--accent);
		font-size: 0.95em;
	}
	/* Streaming caret after the last character. */
	.streaming :global(> :last-child::after) {
		content: '';
		display: inline-block;
		width: 2px;
		height: 1.05em;
		margin-left: 2px;
		vertical-align: -0.16em;
		background: var(--accent);
		animation: gm-pulse 1s var(--ease-in-out) infinite;
	}
</style>
