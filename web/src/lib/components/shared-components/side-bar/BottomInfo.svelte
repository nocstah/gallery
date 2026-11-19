<script lang="ts">
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { featureFlagsManager } from '#lib/managers/feature-flags-manager.svelte.ts';
  import { Route } from '#lib/route.ts';
  import { hideBackupsReminder } from '#lib/stores/preferences.store.ts';
  import { ImmichBackupsSidebarItem } from '@futo-org/backups-orchestrator-ui';
  import ServerStatus from './ServerStatus.svelte';
  import StorageSpace from './StorageSpace.svelte';
</script>

<!-- Local Omarchy layer: no inset or rounding of its own; the storage line runs to the sidebar's edges (DESIGN.md) -->
<div class="mt-auto">
  <StorageSpace />

  {#if authManager.user.isAdmin && featureFlagsManager.value.backups && !$hideBackupsReminder}
    <ImmichBackupsSidebarItem href={Route.backups()} />
  {/if}
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
