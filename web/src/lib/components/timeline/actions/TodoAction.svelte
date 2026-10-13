<script lang="ts">
  // Local Omarchy layer: Move to To do for the selection (managers/todo-manager), or Mark done inside the To do album;
  // B does the same from the keyboard (TimelineKeyboardActions)
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { todoManager } from '$lib/managers/todo-manager.svelte';
  import type { OnArchive } from '$lib/utils/actions';
  import { AssetVisibility } from '@immich/sdk';
  import { IconButton } from '@immich/ui';
  import { mdiClipboardCheckOutline, mdiClipboardTextClockOutline, mdiTimerSand } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    /** the page takes the archived photos out of its view, as after Archive */
    onArchive?: OnArchive;
    menuItem?: boolean;
    /** inside the To do album: Mark done */
    done?: boolean;
  };

  let { onArchive, menuItem = false, done = false }: Props = $props();

  const text = $derived(done ? $t('todo_mark_done') : $t('todo_move'));
  const icon = $derived(done ? mdiClipboardCheckOutline : mdiClipboardTextClockOutline);

  let loading = $state(false);

  const run = async () => {
    if (loading) {
      return;
    }
    const assets = assetMultiSelectManager.getOwnedAssets();
    loading = true;
    try {
      if (done) {
        if (await todoManager.done(assets)) {
          assetMultiSelectManager.clear();
        }
        return;
      }
      const moved = await todoManager.move(assets);
      if (moved) {
        onArchive?.(moved.archived, AssetVisibility.Archive);
        assetMultiSelectManager.clear();
      }
    } finally {
      loading = false;
    }
  };
</script>

{#if menuItem}
  <MenuOption {text} {icon} onClick={run} shortcutLabel="B" />
{:else}
  <IconButton
    shape="round"
    color="secondary"
    variant="ghost"
    aria-label={text}
    icon={loading ? mdiTimerSand : icon}
    onclick={run}
  />
{/if}
