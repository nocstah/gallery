<script lang="ts">
  // Local Omarchy layer: New album, a drop zone at the sidebar's foot that is there only while photos are carried
  // (managers/sidebar-drop). Photos dropped on it become an album named by where and when they were taken
  // (services/sidebar-drop). It stays at the foot of the sidebar's view however far the tree is scrolled, a dashed
  // hairline like Import's drop zone, and lights like every row that takes photos.
  import { dropTarget, sidebarDrop } from '$lib/managers/sidebar-drop.svelte';
  import { sidebarModeStore } from '$lib/stores/sidebar-mode.svelte';
  import { Icon } from '@immich/ui';
  import { mdiImagePlusOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  const collapsed = $derived(sidebarModeStore.layout === 'rail' && !sidebarModeStore.railExpanded);
</script>

{#if sidebarDrop.carrying && !collapsed}
  <div class="ws-drop-dock" data-testid="sidebar-new-album">
    <div class="ws-drop-new" use:dropTarget={{ kind: 'new-album' }} aria-hidden="true">
      <Icon icon={mdiImagePlusOutline} size="1.25em" aria-hidden={true} />
      <span>{$t('sidebar_new_album')}</span>
    </div>
  </div>
{/if}
