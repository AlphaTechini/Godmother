<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import type { Activity } from '#lib/client/session.svelte';

	let { activity }: { activity: Activity } = $props();
	const secs = $derived(
		activity.endedAt ? Math.max(0.1, (activity.endedAt - activity.startedAt) / 1000) : null
	);
</script>

<li class="activity {activity.status}">
	<span class="icon">
		{#if activity.status === 'running'}
			<Spinner size={12} />
		{:else if activity.status === 'done'}
			<Check size={13} strokeWidth={2.2} aria-hidden="true" />
		{:else}
			<X size={13} strokeWidth={2.2} aria-hidden="true" />
		{/if}
	</span>
	<span class="label">
		{activity.label}{#if activity.status === 'running'}<span class="ellipsis" aria-hidden="true"
			></span>{/if}
		{#if activity.detail}<span class="detail">{activity.detail}</span>{/if}
	</span>
	{#if activity.status === 'failed'}
		<span class="state">Failed</span>
	{:else if secs !== null && secs >= 0.5}
		<span class="state num">{secs.toFixed(1)}s</span>
	{/if}
	<span class="visually-hidden">
		{activity.status === 'running' ? 'in progress' : activity.status === 'done' ? 'done' : 'failed'}
	</span>
</li>

<style>
	.activity {
		display: grid;
		grid-template-columns: 16px 1fr auto;
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-sm);
		line-height: 1.45;
		color: var(--text-2);
		animation: gm-fade-up var(--dur-3) var(--ease-out);
	}
	.icon {
		display: grid;
		place-items: center;
		height: 1.45em;
		align-self: start;
		color: var(--success);
	}
	.failed .icon,
	.failed .state {
		color: var(--danger);
	}
	.running .label {
		color: var(--text);
		background: linear-gradient(90deg, var(--text) 40%, var(--text-3) 50%, var(--text) 60%);
		background-size: 300% 100%;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		animation: gm-shimmer 2.2s linear infinite;
	}
	.detail {
		display: block;
		font-size: var(--text-xs);
		color: var(--text-3);
		-webkit-text-fill-color: var(--text-3);
	}
	.state {
		font-size: var(--text-2xs);
		color: var(--text-3);
	}
	.ellipsis::after {
		content: '…';
	}
</style>
