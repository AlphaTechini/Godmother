<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	let {
		options,
		onpick,
		highlightFirst = false,
		disabled = false
	}: {
		options: string[];
		onpick: (option: string) => void;
		highlightFirst?: boolean;
		disabled?: boolean;
	} = $props();
</script>

<div class="suggestions" role="group" aria-label="Suggested replies">
	{#each options as option, i (option)}
		<button
			type="button"
			class="chip"
			class:lead={highlightFirst && i === 0}
			{disabled}
			onclick={() => onpick(option)}
			style:animation-delay="{i * 60}ms"
		>
			{#if highlightFirst && i === 0}<span class="next">Next</span>{/if}
			<span>{option}</span>
			<ArrowRight size={13} strokeWidth={1.8} aria-hidden="true" />
		</button>
	{/each}
</div>

<style>
	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 34px;
		padding: 6px 12px 6px 14px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--line-strong);
		font-size: var(--text-sm);
		line-height: 1.3;
		color: var(--text);
		text-align: left;
		background: transparent;
		animation: gm-fade-up var(--dur-3) var(--ease-out) both;
		transition:
			border-color var(--dur-2) var(--ease-out),
			background-color var(--dur-2) var(--ease-out);
	}
	.chip :global(svg) {
		color: var(--text-3);
		flex: none;
		transition: transform var(--dur-2) var(--ease-out);
	}
	.chip:hover:not(:disabled) {
		border-color: var(--accent-line);
		background: var(--accent-soft);
	}
	.chip:hover:not(:disabled) :global(svg) {
		transform: translateX(2px);
		color: var(--accent);
	}
	.chip:disabled {
		opacity: 0.5;
	}
	.lead {
		border-color: var(--accent-line);
		background: var(--accent-soft);
	}
	.lead :global(svg) {
		color: var(--accent);
	}
	.next {
		font-size: var(--text-3xs);
		font-weight: 650;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--accent);
	}
</style>
