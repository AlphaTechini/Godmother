<script lang="ts">
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import SectionHead from './SectionHead.svelte';
	import LookCard from './LookCard.svelte';
	import { getStudio } from '#lib/client/studio.svelte';
	import { ROMAN } from '#lib/client/format';

	const studio = getStudio();
	const client = $derived(studio.client);
	const s = $derived(client.session);
	const decision = $derived(s.decision);
	const picked = $derived(decision ? s.looks.find((l) => l.id === decision.lookId) : undefined);
	const chosen = $derived(s.looks.find((l) => l.id === s.chosenLookId));
	const allRendered = $derived(
		s.looks.every((l) => l.render.status === 'done' || l.render.status === 'failed')
	);
</script>

<article>
	<SectionHead
		index="03"
		eyebrow={s.event ? `For ${s.event.name}` : 'Three looks'}
		title={chosen ? `${chosen.title}, chosen.` : 'Three looks, tried on you.'}
		lede={chosen
			? 'Next: makeup from your face analysis, a hairstyle and the jewellery, all on you.'
			: 'Each one passes the dress code first. Tell Godmother what you don’t like, choose one, or let her decide.'}
	>
		{#snippet aside()}
			{#if s.stage === 'looks' && !decision}
				<button
					type="button"
					class="btn btn-primary btn-lg mobile-cta"
					disabled={client.streaming || !allRendered}
					onclick={() => studio.say('Decide for me.', { type: 'decide_for_me' })}
				>
					<Sparkles /> Decide for me
				</button>
			{:else if s.stage === 'chosen' && chosen}
				<button
					type="button"
					class="btn btn-primary btn-lg mobile-cta"
					disabled={client.streaming}
					onclick={() =>
						studio.say('Finish this look.', { type: 'finish_look', lookId: chosen.id })}
				>
					Finish this look <ArrowRight />
				</button>
			{/if}
		{/snippet}
	</SectionHead>

	{#if decision && picked}
		<section class="decision" aria-labelledby="dtitle">
			<div class="verdict">
				<p class="eyebrow" id="dtitle">
					<Sparkles size={12} aria-hidden="true" /> Godmother decides
				</p>
				<blockquote class="display">
					<p>{decision.reason}</p>
				</blockquote>
			</div>
			<ol class="ranking" aria-label="Ranking">
				{#each decision.ranking as r, i (r.lookId)}
					{@const l = s.looks.find((x) => x.id === r.lookId)}
					<li class:top={i === 0}>
						<span class="pos num">{i + 1}</span>
						<div>
							<p class="rt">{l ? `${ROMAN[l.index]}. ${l.title}` : r.lookId}</p>
							<p class="rn">{r.note}</p>
						</div>
						<span class="score num" aria-label="Score {r.score} of 100">{r.score}</span>
						<span class="bar" aria-hidden="true"><span style:width="{r.score}%"></span></span>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<div class="grid">
		{#each s.looks as look (look.id)}
			<LookCard
				{look}
				chosen={look.id === s.chosenLookId}
				picked={look.id === decision?.lookId}
				busy={client.streaming}
				onchoose={() =>
					studio.say(`I’ll wear look ${look.index}, ${look.title}.`, {
						type: 'choose_look',
						lookId: look.id
					})}
				onretry={() => studio.say(`Please try look ${look.index} on me again.`)}
			/>
		{/each}
	</div>
</article>

<style>
	article {
		max-width: 1180px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-7) var(--space-6);
	}
	.decision {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
		gap: var(--space-8);
		margin-bottom: var(--space-9);
		padding: var(--space-7);
		border: 1px solid var(--accent-line);
		border-radius: var(--radius-sm);
		background:
			radial-gradient(120% 140% at 0% 0%, var(--accent-soft), transparent 55%), var(--surface);
		animation: gm-fade-up var(--dur-4) var(--ease-out);
	}
	.verdict .eyebrow {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--accent);
	}
	blockquote {
		margin: var(--space-4) 0 0;
		font-size: var(--text-xl);
		line-height: 1.3;
		font-style: italic;
		letter-spacing: -0.005em;
	}
	blockquote p::before {
		content: '“';
		margin-left: -0.42em;
		color: var(--accent);
	}
	blockquote p::after {
		content: '”';
		color: var(--accent);
	}
	.ranking {
		display: grid;
		gap: var(--space-4);
		align-content: end;
	}
	.ranking li {
		display: grid;
		grid-template-columns: 20px 1fr auto;
		grid-template-areas: 'p t s' '. b b';
		column-gap: var(--space-3);
		row-gap: 8px;
		align-items: baseline;
	}
	.pos {
		grid-area: p;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.ranking div {
		grid-area: t;
	}
	.rt {
		font-size: var(--text-sm);
		font-weight: 560;
		color: var(--text-2);
	}
	.rn {
		font-size: var(--text-xs);
		color: var(--text-3);
		line-height: 1.45;
		margin-top: 2px;
	}
	.score {
		grid-area: s;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		line-height: 1;
		color: var(--text-2);
	}
	.bar {
		grid-area: b;
		height: 2px;
		background: var(--line);
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--text-3);
		transform-origin: left;
		animation: grow var(--dur-4) var(--ease-out) both;
	}
	.top .rt,
	.top .score {
		color: var(--text);
	}
	.top .pos {
		color: var(--accent);
	}
	.top .bar span {
		background: var(--accent);
	}
	@keyframes grow {
		from {
			transform: scaleX(0);
		}
	}
	@media (max-width: 1100px) {
		.decision {
			grid-template-columns: 1fr;
			gap: var(--space-6);
		}
	}
	@media (max-width: 760px) {
		.grid {
			grid-template-columns: 1fr;
			gap: var(--space-9);
		}
		.decision {
			padding: var(--space-5);
		}
	}
</style>
