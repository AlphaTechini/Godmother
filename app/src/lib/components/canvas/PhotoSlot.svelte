<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Upload from '@lucide/svelte/icons/upload';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Check from '@lucide/svelte/icons/check';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import type { Asset, PhotoSlot } from '#lib/types';

	let {
		slot,
		index,
		title,
		why,
		need,
		ratio,
		photo,
		uploading = false,
		onfile
	}: {
		slot: PhotoSlot;
		index: number;
		title: string;
		why: string;
		need: string;
		ratio: string;
		photo?: Asset;
		uploading?: boolean;
		onfile: (file: File) => void;
	} = $props();

	let over = $state(false);
	let input: HTMLInputElement | undefined = $state();
	let camera: HTMLInputElement | undefined = $state();
	const id = $props.id();

	function take(files: FileList | null | undefined) {
		const f = files?.[0];
		if (f && f.type.startsWith('image/')) onfile(f);
	}
</script>

<article class="slot" aria-labelledby="{id}-t">
	<header>
		<p class="eyebrow"><span class="num">0{index}</span></p>
		<h3 id="{id}-t">{title}</h3>
		<p class="why">{why}</p>
	</header>

	<div
		class="drop"
		class:over
		class:filled={!!photo}
		style:aspect-ratio={ratio}
		role="group"
		aria-label="{title} {photo ? '(added)' : ''}"
		ondragover={(e) => {
			e.preventDefault();
			over = true;
		}}
		ondragleave={() => (over = false)}
		ondrop={(e) => {
			e.preventDefault();
			over = false;
			take(e.dataTransfer?.files);
		}}
	>
		{#if photo}
			<img src={photo.url} alt="Your {title.toLowerCase()}" />
			<div class="bar">
				<span class="ok">
					{#if uploading}<Spinner size={12} /> Uploading{:else}<Check
							size={13}
							strokeWidth={2.4}
							aria-hidden="true"
						/> Added{/if}
				</span>
				<button
					type="button"
					class="btn btn-sm btn-secondary on-image"
					onclick={() => input?.click()}
				>
					<RefreshCw /> Replace
				</button>
			</div>
		{:else}
			<svg
				class="guide"
				viewBox="0 0 100 150"
				aria-hidden="true"
				preserveAspectRatio="xMidYMid meet"
			>
				{#if slot === 'fullBody'}
					<g fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round">
						<ellipse cx="50" cy="22" rx="7" ry="8.5" />
						<path
							d="M45 30q-1 4-10 6q-4 2-4 8l-3 26q-1 6 1 10M55 30q1 4 10 6q4 2 4 8l3 26q1 6-1 10"
						/>
						<path
							d="M36 44q4 18 2 34l-2 58M64 44q-4 18-2 34l2 58M50 80l-1 56M38 136h10M52 136h10"
						/>
					</g>
				{:else if slot === 'portrait'}
					<g fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round">
						<ellipse cx="50" cy="62" rx="22" ry="28" />
						<path d="M40 88q-1 10-4 14q-16 4-26 14q-6 8-8 24M60 88q1 10 4 14q16 4 26 14q6 8 8 24" />
					</g>
				{:else}
					<g
						fill="none"
						stroke="currentColor"
						stroke-width=".7"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M36 140v-28q-8-8-14-24q-3-6 2-8q5-1 9 6l5 9V48q0-5 5-5t5 5v30V40q0-5 5-5t5 5v38V44q0-5 5-5t5 5v36V56q0-5 4.5-5T76 56v42q0 18-12 30v12"
						/>
						<path d="M36 124h28" stroke-dasharray="2 2" />
					</g>
				{/if}
			</svg>
			<div class="cta">
				{#if over}
					<p class="drop-hint">Drop to add</p>
				{:else}
					<button type="button" class="btn btn-sm btn-secondary" onclick={() => input?.click()}>
						<Upload /> Choose photo
					</button>
					<button type="button" class="btn btn-sm btn-ghost camera" onclick={() => camera?.click()}>
						<Camera /> Take photo
					</button>
					<p class="or">or drag it here</p>
				{/if}
			</div>
		{/if}
	</div>
	<p class="need">{need}</p>

	<input
		bind:this={input}
		type="file"
		accept="image/*"
		class="visually-hidden"
		tabindex="-1"
		aria-hidden="true"
		onchange={(e) => take(e.currentTarget.files)}
	/>
	<input
		bind:this={camera}
		type="file"
		accept="image/*"
		capture={slot === 'portrait' ? 'user' : 'environment'}
		class="visually-hidden"
		tabindex="-1"
		aria-hidden="true"
		onchange={(e) => take(e.currentTarget.files)}
	/>
</article>

<style>
	.slot {
		display: grid;
		grid-template-rows: auto auto auto;
		gap: var(--space-4);
		min-width: 0;
	}
	header {
		display: grid;
		gap: 4px;
	}
	header .num {
		color: var(--accent);
	}
	h3 {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		line-height: 1.1;
	}
	.why {
		color: var(--text-2);
		font-size: var(--text-sm);
		line-height: 1.5;
		min-height: 3em;
	}
	.drop {
		position: relative;
		display: grid;
		place-items: center;
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		overflow: hidden;
		transition:
			border-color var(--dur-2) var(--ease-out),
			background-color var(--dur-2) var(--ease-out);
	}
	.drop.over {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop.filled {
		border: 0;
		background: var(--plate);
	}
	.drop img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: gm-fade-up var(--dur-3) var(--ease-out);
	}
	.guide {
		position: absolute;
		top: 7%;
		left: 10%;
		width: 80%;
		height: 50%;
		color: var(--text-3);
		opacity: 0.55;
	}
	.cta {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: var(--space-4);
	}
	.or {
		font-size: var(--text-2xs);
		color: var(--text-3);
	}
	.drop-hint {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-lg);
		color: var(--accent);
		padding-bottom: var(--space-6);
	}
	.camera {
		display: none;
	}
	@media (pointer: coarse) {
		.camera {
			display: inline-flex;
		}
		.or {
			display: none;
		}
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-3) var(--space-3);
		background: linear-gradient(transparent, rgb(10 8 6 / 0.7));
	}
	.ok {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs);
		font-weight: 560;
		color: #f3ede3;
	}
	.on-image {
		color: #f3ede3;
		border-color: rgb(243 237 227 / 0.4);
		background: rgb(10 8 6 / 0.3);
		backdrop-filter: blur(6px);
	}
	.on-image:hover {
		background: rgb(10 8 6 / 0.55) !important;
		border-color: rgb(243 237 227 / 0.7) !important;
	}
	.need {
		font-size: var(--text-xs);
		color: var(--text-3);
		line-height: 1.5;
	}
</style>
