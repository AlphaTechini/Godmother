<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import type { RenderStep } from '#lib/types';

	let { steps, dense = false }: { steps: RenderStep[]; dense?: boolean } = $props();
</script>

<ol class="steps" class:dense>
	{#each steps as s, i (i)}
		<li class={s.status}>
			<span class="mark">
				{#if s.status === 'done'}<Check size={11} strokeWidth={2.6} aria-hidden="true" />
				{:else if s.status === 'rendering'}<Spinner size={11} />
				{:else if s.status === 'failed'}<X size={11} strokeWidth={2.6} aria-hidden="true" />
				{:else}<span class="pip"></span>{/if}
			</span>
			<span class="label">{s.label}<span class="visually-hidden">: {s.status}</span></span>
			<span class="meta num">
				{#if s.status === 'failed'}Failed{:else if s.seconds}{s.seconds}s{:else if s.status === 'skipped'}Skipped{:else if s.units}{s.units}u{/if}
			</span>
		</li>
	{/each}
</ol>

<style>
	.steps {
		display: grid;
		gap: 7px;
	}
	li {
		display: grid;
		grid-template-columns: 18px 1fr auto;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.dense li {
		gap: 6px;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1px solid var(--line-strong);
		color: var(--text-3);
	}
	.pip {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.6;
	}
	.done .mark {
		border-color: transparent;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.done .label {
		color: var(--text-2);
	}
	.rendering .mark {
		border-color: transparent;
	}
	.rendering .label {
		color: var(--text);
	}
	.failed .mark {
		border-color: transparent;
		background: var(--danger-soft);
		color: var(--danger);
	}
	.failed .label,
	.failed .meta {
		color: var(--danger);
	}
	.meta {
		font-size: var(--text-2xs);
	}
</style>
