<script lang="ts">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Square from '@lucide/svelte/icons/square';
	import X from '@lucide/svelte/icons/x';
	import Ticket from '@lucide/svelte/icons/ticket';
	import Shirt from '@lucide/svelte/icons/shirt';
	import PersonStanding from '@lucide/svelte/icons/person-standing';
	import ScanFace from '@lucide/svelte/icons/scan-face';
	import Hand from '@lucide/svelte/icons/hand';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { getStudio } from '#lib/client/studio.svelte';
	import { PURPOSE_LABEL } from '#lib/client/format';
	import type { Asset, AttachmentPurpose } from '#lib/types';

	const studio = getStudio();
	const client = $derived(studio.client);

	interface Pending {
		key: string;
		purpose: AttachmentPurpose;
		name: string;
		preview: string;
		asset?: Asset;
		failed?: boolean;
	}

	let pending: Pending[] = $state([]);
	let menuOpen = $state(false);
	let textarea: HTMLTextAreaElement | undefined = $state();
	let fileInput: HTMLInputElement | undefined = $state();
	let chosenPurpose: AttachmentPurpose = $state('invitation');
	let root: HTMLElement | undefined = $state();
	const menuId = $props.id();

	const PURPOSES: {
		purpose: AttachmentPurpose;
		label: string;
		hint: string;
		icon: typeof Ticket;
	}[] = [
		{
			purpose: 'invitation',
			label: 'Invitation',
			hint: 'Photo or PDF, read for you',
			icon: Ticket
		},
		{ purpose: 'wardrobe', label: 'My clothes', hint: 'Pieces you own and may wear', icon: Shirt },
		{
			purpose: 'fullBody',
			label: 'Full-body photo',
			hint: 'For clothes and shoes',
			icon: PersonStanding
		},
		{ purpose: 'portrait', label: 'Portrait', hint: 'For makeup, hair, earrings', icon: ScanFace },
		{ purpose: 'hand', label: 'Hand photo', hint: 'For watch, ring, bracelet', icon: Hand }
	];

	const uploading = $derived(pending.some((p) => !p.asset && !p.failed));
	const canSend = $derived(
		!client.streaming &&
			!uploading &&
			(studio.draft.trim().length > 0 || pending.some((p) => p.asset))
	);

	studio.focusComposer = () => textarea?.focus();
	studio.attach = (purpose) => pick(purpose);

	function pick(purpose: AttachmentPurpose) {
		chosenPurpose = purpose;
		menuOpen = false;
		if (fileInput) {
			fileInput.accept = purpose === 'invitation' ? 'image/*,application/pdf' : 'image/*';
			fileInput.click();
		}
	}

	async function onFiles(files: FileList | null) {
		if (!files?.length) return;
		const purpose = chosenPurpose;
		for (const file of Array.from(files)) {
			const item: Pending = {
				key: `${Date.now()}-${file.name}`,
				purpose,
				name: file.name,
				preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
			};
			pending.push(item);
			const i = pending.length - 1;
			try {
				const asset = await client.upload(file, purpose);
				const target = pending.find((p) => p.key === item.key);
				if (target) target.asset = asset;
			} catch {
				const target = pending[i];
				if (target && target.key === item.key) target.failed = true;
			}
		}
		if (fileInput) fileInput.value = '';
		textarea?.focus();
	}

	function remove(key: string) {
		pending = pending.filter((p) => p.key !== key);
	}

	async function submit() {
		if (!canSend) return;
		const text = studio.draft;
		const attachments = pending
			.filter((p) => p.asset)
			.map((p) => ({ assetId: p.asset!.id, purpose: p.purpose }));
		studio.draft = '';
		pending = [];
		studio.pinned = null;
		await client.send({ text, attachments });
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			submit();
		}
	}

	function onWindowClick(e: MouseEvent) {
		if (menuOpen && root && !root.contains(e.target as Node)) menuOpen = false;
	}
</script>

<svelte:window onclick={onWindowClick} />

<form
	class="composer"
	bind:this={root}
	onsubmit={(e) => {
		e.preventDefault();
		submit();
	}}
