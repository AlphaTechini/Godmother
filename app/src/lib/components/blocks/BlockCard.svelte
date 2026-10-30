<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';

	let {
		eyebrow,
		action,
		onaction,
		tone = 'default',
		children
	}: {
		eyebrow: string;
		action?: string;
		onaction?: () => void;
		tone?: 'default' | 'accent' | 'danger';
		children: Snippet;
	} = $props();
</script>

<section class="card {tone}" aria-label={eyebrow}>
	<header>
		<p class="eyebrow">{eyebrow}</p>
		{#if action && onaction}
			<button type="button" class="open" onclick={onaction}>
				{action}<ArrowUpRight size={13} strokeWidth={1.8} aria-hidden="true" />
			</button>
		{/if}
	</header>
	{@render children()}
</section>

<style>
	.card {
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--surface);
		padding: var(--space-3) var(--space-4) var(--space-4);
		animation: gm-fade-up var(--dur-3) var(--ease-out);
	}
	.accent {
		border-color: var(--accent-line);
		background: linear-gradient(180deg, var(--accent-soft), transparent 60%), var(--surface);
	}
	.danger {
		border-color: color-mix(in srgb, var(--danger) 40%, transparent);
		background: var(--danger-soft);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: 24px;
		margin-bottom: var(--space-2);
	}
	.danger .eyebrow {
		color: var(--danger);
	}
	.open {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-xs);
		font-weight: 560;
		color: var(--accent);
		padding: 2px 4px;
		margin-right: -4px;
		border-radius: var(--radius-xs);
	}
	.open:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
