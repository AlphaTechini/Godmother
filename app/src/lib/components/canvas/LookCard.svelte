<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Plate from '#lib/components/ui/Plate.svelte';
	import Swatch from '#lib/components/ui/Swatch.svelte';
	import RenderSteps from './RenderSteps.svelte';
	import { ROLE_LABEL, ROMAN, formatMoney, formatRange, sourceLabel } from '#lib/client/format';
	import type { Look, LookPiece } from '#lib/types';

	let {
		look,
		chosen = false,
		picked = false,
		busy = false,
		onchoose,
		onretry
	}: {
		look: Look;
		/** The user's chosen look. */
		chosen?: boolean;
		/** Godmother's pick from "Decide for me". */
		picked?: boolean;
		busy?: boolean;
		onchoose?: () => void;
		onretry?: () => void;
	} = $props();

	let why = $state(false);
	const status = $derived(look.render.status);
	const working = $derived(status === 'rendering' || status === 'pending');
	const id = $props.id();

	function price(p: LookPiece): string {
		if (p.source.type === 'product') return formatMoney(p.source.product.price);
		if (p.source.type === 'sew') return formatRange(p.source.design.estimate);
		return '';
	}
</script>

<article class="look" class:chosen aria-labelledby="{id}-t">
	<div class="frame">
		<Plate
			asset={look.render.image}
			alt="{look.title}: {look.summary} Tried on you."
			ratio="2 / 3"
			fit="contain"
			loading={working}
		>
			<span class="numeral display" aria-hidden="true">{ROMAN[look.index]}</span>
			{#if chosen}
				<span class="flag chosen-flag"><Check size={12} strokeWidth={2.6} aria-hidden="true" />Chosen</span>
			{:else if picked}
				<span class="flag">Godmother’s pick</span>
			{/if}
			{#if look.version > 1}<span class="ver">Revised · v{look.version}</span>{/if}

			{#if working}
				<div class="progress" role="status" aria-live="polite">
					<p class="ptitle">
						{status === 'pending' ? 'Queued' : 'Trying it on you'}<span class="dots" aria-hidden="true"></span>
					</p>
					<RenderSteps steps={look.render.steps} dense />
				</div>
			{:else if status === 'failed'}
				<div class="failed" role="alert">
					<CircleAlert size={22} strokeWidth={1.5} aria-hidden="true" />
					<p class="ftitle">This try-on didn’t render</p>
					<p class="fbody">{look.render.error ?? 'YouCam returned an error. No units were charged.'}</p>
					{#if onretry}
						<button type="button" class="btn btn-sm btn-secondary" onclick={onretry}><RefreshCw /> Try again</button>
					{/if}
				</div>
			{/if}
		</Plate>
	</div>

	<div class="body">
		<p class="eyebrow">Look {ROMAN[look.index]}{#if look.render.seconds}<span class="secs num"> · rendered in {look.render.seconds}s</span>{/if}</p>
		<h3 id="{id}-t" class="display">{look.title}</h3>
		<p class="summary">{look.summary}</p>

		<div class="palette" aria-label="Palette">
			{#each look.palette as c (c.hex)}<Swatch color={c} size={12} label />{/each}
		</div>

		<ul class="pieces">
			{#each look.pieces as p (p.id)}
				<li>
					<span class="role">{ROLE_LABEL[p.role]}</span>
					<span class="pname">
						{p.name}
						<span class="src" class:yours={p.source.type === 'wardrobe'} class:sew={p.source.type === 'sew'}>{sourceLabel(p.source)}</span>
					</span>
					<span class="price num">{price(p)}</span>
				</li>
			{/each}
		</ul>

		<button type="button" class="why-toggle" aria-expanded={why} aria-controls="{id}-why" onclick={() => (why = !why)}>
			Why this works <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
		</button>
		{#if why}<p class="why" id="{id}-why">{look.rationale}</p>{/if}

		{#if onchoose}
			<div class="actions">
				{#if chosen}
					<p class="is-chosen"><Check size={15} strokeWidth={2.2} aria-hidden="true" /> Your look</p>
				{:else}
					<button type="button" class="btn {picked ? 'btn-primary' : 'btn-secondary'}" disabled={busy || working || status === 'failed'} onclick={onchoose}>
						Choose this look
					</button>
				{/if}
			</div>
		{/if}
	</div>
</article>

<style>
	.look {
		display: grid;
		grid-template-rows: auto 1fr;
		gap: var(--space-5);
		min-width: 0;
	}
	.frame {
		position: relative;
		border-radius: var(--radius-sm);
		transition:
			box-shadow var(--dur-3) var(--ease-out),
			transform var(--dur-3) var(--ease-out);
	}
	.chosen .frame {
		box-shadow:
			0 0 0 1px var(--bg),
			0 0 0 2px var(--accent);
	}
	.numeral {
		position: absolute;
		left: 14px;
		top: 8px;
		font-size: 2.6rem;
		font-style: italic;
		color: rgb(22 19 15 / 0.82);
		text-shadow: 0 1px 0 rgb(255 255 255 / 0.25);
		line-height: 1;
	}
	.flag {
		position: absolute;
		right: 10px;
		top: 12px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 8px;
		border-radius: var(--radius-xs);
		background: rgb(22 19 15 / 0.82);
		color: #ead3a8;
		font-size: var(--text-3xs);
		font-weight: 650;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		backdrop-filter: blur(6px);
	}
	.chosen-flag {
		background: var(--champagne);
		color: #17130d;
	}
	.ver {
		position: absolute;
		left: 14px;
		bottom: 12px;
		font-size: var(--text-2xs);
		color: rgb(22 19 15 / 0.75);
		font-weight: 600;
	}
	.progress {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: 10px;
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface) 86%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid var(--line);
	}
	.ptitle {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-md);
		margin-bottom: var(--space-2);
	}
	.dots::after {
		content: '…';
		animation: gm-pulse 1.4s var(--ease-in-out) infinite;
	}
	.failed {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-5);
		text-align: center;
		background: color-mix(in srgb, var(--surface) 90%, transparent);
		color: var(--danger);
	}
	.ftitle {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--text);
	}
	.fbody {
		font-size: var(--text-xs);
		color: var(--text-2);
		max-width: 28ch;
		margin-bottom: var(--space-2);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.secs {
		letter-spacing: 0.04em;
		text-transform: none;
	}
	h3 {
		font-size: var(--text-2xl);
		line-height: 1.05;
	}
	.summary {
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.5;
	}
	.palette {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
	}
	.pieces {
		margin-top: var(--space-1);
		border-top: 1px solid var(--line);
	}
	.pieces li {
		display: grid;
		grid-template-columns: 64px 1fr auto;
		gap: var(--space-2);
		align-items: baseline;
		padding: 9px 0;
		border-bottom: 1px solid var(--line);
		font-size: var(--text-xs);
	}
	.role {
		font-size: var(--text-3xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	.pname {
		color: var(--text);
		line-height: 1.4;
	}
	.src {
		display: inline-block;
		margin-left: 4px;
		font-size: var(--text-3xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-3);
		white-space: nowrap;
	}
	.src.yours {
		color: var(--success);
	}
	.src.sew {
		color: var(--accent);
	}
	.price {
		color: var(--text-2);
		white-space: nowrap;
		text-align: right;
	}
	.why-toggle {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-xs);
		font-weight: 560;
		color: var(--text-2);
	}
	.why-toggle:hover {
		color: var(--text);
	}
	.why-toggle :global(svg) {
		transition: transform var(--dur-2) var(--ease-out);
	}
	.why-toggle[aria-expanded='true'] :global(svg) {
		transform: rotate(180deg);
	}
	.why {
		font-size: var(--text-sm);
		color: var(--text-2);
		line-height: 1.55;
		animation: gm-fade-up var(--dur-2) var(--ease-out);
	}
	.actions {
		margin-top: auto;
		padding-top: var(--space-2);
	}
	.actions .btn {
		width: 100%;
	}
	.is-chosen {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 40px;
		border-radius: var(--radius-sm);
		background: var(--accent-soft);
		color: var(--accent);
		font-size: var(--text-sm);
		font-weight: 600;
	}
</style>