>
	{#if pending.length}
		<ul class="chips" aria-label="Attachments">
			{#each pending as p (p.key)}
				<li class="chip" class:failed={p.failed}>
					<span class="thumb">
						{#if p.preview}<img src={p.preview} alt="" />{/if}
						{#if !p.asset && !p.failed}<span class="busy"><Spinner size={12} /></span>{/if}
					</span>
					<span class="meta">
						<span class="purpose">{PURPOSE_LABEL[p.purpose]}</span>
						<span class="name">{p.failed ? 'Upload failed' : p.asset ? p.name : 'Uploading…'}</span>
					</span>
					<button
						type="button"
						class="remove"
						onclick={() => remove(p.key)}
						aria-label="Remove {p.name}"
					>
						<X size={13} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="field">
		<label for="{menuId}-text" class="visually-hidden">Message Godmother</label>
		<textarea
			id="{menuId}-text"
			bind:this={textarea}
			bind:value={studio.draft}
			onkeydown={onKeydown}
			rows="1"
			placeholder={client.session.stage === 'event'
				? 'The event’s name or link, or describe it…'
				: 'Reply, or tell Godmother what to change…'}></textarea>

		<div class="actions">
			<div class="attach">
				<button
					type="button"
					class="btn btn-ghost btn-icon btn-sm"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-controls="{menuId}-menu"
					aria-label="Attach a file"
					title="Attach"
					onclick={() => (menuOpen = !menuOpen)}
				>
					<Paperclip strokeWidth={1.7} />
				</button>
				{#if menuOpen}
					<div class="menu" id="{menuId}-menu" role="menu" aria-label="What are you attaching?">
						<p class="eyebrow">What are you attaching?</p>
						{#each PURPOSES as item (item.purpose)}
							{@const Icon = item.icon}
							<button type="button" role="menuitem" onclick={() => pick(item.purpose)}>
								<Icon size={17} strokeWidth={1.5} aria-hidden="true" />
								<span><b>{item.label}</b><small>{item.hint}</small></span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<span class="hint" aria-hidden="true"
				><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line</span
			>
			{#if client.streaming}
				<button type="button" class="send stop" onclick={() => client.stop()} aria-label="Stop">
					<Square size={12} fill="currentColor" />
				</button>
			{:else}
				<button type="submit" class="send" disabled={!canSend} aria-label="Send">
					<ArrowUp size={17} strokeWidth={2} />
				</button>
			{/if}
		</div>
	</div>

	<input
		bind:this={fileInput}
		type="file"
		class="visually-hidden"
		tabindex="-1"
		aria-hidden="true"
		multiple
		onchange={(e) => onFiles(e.currentTarget.files)}
	/>
</form>

<style>
	.composer {
		position: relative;
		display: grid;
		gap: var(--space-2);
	}
	.field {
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-md);
		background: var(--surface);
		transition:
			border-color var(--dur-2) var(--ease-out),
			box-shadow var(--dur-2) var(--ease-out);
	}
	.field:focus-within {
		border-color: var(--accent-line);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}
	textarea {
		display: block;
		width: 100%;
		min-height: 52px;
		max-height: 200px;
		padding: 14px 16px 4px;
		border: 0;
		background: transparent;
		resize: none;
		field-sizing: content;
		font-size: var(--text-base);
		line-height: 1.5;
		outline: none;
	}
	textarea::placeholder {
		color: var(--text-3);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 4px 8px 8px 6px;
	}
	.hint {
		margin-left: auto;
		font-size: var(--text-2xs);
		color: var(--text-3);
	}
	kbd {
		font-family: inherit;
		font-size: inherit;
		color: var(--text-2);
	}
	.send {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-sm);
		background: var(--primary);
		color: var(--on-primary);
		transition:
			opacity var(--dur-2) var(--ease-out),
			transform var(--dur-1) var(--ease-out);
	}
	.send:disabled {
		background: var(--surface-3);
		color: var(--text-3);
	}
	.send:active:not(:disabled) {
		transform: scale(0.94);
	}
	.stop {
		background: var(--surface-3);
		color: var(--text);
	}
	.attach {
		position: relative;
	}
	.menu {
		position: absolute;
		left: -6px;
		bottom: calc(100% + 10px);
		width: 280px;
		padding: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-3);
		z-index: 30;
		animation: gm-fade-up var(--dur-2) var(--ease-out);
	}
	.menu .eyebrow {
		padding: 6px 10px 8px;
	}
	.menu button {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		text-align: left;
		color: var(--text-2);
	}
	.menu button:hover,
	.menu button:focus-visible {
		background: var(--surface-2);
		color: var(--text);
	}
	.menu b {
		display: block;
		font-weight: 560;
		font-size: var(--text-sm);
		color: var(--text);
	}
	.menu small {
		display: block;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 5px 6px 5px 5px;
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--surface);
		max-width: 240px;
		animation: gm-fade-up var(--dur-2) var(--ease-out);
	}
	.chip.failed {
		border-color: var(--danger);
	}
	.thumb {
		position: relative;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-xs);
		overflow: hidden;
		background: var(--surface-3);
		flex: none;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.busy {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: var(--scrim);
	}
	.meta {
		min-width: 0;
		display: grid;
	}
	.purpose {
		font-size: var(--text-3xs);
		font-weight: 650;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--accent);
	}
	.name {
		font-size: var(--text-xs);
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.failed .name {
		color: var(--danger);
	}
	.remove {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-xs);
		color: var(--text-3);
		flex: none;
	}
	.remove:hover {
		color: var(--text);
		background: var(--surface-2);
	}
	@media (max-width: 720px) {
		.hint {
			display: none;
		}
		.send {
			margin-left: auto;
		}
	}
</style>
