<script lang="ts">
  // Local Omarchy layer: Move to To do from the viewer, or Mark done for a photo in To do (managers/todo-manager); B
  // does the same. When the photo leaves the page's view (Photos once it is archived, Archive once it is back in
  // Photos) the viewer moves on to the next one first, as Archive does; in the To do album the album page does that.
  import { shortcut } from '$lib/actions/shortcut';
  import type { OnAction, PreAction } from '$lib/components/asset-viewer/actions/action';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import { AssetAction } from '$lib/constants';
  import { TODO_NAME, todoManager } from '$lib/managers/todo-manager.svelte';
  import { refreshAssets } from '$lib/utils/asset-refresh';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetVisibility, type AlbumResponseDto, type AssetResponseDto } from '@immich/sdk';
  import { mdiClipboardCheckOutline, mdiClipboardTextClockOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    album?: AlbumResponseDto;
    onAction: OnAction;
    preAction: PreAction;
  }

  let { asset, album, onAction, preAction }: Props = $props();

  const inTodoAlbum = $derived(todoManager.isTodo(album?.id));
  const inTodo = $derived(inTodoAlbum || (asset.tags ?? []).some((tag) => tag.value === TODO_NAME));

  let busy = false;

  const markDone = async () => {
    const target = { id: asset.id, visibility: asset.visibility, ownerId: asset.ownerId };
    if (inTodoAlbum) {
      await todoManager.done([target]);
      return;
    }
    const returning = await todoManager.wouldReturn(target);
    if (returning) {
      preAction({ type: AssetAction.UNARCHIVE, asset: toTimelineAsset(asset) });
    }
    const result = await todoManager.done([target]);
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
    const moved = await todoManager.move([{ id: asset.id, visibility: asset.visibility, ownerId: asset.ownerId }]);
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
      await (inTodo ? markDone() : move());
      // the viewer's own copy (its tags, so the menu flips between Move and Mark done)
      await refreshAssets([id]);
    } finally {
      busy = false;
    }
  };
</script>

<svelte:document use:shortcut={{ shortcut: { key: 'b' }, onShortcut: run }} />

<MenuOption
  icon={inTodo ? mdiClipboardCheckOutline : mdiClipboardTextClockOutline}
  text={inTodo ? $t('todo_mark_done') : $t('todo_move')}
  onClick={run}
  shortcutLabel="B"
/>
