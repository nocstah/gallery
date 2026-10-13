<script lang="ts">
  // Local Omarchy layer: Move to a special album (To do, Villa: managers/special-albums) from the viewer, or take a photo
  // in it out again (Mark done); the album's key does the same. When the photo leaves the page's view (Photos once it is
  // archived, Archive once it is back in Photos) the viewer moves on to the next one first, as Archive does; in the
  // album itself the album page does that.
  import { shortcut } from '$lib/actions/shortcut';
  import type { OnAction, PreAction } from '$lib/components/asset-viewer/actions/action';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { AssetAction } from '$lib/constants';
  import type { SpecialAlbumManager } from '$lib/managers/special-albums.svelte';
  import { refreshAssets } from '$lib/utils/asset-refresh';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetVisibility, type AlbumResponseDto, type AssetResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  interface Props {
    special: SpecialAlbumManager;
    asset: AssetResponseDto;
    album?: AlbumResponseDto;
    onAction: OnAction;
    preAction: PreAction;
  }

  let { special, asset, album, onAction, preAction }: Props = $props();

  const inAlbum = $derived(special.isAlbum(album?.id));
  const inside = $derived(inAlbum || (asset.tags ?? []).some((tag) => tag.value === special.name));

  let busy = false;

  const takeOut = async () => {
    const target = { id: asset.id, visibility: asset.visibility, ownerId: asset.ownerId };
    if (inAlbum) {
      await special.done([target]);
      return;
    }
    const returning = await special.wouldReturn(target);
    if (returning) {
      preAction({ type: AssetAction.UNARCHIVE, asset: toTimelineAsset(asset) });
    }
    const result = await special.done([target]);
    if (result && returning) {
      onAction({
        type: AssetAction.UNARCHIVE,
        asset: { ...toTimelineAsset(asset), visibility: AssetVisibility.Timeline },
      });
    }
  };

  const move = async () => {
    const leaving = asset.visibility === AssetVisibility.Timeline;
    if (leaving) {
      preAction({ type: AssetAction.ARCHIVE, asset: toTimelineAsset(asset) });
    }
    const moved = await special.move([{ id: asset.id, visibility: asset.visibility, ownerId: asset.ownerId }]);
    if (moved && leaving) {
      onAction({
        type: AssetAction.ARCHIVE,
        asset: { ...toTimelineAsset(asset), visibility: AssetVisibility.Archive },
      });
    }
  };

  const run = async () => {
    if (busy) {
      return;
    }
    busy = true;
    const id = asset.id;
    try {
      await (inside ? takeOut() : move());
      // the viewer's own copy (its tags, so the menu flips between Move and the way out)
      await refreshAssets([id]);
    } finally {
      busy = false;
    }
  };
</script>

<svelte:document use:shortcut={{ shortcut: { key: special.shortcut }, onShortcut: run }} />

<MenuOption
  icon={inside ? special.doneIcon : special.icon}
  text={$t(inside ? special.words.done : special.words.move)}
  onClick={run}
  shortcutLabel={special.shortcut.toUpperCase()}
/>
