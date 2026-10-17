<script lang="ts">
  // Local Omarchy layer: the inspector window (lib/components/inspector/Inspector.svelte); ?asset= shows one photo
  // before any main window says anything, ?from= names the main window that opened it
  import { page } from '$app/state';
  import Inspector from '$lib/components/inspector/Inspector.svelte';
</script>

<Inspector
  assetId={page.url.searchParams.get('asset') ?? undefined}
  openerSource={page.url.searchParams.get('from') ?? undefined}
/>
