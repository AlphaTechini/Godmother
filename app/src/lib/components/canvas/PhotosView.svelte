<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import SectionHead from './SectionHead.svelte';
	import PhotoSlot from './PhotoSlot.svelte';
	import { getStudio } from '#lib/client/studio.svelte';
	import { PHOTO_SLOTS } from '#lib/client/format';
	import type { PhotoSlot as Slot } from '#lib/types';

	const studio = getStudio();
	const client = $derived(studio.client);
	const photos = $derived(client.session.photos);
	const filled = $derived(PHOTO_SLOTS.filter((s) => photos[s.slot]).length);
	/** Uploaded on this canvas but not yet sent to the agent. */
	let unsent: Slot[] = $state([]);
	const ready = $derived(
		unsent.length > 0 &&
			unsent.every((s) => photos[s] && !photos[s]!.id.startsWith('local-') && !client.uploading[s])
	);

	async function onfile(slot: Slot, file: File) {
		try {
			await client.upload(file, slot);
			if (!unsent.includes(slot)) unsent.push(slot);
		} catch {
			/* client.error is shown in the conversation */
		}
	}

	async function sendPhotos() {
		const attachments = unsent
			.filter((s) => photos[s])
			.map((s) => ({ assetId: photos[s]!.id, purpose: s }));
		unsent = [];
		studio.tab = 'chat';
		await client.send({
			text: attachments.length === 3 ? 'Here are my three photos.' : 'Here are my photos.',
			attachments
		});
	}
</script>

<article>
	<SectionHead
		index="02"
		eyebrow="Photos of you"
		title="Three photos, three canvases."
		lede="YouCam needs a different photo for each part of the look. Godmother only ever tries things on you, never on a model."
	>
		{#snippet aside()}
			<p class="count"><span class="num">{filled}</span><span>/3</span></p>
		{/snippet}
	</SectionHead>

	<div class="grid">
		{#each PHOTO_SLOTS as s, i (s.slot)}
			<PhotoSlot
				slot={s.slot}
				index={i + 1}
				title={s.title}
				why={s.why}
				need={s.need}
				ratio={s.ratio}
				photo={photos[s.slot]}
				uploading={!!client.uploading[s.slot]}
				onfile={(f) => onfile(s.slot, f)}
			/>
		{/each}
	</div>

	{#if unsent.length}
		<div class="send" class:ready>
			<p>
				{unsent.length === 1 ? 'One new photo' : `${unsent.length} new photos`} ready for Godmother.
				<span class="muted">Your photos are only used to render your looks.</span>
			</p>
			<button
				type="button"
				class="btn btn-primary"
				disabled={!ready || client.streaming}
				onclick={sendPhotos}
			>
				Send to Godmother <ArrowRight />
			</button>
		</div>
	{:else}
		<p class="privacy">Photos are stored with this session only and used to render your looks.</p>
	{/if}
</article>

<style>
	article {
		max-width: 1080px;
	}
	.count {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		line-height: 1;
	}
	.count span:last-child {
		color: var(--text-3);
		font-size: 0.5em;
	}
	.grid {
		display: grid;
		grid-template-columns: 1.05fr 1fr 1fr;
		gap: var(--space-6);
		align-items: start;
	}
	.send {
		position: sticky;
		bottom: var(--space-4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-top: var(--space-7);
		padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		backdrop-filter: blur(12px);
		box-shadow: var(--shadow-2);
		font-size: var(--text-sm);
		animation: gm-fade-up var(--dur-3) var(--ease-out);
	}
	.send .muted {
		display: block;
		font-size: var(--text-xs);
	}
	.privacy {
		margin-top: var(--space-7);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	@media (max-width: 760px) {
		.grid {
			grid-template-columns: 1fr;
			gap: var(--space-8);
		}
	}
</style>
