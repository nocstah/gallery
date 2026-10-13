<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { photoTransition } from '$lib/utils/photo-transition';
  import UploadCover from './DragAndDropUploadOverlay.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { todoManager } from '$lib/managers/todo-manager.svelte';
  import { onMount, type Snippet } from 'svelte';
  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  // Local Omarchy layer: grid <-> viewer morph (lib/utils/photo-transition.ts)
  onNavigate((navigation) => photoTransition(navigation));

  // Local Omarchy layer: which album is To do (managers/todo-manager), looked up once per page load, so the To do album
  // knows itself even when opened directly (album pages have no sidebar)
  onMount(() => {
    if (authManager.authenticated) {
      void todoManager.ready();
    }
  });

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
