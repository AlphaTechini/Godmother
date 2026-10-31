<script lang="ts">
	import { onMount } from 'svelte';
	import Wordmark from '#lib/components/ui/Wordmark.svelte';
	import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
	import {
		claimGuestSessions,
		getAuthState,
		listSavedSessions,
		requestPasswordReset,
		signIn,
		signOut,
		signUp,
		type AuthState,
		type SavedSession
	} from '#lib/client/account';

	type Mode = 'signin' | 'signup' | 'forgot';

	let auth = $state<AuthState | null>(null);
	let mode = $state<Mode>('signin');
	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let failure = $state('');
	let notice = $state('');
	let sessions = $state<SavedSession[] | null>(null);
	let listFailure = $state('');

	async function loadSessions() {
		listFailure = '';
		try {
			await claimGuestSessions();
			sessions = await listSavedSessions();
		} catch (e) {
			listFailure = e instanceof Error ? e.message : String(e);
		}
	}

	onMount(async () => {
		auth = await getAuthState();
		if (auth.user) await loadSessions();
	});

	function switchMode(next: Mode) {
		mode = next;
		failure = '';
		notice = '';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		failure = '';
		notice = '';
		try {
			if (mode === 'forgot') {
				await requestPasswordReset(email);
				notice = 'If that email has an account, a reset link is on its way.';
			} else {
				await (mode === 'signup' ? signUp : signIn)(email, password);
				password = '';
				auth = await getAuthState();
				await loadSessions();
			}
		} catch (e) {
			failure = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function leave() {
		await signOut();
		auth = await getAuthState();
		sessions = null;
		switchMode('signin');
	}

	const when = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
</script>

<svelte:head><title>Your account · Godmother</title></svelte:head>

<div class="page">
	<nav class="nav" aria-label="Main">
		<Wordmark href="/" size={21} />
		<ThemeToggle />
	</nav>

	<main class="panel">
		{#if !auth}
			<p class="muted" aria-live="polite">Checking your account…</p>
		{:else if !auth.accounts}
			<h1 class="display">Guest only</h1>
			<p class="muted">
				Accounts aren’t set up on this server. You can still use Godmother as a guest.
			</p>
			<a class="btn btn-primary" href="/">Back to Godmother</a>
		{:else if auth.user}
			<h1 class="display">Your evenings</h1>
			<p class="muted">Signed in as {auth.user.email}</p>

			{#if listFailure}
				<p class="failure" role="alert">{listFailure}</p>
			{:else if !sessions}
				<p class="muted" aria-live="polite">Loading your sessions…</p>
			{:else if sessions.length === 0}
				<p class="muted">No saved sessions yet. New sessions will appear here.</p>
			{:else}
				<ul class="list">
					{#each sessions as s (s.id)}
						<li>
							<a href={`/studio/${s.id}`}>
								<span class="name">{s.title ?? 'New evening'}</span>
								<span class="meta">{when(s.updatedAt)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="row">
				<a class="btn btn-primary" href="/">Back to Godmother</a>
				<button class="btn btn-secondary" type="button" onclick={leave}>Sign out</button>
			</div>
		{:else}
			<h1 class="display">
				{mode === 'signup'
					? 'Create your account'
					: mode === 'forgot'
						? 'Reset your password'
						: 'Welcome back'}
			</h1>
			<p class="muted">
				{mode === 'forgot'
					? 'We’ll email you a link to choose a new password.'
					: 'Your sessions and photos stay with your account. Guest sessions from this browser move in when you sign in.'}
			</p>

			<form onsubmit={submit}>
				<label>
					Email
					<input type="email" autocomplete="email" required bind:value={email} />
				</label>
				{#if mode !== 'forgot'}
					<label>
						Password
						<input
							type="password"
							autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
							minlength={mode === 'signup' ? 10 : undefined}
							required
							bind:value={password}
						/>
						{#if mode === 'signup'}<span class="hint">At least 10 characters.</span>{/if}
					</label>
				{/if}

				{#if failure}<p class="failure" role="alert">{failure}</p>{/if}
				{#if notice}<p class="notice" role="status">{notice}</p>{/if}

				<button class="btn btn-primary" type="submit" disabled={busy}>
					{busy
						? 'One moment…'
						: mode === 'signup'
							? 'Create account'
							: mode === 'forgot'
								? 'Send reset link'
								: 'Sign in'}
				</button>
			</form>

			<div class="switch">
				{#if mode === 'signin'}
					<button type="button" onclick={() => switchMode('signup')}>Create an account</button>
					{#if auth.passwordReset}
						<button type="button" onclick={() => switchMode('forgot')}>Forgot your password?</button
						>
					{/if}
				{:else}
					<button type="button" onclick={() => switchMode('signin')}>Back to sign in</button>
				{/if}
				<a href="/">Continue as a guest</a>
			</div>
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
	.notice {
		margin: 0;
		color: var(--text);
		font-size: var(--text-sm);
	}
	.switch {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		font-size: var(--text-sm);
	}
	.switch button,
	.switch a {
		padding: 0;
		color: var(--accent);
		background: none;
		border: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.list {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--line);
	}
	.list a {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) 0;
		color: var(--text);
		text-decoration: none;
		border-bottom: 1px solid var(--line);
	}
	.list a:hover .name {
		color: var(--accent);
	}
	.meta {
		flex: none;
		color: var(--text-3);
		font-size: var(--text-sm);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
