<script lang="ts">
  import SidebarNavItem from '#lib/components/sidebar/sidebar-nav-item.svelte';
  import { VAULT_CHOOSER_URI, canLaunchVaultChooser } from '#lib/gallery/vaults/launcher.ts';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { mdiSafeSquareOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';

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
