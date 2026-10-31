<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Wordmark from '#lib/components/ui/Wordmark.svelte';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import { getAuthState, setNewPassword } from '#lib/client/account';

	const token = $derived(page.url.searchParams.get('token') ?? '');
	let password = $state('');
	let busy = $state(false);
	let failure = $state('');
	let done = $state(false);

	// Gives this browser its id before the form is sent.
	onMount(() => void getAuthState());

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		failure = '';
		try {
			await setNewPassword(token, password);
			done = true;
		} catch (e) {
			failure = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Choose a new password · Godmother</title>
	<!-- The link carries a one-time token, so it must not leak to other sites. -->
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="page">
	<nav class="nav" aria-label="Main">
		<Wordmark href="/" size={21} />
		<ThemeToggle />
	</nav>

	<main class="panel">
		<h1 class="display">Choose a new password</h1>
		{#if done}
			<p class="muted" role="status">Your password is changed, and you’re signed out everywhere.</p>
			<a class="btn btn-primary" href="/account">Sign in</a>
		{:else if !token}
			<p class="failure" role="alert">
				This link is incomplete. Ask for a new one from the sign-in page.
			</p>
			<a class="btn btn-secondary" href="/account">Back to sign in</a>
		{:else}
			<form onsubmit={submit}>
				<label>
					New password
					<input
						type="password"
						autocomplete="new-password"
						minlength="10"
						required
						bind:value={password}
					/>
					<span class="hint">At least 10 characters.</span>
				</label>
				{#if failure}<p class="failure" role="alert">{failure}</p>{/if}
				<button class="btn btn-primary" type="submit" disabled={busy}>
					{busy ? 'One moment…' : 'Save new password'}
				</button>
			</form>
		{/if}
	</main>
</div>

<style>
	.page {
		min-height: 100dvh;
		padding: var(--space-5) var(--gutter) var(--space-9);
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.panel {
		display: grid;
		gap: var(--space-4);
		max-width: 440px;
		margin: var(--space-9) auto 0;
	}
	h1 {
		margin: 0;
		font-size: var(--text-xl);
		line-height: 1.15;
	}
	.muted {
		margin: 0;
		color: var(--text-2);
	}
	form {
		display: grid;
		gap: var(--space-4);
	}
	label {
		display: grid;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	input {
		padding: var(--space-3);
		font-size: var(--text-base);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
	}
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.hint {
		color: var(--text-3);
	}
	.failure {
		margin: 0;
		color: var(--danger);
		font-size: var(--text-sm);
	}
</style>
