<script lang="ts">
  import { shortcuts } from '#lib/actions/shortcut.ts';
  import InspectorFeed from '#lib/components/inspector/InspectorFeed.svelte';
  import MoveProgress from '#lib/gallery/moves/MoveProgress.svelte';
  import { assetViewerManager } from '#lib/managers/asset-viewer-manager.svelte.ts';
  import { resolveSpecialAlbums } from '#lib/managers/special-albums.svelte.ts';
  import { undoManager } from '#lib/managers/undo-manager.svelte.ts';
  import { onPageKey } from '#lib/utils/page-keys.ts';
  import { flyingTile, viewerStandsOver } from '#lib/utils/viewer-handover.ts';
  import { isModalOpen } from '@immich/ui';
  import { onMount, untrack, type Snippet } from 'svelte';
  import { page } from '$app/state';
  import UploadCover from './DragAndDropUploadOverlay.svelte';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  // Local Omarchy layer: which albums are To do, Villa and QR (managers/special-albums), looked up once per page load, so
  // a special album knows itself even on a page without the sidebar (Room, a photo opened on its own); the sidebar asks
  // too, wherever it is drawn
  onMount(resolveSpecialAlbums);

  // Local Omarchy layer: Ctrl+Z takes back the newest action (managers/undo-manager) on every user page, the album
  // pages without the one bar included, from anywhere but a text field, a dialog or the editor
  const undoNewest = () => {
    if (undoManager.entries.length > 0 && !isModalOpen() && !assetViewerManager.isShowEditor) {
      void undoManager.undo();
    }
  };

  // $page.data.asset is loaded by route specific +page.ts loaders if that
  // route contains the assetId path.
  $effect.pre(() => {
    if (page.data.asset) {
      assetViewerManager.setAsset(page.data.asset);
    } else {
      assetViewerManager.showAssetViewer(false);
    }
    const asset = page.url.searchParams.get('at');
    assetViewerManager.gridScrollTarget = { at: asset };
  });

  // Local Omarchy layer: the page goes once the viewer stands over it, not as the route opens the photo: a photo flying
  // out of its tile (Gallery's viewer zoom) crossed an empty page until the viewer had mounted (utils/viewer-handover).
  // It is hidden, not taken out of the layout (was display: none): brought back, the whole page was laid out again, and
  // every box watching its size answered one by one, each laying the page out once more (the tag filter's rows), so
  // closing a photo froze the page for most of a second (the owner, 2026-11-18: "really slow and unresponsive to click
  // the back arrow")
  let pageHidden = $state(false);
  $effect(() => {
    if (!assetViewerManager.isViewing) {
      pageHidden = false;
      return;
    }
    const tile = untrack(() => flyingTile(assetViewerManager.asset?.id));
    if (!tile) {
      pageHidden = true;
      return;
    }
    tile.style.visibility = 'hidden';
    let cancelled = false;
    void viewerStandsOver().then(() => {
      if (!cancelled) {
        pageHidden = true;
        tile.style.visibility = '';
      }
    });
    return () => {
      cancelled = true;
      tile.style.visibility = '';
    };
  });
</script>

<!-- Local Omarchy layer: Page Up / Page Down page the main view wherever the focus is (lib/utils/page-keys.ts) -->
<svelte:window onkeydown={onPageKey} />
<svelte:document
  use:shortcuts={[
    { shortcut: { key: 'z', ctrl: true }, onShortcut: undoNewest, preventDefault: true },
    { shortcut: { key: 'z', meta: true }, onShortcut: undoNewest, preventDefault: true },
  ]}
/>

<div class:page-under-viewer={pageHidden}>
  {@render children?.()}
</div>
<UploadCover />
<!-- Local Omarchy layer: tells an open inspector window what is pointed at, selected or open; Shift+I opens it -->
<InspectorFeed />
<!-- Local Omarchy layer: a move between Kioku's libraries, on every page while it runs (gallery/moves) -->
<MoveProgress />

<style>
  :root {
    overscroll-behavior: none;
  }
  .page-under-viewer {
    visibility: hidden;
  }
</style>
