<script lang="ts">
  import { page } from '$app/state';
  import SidebarNavItem from '$lib/components/sidebar/sidebar-nav-item.svelte';
  import { canLaunchVaultChooser, VAULT_CHOOSER_URI } from '$lib/gallery/vaults/launcher';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { mdiSafeSquareOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let userAgent = $state('');
  onMount(() => {
    userAgent = navigator.userAgent;
  });
  const available = $derived(
    canLaunchVaultChooser(page.url, userAgent, authManager.authenticated && authManager.user.isAdmin),
  );
</script>

{#if available}
  <SidebarNavItem title={$t('photo_vaults')} href={VAULT_CHOOSER_URI} icon={mdiSafeSquareOutline} />
{/if}
