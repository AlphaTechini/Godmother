<script lang="ts">
	let { size = 14, label }: { size?: number; label?: string } = $props();
</script>

<span
	class="spinner"
	style:--s="{size}px"
	role={label ? 'status' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
></span>

<style>
	.spinner {
		display: inline-block;
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		border: 1.5px solid color-mix(in srgb, var(--accent) 25%, transparent);
		border-top-color: var(--accent);
		animation: gm-spin 0.9s linear infinite;
		flex: none;
	}
</style>
