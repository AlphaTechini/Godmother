<!-- YouCam units spent against what this person may spend, with the ledger in a popover. -->
<script lang="ts">
	import type { UnitsState } from '#lib/types';
	import { formatTime } from '#lib/client/format';

	let { units, compact = false }: { units: UnitsState; compact?: boolean } = $props();

	let open = $state(false);
	let root: HTMLElement | undefined = $state();
	const pct = $derived(units.cap > 0 ? Math.min(100, (units.spent / units.cap) * 100) : 0);
	const level = $derived(pct >= 90 ? 'high' : pct >= 70 ? 'mid' : 'low');
	const panelId = $props.id();

	function onWindowClick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="meter" bind:this={root}>
	<button
		type="button"
		class="trigger"
		aria-expanded={open}
		aria-controls={panelId}
		onclick={() => (open = !open)}
		aria-label="YouCam units: {units.spent} of {units.cap} used. Show ledger"
	>
		{#if !compact}<span class="label">Units</span>{/if}
		<span class="bar {level}" aria-hidden="true"><span style:width="{pct}%"></span></span>
		<span class="count num"><b>{units.spent}</b><span>/{units.cap}</span></span>
	</button>

	{#if open}
		<div class="panel" id={panelId} role="dialog" aria-label="YouCam unit ledger">
			<header>
				<p class="eyebrow">YouCam units this session</p>
				<p class="big num"><b>{units.spent}</b> <span>of {units.cap}</span></p>
				<p class="hint">
					Face analysis runs once; only the chosen look gets makeup, hair and jewellery. The cap
					stops anything that would go over.
				</p>
			</header>
			{#if units.ledger.length}
				<ol class="ledger">
					{#each units.ledger as e, i (i)}
						<li class:failed={!e.ok}>
							<span class="f">{e.feature}</span>
							<span class="t num">{formatTime(e.at)}</span>
							<span class="u num">{e.ok ? `${e.units}` : '0'}</span>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="empty">Nothing spent yet.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.meter {
		position: relative;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		height: 32px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		transition: background-color var(--dur-2) var(--ease-out);
	}
	.trigger:hover {
		background: var(--surface-2);
	}
	.label {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--text-3);
	}
	.bar {
		position: relative;
		width: 56px;
		height: 3px;
		border-radius: 2px;
		background: var(--line-strong);
		overflow: hidden;
	}
	.bar span {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--accent);
		border-radius: inherit;
		transition: width var(--dur-4) var(--ease-out);
	}
	.bar.high span {
		background: var(--danger);
	}
	.count {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.count b {
		color: var(--text);
		font-weight: 600;
	}
	.panel {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		width: min(340px, calc(100vw - 32px));
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-3);
		z-index: 50;
		animation: gm-fade-up var(--dur-2) var(--ease-out);
		overflow: hidden;
	}
	header {
		padding: var(--space-4) var(--space-4) var(--space-3);
		border-bottom: 1px solid var(--line);
	}
	.big {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		margin-top: 2px;
	}
	.big b {
		font-weight: 500;
	}
	.big span {
		color: var(--text-3);
		font-size: var(--text-md);
	}
	.hint {
		margin-top: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-2);
		line-height: 1.5;
	}
	.ledger {
		max-height: 260px;
		overflow: auto;
		padding: var(--space-2) 0;
	}
	.ledger li {
		display: grid;
		grid-template-columns: 1fr auto 28px;
		gap: var(--space-3);
		padding: 6px var(--space-4);
		font-size: var(--text-xs);
	}
	.f {
		color: var(--text);
	}
	.t {
		color: var(--text-3);
	}
	.u {
		text-align: right;
		color: var(--text);
		font-weight: 600;
	}
	.failed .f,
	.failed .u {
		color: var(--danger);
	}
	.empty {
		padding: var(--space-4);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
</style>
