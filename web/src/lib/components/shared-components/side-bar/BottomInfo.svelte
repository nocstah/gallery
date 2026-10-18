<script lang="ts">
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import ServerStatus from './ServerStatus.svelte';
  import StorageSpace from './StorageSpace.svelte';
</script>

<div class="mt-auto">
  <StorageSpace />
</div>

<!-- Local Omarchy layer: no PurchaseInfo. Nothing is for sale in this fork's build, and its button ("Support Noodle
     Gallery", a Discord link) would have come up at the foot of every account's sidebar 14 days after the account was
     made (the owner's on 2026-10-23) -->

<!-- Local Omarchy layer: the server's state and version are the owner's to watch ("Owner tools only for me"); a family
     account's sidebar ends with its storage -->
{#if authManager.authenticated && authManager.user.isAdmin}
  <div class="mt-2 mb-6">
    <ServerStatus />
  </div>
{/if}
