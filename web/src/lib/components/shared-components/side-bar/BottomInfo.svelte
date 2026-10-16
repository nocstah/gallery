<script lang="ts">
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import PurchaseInfo from './PurchaseInfo.svelte';
  import ServerStatus from './ServerStatus.svelte';
  import StorageSpace from './StorageSpace.svelte';
</script>

<div class="mt-auto">
  <StorageSpace />
</div>

<PurchaseInfo />

<!-- Local Omarchy layer: the server's state and version are the owner's to watch ("Owner tools only for me"); a family
     account's sidebar ends with its storage -->
{#if authManager.authenticated && authManager.user.isAdmin}
  <div class="mt-2 mb-6">
    <ServerStatus />
  </div>
{/if}
