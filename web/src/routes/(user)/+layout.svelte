<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { shortcuts } from '$lib/actions/shortcut';
  import { undoManager } from '$lib/managers/undo-manager.svelte';
  import { isModalOpen } from '@immich/ui';
  import { photoTransition } from '$lib/utils/photo-transition';
  import { onPageKey } from '$lib/utils/page-keys';
  import UploadCover from './DragAndDropUploadOverlay.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { specialAlbums } from '$lib/managers/special-albums.svelte';
  import { onMount, type Snippet } from 'svelte';
  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  // Local Omarchy layer: grid <-> viewer morph (lib/utils/photo-transition.ts)
  onNavigate((navigation) => photoTransition(navigation));

  // Local Omarchy layer: which albums are To do and Villa (managers/special-albums), looked up once per page load, so a
  // special album knows itself even when opened directly (album pages have no sidebar)
  onMount(() => {
    if (authManager.authenticated) {
      for (const special of specialAlbums) {
        void special.ready();
      }
    }
  });

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
</script>

<!-- Local Omarchy layer: Page Up / Page Down page the main view wherever the focus is (lib/utils/page-keys.ts) -->
<svelte:window onkeydown={onPageKey} />
<svelte:document
  use:shortcuts={[
    { shortcut: { key: 'z', ctrl: true }, onShortcut: undoNewest, preventDefault: true },
    { shortcut: { key: 'z', meta: true }, onShortcut: undoNewest, preventDefault: true },
  ]}
/>

<div class:display-none={assetViewerManager.isViewing}>
  {@render children?.()}
</div>
<UploadCover />

<style>
  :root {
    overscroll-behavior: none;
  }
  .display-none {
    display: none;
  }
</style>
