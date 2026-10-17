<script lang="ts">
  // Local Omarchy layer: the main window's side of the inspector (managers/inspector-link). Started by the user pages'
  // layout for a signed-in account (a shared link's visitor has no inspector): it answers inspectors, tells them what
  // the viewer shows and what is selected (the photo under the pointer comes from the tiles themselves, Thumbnail),
  // goes where an inspector asks, and Shift+I opens the inspector or closes it. While no inspector listens, the
  // viewer and the selection are not even watched.
  import { goto } from '$app/navigation';
  import { shortcut } from '$lib/actions/shortcut';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { inspectorFeed, subjectOfAsset, subjectOfTimelineAsset } from '$lib/managers/inspector-link.svelte';
  import { untrack } from 'svelte';

  const offered = $derived(authManager.authenticated && !authManager.isSharedLink);

  // on while a signed-in account is on its own pages (a sign-out, or a shared link opened in the same tab, stops it)
  $effect(() => {
    if (!offered) {
      return;
    }
    untrack(() =>
      inspectorFeed.start({
        viewer: () =>
          assetViewerManager.isViewing && assetViewerManager.asset
            ? subjectOfAsset(assetViewerManager.asset)
            : undefined,
        selection: () => {
          const assets = assetMultiSelectManager.assets;
          const last = assets.at(-1);
          return last ? { subject: subjectOfTimelineAsset(last), count: assets.length } : undefined;
        },
        navigate: (url) => void goto(url),
      }),
    );
    return () => inspectorFeed.stop();
  });

  $effect(() => {
    if (!inspectorFeed.listening) {
      return;
    }
    // what an inspector shows changes with these (read here only to follow them)
    void assetViewerManager.isViewing;
    void assetViewerManager.asset?.id;
    const assets = assetMultiSelectManager.assets;
    void assets.length;
    void assets.at(-1)?.id;
    untrack(() => inspectorFeed.changed());
  });
</script>

<svelte:document
  use:shortcut={{
    shortcut: { key: 'i', shift: true },
    onShortcut: () => {
      if (offered) {
        inspectorFeed.toggle();
      }
    },
  }}
/>
