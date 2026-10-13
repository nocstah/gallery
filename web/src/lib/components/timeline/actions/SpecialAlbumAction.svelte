<script lang="ts">
  // Local Omarchy layer: Move to a special album (To do, Villa: managers/special-albums) for the selection, or take the
  // selection out inside that album (Mark done); the album's key does the same from the keyboard (TimelineKeyboardActions)
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import type { SpecialAlbumManager } from '$lib/managers/special-albums.svelte';
  import type { OnArchive } from '$lib/utils/actions';
  import { AssetVisibility } from '@immich/sdk';
  import { IconButton } from '@immich/ui';
  import { mdiTimerSand } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    special: SpecialAlbumManager;
    /** the page takes the archived photos out of its view, as after Archive */
    onArchive?: OnArchive;
    menuItem?: boolean;
    /** inside the album: take the photos out */
    done?: boolean;
  };

  let { special, onArchive, menuItem = false, done = false }: Props = $props();

  const text = $derived($t(done ? special.words.done : special.words.move));
  const icon = $derived(done ? special.doneIcon : special.icon);

  let loading = $state(false);

  const run = async () => {
    if (loading) {
      return;
    }
    const assets = assetMultiSelectManager.getOwnedAssets();
    loading = true;
    try {
      if (done) {
        if (await special.done(assets)) {
          assetMultiSelectManager.clear();
        }
        return;
      }
      const moved = await special.move(assets);
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
  <MenuOption {text} {icon} onClick={run} shortcutLabel={special.shortcut.toUpperCase()} />
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
