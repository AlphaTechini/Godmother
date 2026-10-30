<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import SectionHead from './SectionHead.svelte';
	import { getStudio } from '#lib/client/studio.svelte';
	import { DRESS_CODE_LABEL, hostname, isLight } from '#lib/client/format';
	import type { EventBrief, UserLocation } from '#lib/types';

	let { event, location }: { event?: EventBrief; location?: UserLocation } = $props();
	const studio = getStudio();

	const PRIORITY = [
		{ k: 'Dress code', d: 'Overrides everything.' },
		{ k: 'Colours & theme', d: 'What the hosts asked for.' },
		{ k: 'Place & culture', d: 'Local occasion wear, local norms.' },
		{ k: 'Your taste', d: 'Within all of the above.' }
	];
	const ORIGIN = { web: 'Found on the web', invitation: 'Read from your invitation', typed: 'From your description' };
</script>

{#if !event}
	<div class="empty">
		<p class="eyebrow"><span class="idx num">01</span>The brief</p>
		<h2 class="display">Every look starts with<br /><em>what the evening asks for.</em></h2>
		<p class="lede">
			Give Godmother the event’s name or link, describe it, or upload the invitation. She’ll pull
			the date, venue, colours and, above all, the dress code.
		</p>

		<div class="ways">
			<button type="button" onclick={() => studio.prefill('We’re going to ')}>
				<span class="n display">i.</span>
				<b>Name it</b>
				<span>“The Eko Heritage Ball”, or paste a link. She searches the web.</span>
			</button>
			<button type="button" onclick={() => studio.attach('invitation')}>
				<span class="n display">ii.</span>
				<b>Upload the invitation</b>
				<span>A photo or PDF, read hands-free.</span>
			</button>
			<button type="button" onclick={() => studio.prefill('It’s a ')}>
				<span class="n display">iii.</span>
				<b>Describe it</b>
				<span>For private events that aren’t online.</span>
			</button>
		</div>

		<section class="priority" aria-labelledby="prio">
			<h3 id="prio" class="eyebrow">How Godmother weighs it</h3>
			<ol>
				{#each PRIORITY as p, i (p.k)}
					<li class:first={i === 0}><span class="num">{i + 1}</span><b>{p.k}</b><span>{p.d}</span></li>
				{/each}
			</ol>
		</section>
	</div>
{:else}
	<article class="brief">
		<SectionHead
			index="01"
			eyebrow={`${ORIGIN[event.origin]}${event.sources.length ? ` · ${event.sources.length} source${event.sources.length > 1 ? 's' : ''}` : ''}`}
			title={event.name}
		/>

		<dl class="facts">
			{#if event.date}<div><dt class="eyebrow">When</dt><dd>{event.date}</dd></div>{/if}
			{#if event.venue}<div><dt class="eyebrow">Where</dt><dd>{event.venue}{event.city ? `, ${event.city}` : ''}</dd></div>{/if}
			{#if event.setting}<div><dt class="eyebrow">Setting</dt><dd>{event.setting}</dd></div>{/if}
			{#if event.theme}<div><dt class="eyebrow">Theme</dt><dd>{event.theme}</dd></div>{/if}
		</dl>

		<section class="code" aria-labelledby="dc">
			<div class="code-main">
				<h3 id="dc" class="eyebrow">Dress code</h3>
				<p class="code-value display">{event.dressCode ?? DRESS_CODE_LABEL[event.dressCodeNormalized]}</p>
				{#if event.dressCode && DRESS_CODE_LABEL[event.dressCodeNormalized].toLowerCase() !== event.dressCode.toLowerCase()}
					<p class="code-norm">Read as {DRESS_CODE_LABEL[event.dressCodeNormalized].toLowerCase()}</p>
				{/if}
			</div>
			<div class="code-rule">
				<p class="rule-title"><span class="mark" aria-hidden="true"></span>Dress code overrides everything.</p>
				<p class="rule-body">
					It is the first test every look must pass, before colour, culture or taste. Then come the
					hosts’ colours, then {location?.city ?? 'local'} norms, then you.
				</p>
			</div>
		</section>

		{#if event.colors.length}
			<section class="colors" aria-labelledby="cl">
				<h3 id="cl" class="eyebrow">The evening’s colours</h3>
				<ul>
					{#each event.colors as c (c.hex)}
						<li style:--c={c.hex} class:light={isLight(c.hex)}>
							<span class="chip"></span>
							<span class="cname">{c.name}</span>
							<span class="chex num">{c.hex.toUpperCase()}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<div class="lower">
			{#if event.notes.length}
				<section aria-labelledby="nt">
					<h3 id="nt" class="eyebrow">Worth knowing</h3>
					<ul class="notes">
						{#each event.notes as n (n)}<li>{n}</li>{/each}
					</ul>
				</section>
			{/if}
			<section aria-labelledby="sr">
				<h3 id="sr" class="eyebrow">Sources</h3>
				{#if event.sources.length}
					<ul class="sources">
						{#each event.sources as s (s.url)}
							<li>
								<a href={s.url} target="_blank" rel="noopener noreferrer">
									<span>{s.title}</span>
									<small>{hostname(s.url)}</small>
									<ArrowUpRight size={14} strokeWidth={1.6} aria-hidden="true" />
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="muted small">From your own description.</p>
				{/if}
				{#if location}
					<p class="loc"><MapPin size={14} strokeWidth={1.6} aria-hidden="true" />Dressing for {[location.city, location.country].filter(Boolean).join(', ')} · prices in {location.currency}</p>
				{/if}
			</section>
		</div>
	</article>
{/if}

<style>
	.idx {
		color: var(--accent);
		margin-right: 10px;
	}
	/* -------- empty */
	.empty {
		display: grid;
		gap: var(--space-5);
		max-width: 760px;
	}
	.empty h2 {
		font-size: clamp(2.1rem, 1.2rem + 2vw, 3.4rem);
		line-height: 1.04;
	}
	.empty h2 em {
		color: var(--accent);
	}
	.lede {
		color: var(--text-2);
		font-size: var(--text-md);
		max-width: 54ch;
	}
	.ways {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		margin-top: var(--space-4);
	}
	.ways button {
		display: grid;
		align-content: start;
		gap: 6px;
		padding: var(--space-5) var(--space-5) var(--space-6) 0;
		text-align: left;
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.5;
		transition: color var(--dur-2) var(--ease-out);
	}
	.ways button + button {
		padding-left: var(--space-5);
		border-left: 1px solid var(--line);
	}
	.ways b {
		font-weight: 560;
		font-size: var(--text-base);
		color: var(--text);
	}
	.ways .n {
		font-style: italic;
		color: var(--accent);
		font-size: var(--text-lg);
	}
	.ways button:hover b {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-underline-offset: 4px;
	}
	.priority ol {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-4);
		margin-top: var(--space-3);
	}
	.priority li {
		display: grid;
		align-content: start;
		gap: 2px;
		font-size: var(--text-sm);
		color: var(--text-3);
		padding-top: var(--space-3);
		border-top: 2px solid var(--line);
	}
	.priority li b {
		color: var(--text-2);
		font-weight: 560;
	}
	.priority li .num {
		font-size: var(--text-2xs);
	}
	.priority li.first {
		border-top-color: var(--accent);
	}
	.priority li.first b {
		color: var(--text);
	}
	.priority li.first .num {
		color: var(--accent);
	}
	/* -------- brief */
	.brief {
		max-width: 1040px;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-5) var(--space-6);
	}
	.facts dd {
		margin-top: 6px;
		font-size: var(--text-md);
		line-height: 1.4;
	}
	.code {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: var(--space-7);
		align-items: end;
		margin: var(--space-8) 0;
		padding: var(--space-7) var(--space-7) var(--space-7);
		border: 1px solid var(--accent-line);
		border-radius: var(--radius-sm);
		background:
			radial-gradient(120% 140% at 0% 0%, var(--accent-soft), transparent 60%),
			var(--surface);
	}
	.code .eyebrow {
		color: var(--accent);
	}
	.code-value {
		font-size: clamp(3rem, 2rem + 4vw, 5.5rem);
		font-style: italic;
		line-height: 0.95;
		margin-top: var(--space-3);
	}
	.code-norm {
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-3);
	}
	.code-rule {
		padding-left: var(--space-6);
		border-left: 1px solid var(--line-strong);
	}
	.rule-title {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 600;
		font-size: var(--text-md);
	}
	.mark {
		width: 8px;
		height: 8px;
		transform: rotate(45deg);
		background: var(--accent);
		flex: none;
	}
	.rule-body {
		margin-top: var(--space-2);
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.55;
	}
	.colors ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.colors li {
		display: grid;
		grid-template-rows: auto auto auto;
		gap: 2px;
	}
	.chip {
		height: 120px;
		background: var(--c);
		border-radius: var(--radius-xs);
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
		margin-bottom: var(--space-2);
	}
	.cname {
		font-size: var(--text-sm);
		font-weight: 560;
	}
	.chex {
		font-size: var(--text-2xs);
		color: var(--text-3);
		letter-spacing: 0.04em;
	}
	.lower {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: var(--space-8);
		margin-top: var(--space-8);
		padding-top: var(--space-6);
		border-top: 1px solid var(--line);
	}
	.notes {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.notes li {
		position: relative;
		padding-left: var(--space-5);
		color: var(--text-2);
		line-height: 1.55;
	}
	.notes li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.75em;
		width: 9px;
		height: 1px;
		background: var(--accent);
	}
	.sources {
		margin-top: var(--space-2);
	}
	.sources a {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: 't i' 'h i';
		align-items: center;
		column-gap: var(--space-3);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--line);
		text-decoration: none;
	}
	.sources a span {
		grid-area: t;
		font-size: var(--text-sm);
	}
	.sources a small {
		grid-area: h;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.sources a :global(svg) {
		grid-area: i;
		color: var(--text-3);
		transition: transform var(--dur-2) var(--ease-out);
	}
	.sources a:hover span {
		color: var(--accent);
	}
	.sources a:hover :global(svg) {
		color: var(--accent);
		transform: translate(2px, -2px);
	}
	.loc {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: var(--space-4);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.small {
		font-size: var(--text-sm);
		margin-top: var(--space-2);
	}
	@media (max-width: 760px) {
		.ways,
		.lower,
		.code {
			grid-template-columns: 1fr;
		}
		.ways button + button {
			padding-left: 0;
			border-left: 0;
			border-top: 1px solid var(--line);
		}
		.priority ol {
			grid-template-columns: repeat(2, 1fr);
		}
		.code {
			padding: var(--space-5);
			gap: var(--space-5);
		}
		.code-rule {
			padding-left: 0;
			border-left: 0;
			padding-top: var(--space-4);
			border-top: 1px solid var(--line-strong);
		}
	}
</style>
