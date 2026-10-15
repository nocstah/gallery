<script lang="ts">
  import { browser } from '$app/environment';
  import { focusTrap } from '$lib/actions/focus-trap';
  import { shortcuts } from '$lib/actions/shortcut';
  import type { Action, OnAction, PreAction } from '$lib/components/asset-viewer/actions/action';
  import NextAssetAction from '$lib/components/asset-viewer/actions/NextAssetAction.svelte';
  import PreviousAssetAction from '$lib/components/asset-viewer/actions/PreviousAssetAction.svelte';
  import AssetViewerNavBar from '$lib/components/asset-viewer/AssetViewerNavBar.svelte';
  import { preloadManager } from '$lib/components/asset-viewer/PreloadManager.svelte';
  import { removeObjects } from '$lib/components/curator/remove-objects.svelte';
  import AdjustPhoto from '$lib/components/curator/AdjustPhoto.svelte';
  import { adjustPhoto } from '$lib/components/curator/adjust-photo.svelte';
  import LiveEffects from '$lib/components/curator/LiveEffects.svelte';
  import { liveEffects } from '$lib/components/curator/live-effects.svelte';
  import LookUpCard from '$lib/components/curator/LookUpCard.svelte';
  import { lookUp } from '$lib/components/curator/look-up.svelte';
  import StackPick from '$lib/components/curator/StackPick.svelte';
  import { stackPick } from '$lib/components/curator/stack-pick.svelte';
  import RemoveObjects from '$lib/components/curator/RemoveObjects.svelte';
  import OnEvents from '$lib/components/OnEvents.svelte';
  import { AssetAction, ProjectionType } from '$lib/constants';
  import { activityManager } from '$lib/managers/activity-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { editManager, EditToolType } from '$lib/managers/edit/edit-manager.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { getAssetActions } from '$lib/services/asset.service';
  import { faceManager } from '$lib/stores/face.svelte';
  import { ocrManager } from '$lib/stores/ocr.svelte';
  import { alwaysLoadOriginalVideo } from '$lib/stores/preferences.store';
  import { SlideshowNavigation, SlideshowState, slideshowStore } from '$lib/stores/slideshow.store';
  import { getAssetMediaUrl, getSharedLink, handlePromiseError } from '$lib/utils';
  import type { OnUndoDelete } from '$lib/utils/actions';
  import { navigateToAsset } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { navigate } from '$lib/utils/navigation';
  import {
    canEditSpacePeople as resolveCanEditSpacePeople,
    resolveEffectiveSpaceId,
  } from '$lib/utils/asset-editability';
  import { InvocationTracker } from '$lib/utils/invocationTracker';
  import { SlideshowHistory } from '$lib/utils/slideshow-history';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import {
    AssetMediaSize,
    AssetTypeEnum,
    getAssetInfo,
    getStack,
    type AlbumResponseDto,
    type AssetResponseDto,
    type PersonResponseDto,
    type StackResponseDto,
  } from '@immich/sdk';
  import { CommandPaletteDefaultProvider, Icon } from '@immich/ui';
  import { mdiStarFourPointsOutline } from '@mdi/js';
  import { onDestroy, onMount, untrack } from 'svelte';
  import type { SwipeCustomEvent } from 'svelte-gestures';
  import { t } from 'svelte-i18n';
  import { fade, fly } from 'svelte/transition';
  import Thumbnail from '../assets/thumbnail/Thumbnail.svelte';
  import ActivityStatus from './ActivityStatus.svelte';
  import ActivityViewer from './ActivityViewer.svelte';
  import DetailPanel from './DetailPanel.svelte';
  import EditorPanel from './editor/EditorPanel.svelte';
  import TrimArea from './editor/trim-tool/trim-area.svelte';
  import CropArea from './editor/transform-tool/CropArea.svelte';
  import ImagePanoramaViewer from './ImagePanoramaViewer.svelte';
  import OcrButton from './OcrButton.svelte';
  import PhotoViewer from './PhotoViewer.svelte';
  import SlideshowBar from './SlideshowBar.svelte';
  import SlideshowMetadataOverlay from './SlideshowMetadataOverlay.svelte';
  import VideoViewer from './VideoWrapperViewer.svelte';

  export type AssetCursor = {
    current: AssetResponseDto;
    nextAsset?: AssetResponseDto;
    previousAsset?: AssetResponseDto;
  };

  interface Props {
    cursor: AssetCursor;
    showNavigation?: boolean;
    withStacked?: boolean;
    isShared?: boolean;
    album?: AlbumResponseDto;
    person?: PersonResponseDto;
    onAssetChange?: (asset: AssetResponseDto) => void;
    preAction?: PreAction;
    onAction?: OnAction;
    onUndoDelete?: OnUndoDelete;
    onClose?: (assetId: string) => void;
    onRandom?: () => Promise<{ id: string } | undefined>;
    spaceId?: string;
    /** Shared-space surface + the caller's write capability on it — see `Timeline` (#889). */
    space?: { id: string; canWrite: boolean };
  }

  let {
    cursor,
    showNavigation = true,
    withStacked = false,
    isShared = false,
    album,
    person,
    onAssetChange,
    preAction,
    onAction,
    onUndoDelete,
    onClose,
    onRandom,
    spaceId,
    space,
  }: Props = $props();

  const {
    restartProgress: restartSlideshowProgress,
    stopProgress: stopSlideshowProgress,
    slideshowNavigation,
    slideshowState,
    slideshowRepeat,
    slideshowAutoplay,
  } = slideshowStore;
  const stackThumbnailSize = 60;
  const stackSelectedThumbnailSize = 65;

  let previewStackedAsset: AssetResponseDto | undefined = $state();
  let stack: StackResponseDto | undefined = $state();
  const asset = $derived(previewStackedAsset ?? cursor.current);
  // Local Omarchy layer: Curator's object-removal brush replaces the photo viewer and its controls while it is open
  const brushing = $derived(removeObjects.assetId === asset.id && asset.type === AssetTypeEnum.Image);
  // Local Omarchy layer: Curator's effects panel (Live Photo effects, cinematic), which holds the viewer like the brush
  const livening = $derived(liveEffects.assetId === asset.id && asset.type === AssetTypeEnum.Image);
  // Local Omarchy layer: Curator's Adjust panel (light, colour, filters, straighten), which holds the viewer the same way
  const adjusting = $derived(adjustPhoto.assetId === asset.id && asset.type === AssetTypeEnum.Image);
  const inCuratorTool = $derived(brushing || livening || adjusting);
  const ownStack = $derived(authManager.authenticated && asset.ownerId === authManager.user.id);
  const nextAsset = $derived(cursor.nextAsset);
  const previousAsset = $derived(cursor.previousAsset);
  // Slice 8 gap closure: the SAME rule DetailPanel.svelte's People row uses for `asset` — see
  // `resolveCanEditSpacePeople`'s doc. Threaded into PhotoViewer/VideoViewer's `FaceEditorPanel`
  // so the face-draw affordance opens the matching endpoint family, never the owner's when a
  // non-owner space editor triggered it.
  const canEditSpacePeople = $derived(
    resolveCanEditSpacePeople(asset, { userId: authManager.authenticated ? authManager.user.id : undefined, spaceId }),
  );
  const effectiveSpaceId = $derived(resolveEffectiveSpaceId(asset, spaceId));
  let sharedLink = getSharedLink();
  let fullscreenElement = $state<Element>();

  let isPlayingOriginalVideo = $state($alwaysLoadOriginalVideo);
  let slideshowStartAssetId = $state<string>();

  const setPlayOriginalVideo = (value: boolean) => {
    isPlayingOriginalVideo = value;
  };

  const refreshStack = async () => {
    if (authManager.isSharedLink || !withStacked) {
      return;
    }

    if (asset.stack) {
      stack = await getStack({ id: asset.stack.id });
    }

    if (!stack?.assets.some(({ id }) => id === asset.id)) {
      stack = undefined;
    }
  };

  const handleFavorite = async () => {
    if (!album || !album.isActivityEnabled) {
      return;
    }

    try {
      await activityManager.toggleLike();
    } catch (error) {
      handleError(error, $t('errors.unable_to_change_favorite'));
    }
  };

  const onAssetUpdate = (updatedAsset: AssetResponseDto) => {
    if (asset.id === updatedAsset.id) {
      cursor = { ...cursor, current: updatedAsset };
    }
  };

  const onAssetsUndoArchive = async (assets: TimelineAsset[]) => {
    if (assets.length === 0) {
      return;
    }
    const restoredAsset = assets[0];
    await assetViewerManager.setAssetId(restoredAsset.id);
    await navigate({ targetRoute: 'current', assetId: restoredAsset.id });
  };

  const onStackCreate = (createdStack: StackResponseDto) => {
    if (createdStack.assets.map((a) => a.id).includes(asset.id)) {
      stack = createdStack;
    }
  };

  const onStackUpdate = (updatedStack: StackResponseDto) => {
    if (stack?.id !== updatedStack.id) {
      return;
    }

    stack = updatedStack;
    if (!stack.assets.map((a) => a.id).includes(asset.id)) {
      // current asset was removed from stack, go to primary
      cursor.current = stack.assets[0];
    }
  };

  const onPersonThumbnailReady = async ({ id: personId }: { id: string }) => {
    if (person && person.id !== personId) {
      return;
    }
    faceManager.clear();
    await faceManager.getAssetFaces(asset.id);
  };

  onMount(() => {
    syncAssetViewerOpenClass(true);
    const slideshowStateUnsubscribe = slideshowState.subscribe((value) => {
      if (value === SlideshowState.PlaySlideshow) {
        slideshowHistory.reset();
        slideshowHistory.queue(toTimelineAsset(asset));
        handlePromiseError(handlePlaySlideshow());
      } else if (value === SlideshowState.StopSlideshow) {
        handlePromiseError(handleStopSlideshow());
      }
    });

    const slideshowNavigationUnsubscribe = slideshowNavigation.subscribe((value) => {
      if (value !== SlideshowNavigation.Shuffle) {
        return;
      }

      slideshowHistory.reset();
      slideshowHistory.queue(toTimelineAsset(asset));
    });

    return () => {
      slideshowStateUnsubscribe();
      slideshowNavigationUnsubscribe();
    };
  });

  onDestroy(() => {
    removeObjects.close();
    liveEffects.close();
    adjustPhoto.close();
    stackPick.close();
    activityManager.reset();
    assetViewerManager.resetPanelState();
    syncAssetViewerOpenClass(false);
    preloadManager.destroy();
  });

  const closeViewer = () => {
    onClose?.(asset.id);
  };

  const closeEditor = async () => {
    if (editManager.hasAppliedEdits) {
      const refreshedAsset = await getAssetInfo({ id: asset.id, spaceId });
      onAssetChange?.(refreshedAsset);
      assetViewerManager.setAsset(refreshedAsset);
    }
    assetViewerManager.closeEditor();
  };

  const tracker = new InvocationTracker();
  const navigateAsset = (order?: 'previous' | 'next') => {
    if (!order) {
      if ($slideshowState === SlideshowState.PlaySlideshow) {
        order = $slideshowNavigation === SlideshowNavigation.AscendingOrder ? 'previous' : 'next';
      } else {
        return;
      }
    }

    preloadManager.cancelBeforeNavigation(order);

    if (tracker.isActive()) {
      return;
    }

    void tracker.invoke(async () => {
      const isShuffle =
        $slideshowState === SlideshowState.PlaySlideshow && $slideshowNavigation === SlideshowNavigation.Shuffle;

      let hasNext: boolean;

      if (isShuffle) {
        hasNext = order === 'previous' ? slideshowHistory.previous() : slideshowHistory.next();
        if (!hasNext) {
          const asset = await onRandom?.();
          if (asset) {
            slideshowHistory.queue(asset);
            hasNext = true;
          }
        }
      } else {
        hasNext =
          order === 'previous' ? await navigateToAsset(cursor.previousAsset) : await navigateToAsset(cursor.nextAsset);
      }

      if ($slideshowState !== SlideshowState.PlaySlideshow) {
        return;
      }

      if (hasNext) {
        $restartSlideshowProgress = true;
        return;
      }

      if ($slideshowRepeat && slideshowStartAssetId) {
        await assetViewerManager.setAssetId(slideshowStartAssetId, spaceId);
        $restartSlideshowProgress = true;
        return;
      }

      await handleStopSlideshow();
    }, $t('error_while_navigating'));
  };

  // Local Omarchy layer: a version just kept in the Adjust panel is shown in its place, on top of the stack, as stepping
  // through the stack would show it
  const showVersion = (version: AssetResponseDto) => {
    previewStackedAsset = undefined;
    cursor.current = version;
  };

  const navigateStack = (direction: 'previous' | 'next') => {
    if (!stack || !withStacked || assetViewerManager.isShowEditor || inCuratorTool) {
      return;
    }
    const assets = stack.assets;
    const currentIndex = assets.findIndex(({ id }) => id === asset.id);
    if (currentIndex === -1) {
      return;
    }
    const nextIndex = direction === 'previous' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= assets.length) {
      return;
    }
    cursor.current = assets[nextIndex];
  };

  /**
   * Slide show mode
   */

  let assetViewerHtmlElement = $state<HTMLElement>();

  const slideshowHistory = new SlideshowHistory((asset) => {
    handlePromiseError(assetViewerManager.setAssetId(asset.id, spaceId).then(() => ($restartSlideshowProgress = true)));
  });

  const handleVideoStarted = () => {
    if ($slideshowState === SlideshowState.PlaySlideshow) {
      $stopSlideshowProgress = true;
    }
  };

  const handlePlaySlideshow = async () => {
    slideshowStartAssetId = asset.id;
    if (!$slideshowAutoplay) {
      $slideshowState = SlideshowState.PauseSlideshow;
    }
    try {
      await assetViewerHtmlElement?.requestFullscreen?.();
    } catch (error) {
      handleError(error, $t('errors.unable_to_enter_fullscreen'));
      $slideshowState = SlideshowState.StopSlideshow;
    }
  };

  const handleStopSlideshow = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_exit_fullscreen'));
    } finally {
      $stopSlideshowProgress = true;
      $slideshowState = SlideshowState.None;
    }
  };

  const handleStackedAssetMouseEvent = (isMouseOver: boolean, stackedAsset: AssetResponseDto) => {
    previewStackedAsset = isMouseOver ? stackedAsset : undefined;
  };

  // Local Omarchy layer: a photo trashed (or deleted) from inside a stack leaves the viewer in the stack, on the photo
  // beside it in the strip, instead of on the timeline's next photo (which made the whole stack look gone); only the
  // stack's last photo still leaves as before. The timeline drops the photo once it is gone (TimelineAssetViewer's
  // handleAction) and the stack's StackUpdate (utils/stack-covers) brings the strip and its cover up to date.
  const stayInStack = (action: Action) => {
    if ((action.type !== AssetAction.TRASH && action.type !== AssetAction.DELETE) || !stack || !withStacked) {
      return false;
    }
    const index = stack.assets.findIndex(({ id }) => id === action.asset.id);
    const next = index === -1 ? undefined : (stack.assets[index + 1] ?? stack.assets[index - 1]);
    if (!next) {
      return false;
    }
    previewStackedAsset = undefined;
    stack = { ...stack, assets: stack.assets.filter(({ id }) => id !== action.asset.id) };
    cursor.current = next;
    // the open photo belongs to the page: the viewer's place is rebuilt from it whenever the timeline changes (as it
    // does once the photo is gone), so it and the address move on to the next photo too, the trashed one's address
    // replaced in the history
    assetViewerManager.setAsset(next);
    void navigate({ targetRoute: 'current', assetId: next.id }, { replaceState: true });
    return true;
  };

  const handlePreAction = (action: Action) => {
    if (stayInStack(action)) {
      return;
    }
    preAction?.(action);
  };

  const handleAction = (action: Action) => {
    switch (action.type) {
      case AssetAction.DELETE:
      case AssetAction.TRASH: {
        // the photo the action was for: by the time it is done the viewer may already show another one
        eventManager.emit('AssetsDelete', [action.asset.id]);
        break;
      }
      case AssetAction.RATING: {
        cursor.current = {
          ...asset,
          exifInfo: {
            ...asset.exifInfo,
            rating: action.rating,
          },
        };
        break;
      }
      // no default
    }

    onAction?.(action);
  };

  let isFullScreen = $derived(!!fullscreenElement);

  $effect(() => {
    if (album && !album.isActivityEnabled && activityManager.commentCount === 0) {
      assetViewerManager.closeActivityPanel();
    }
  });
  $effect(() => {
    if (album && isShared && asset.id) {
      handlePromiseError(activityManager.init(album.id, asset.id));
    }
  });

  const syncAssetViewerOpenClass = (isOpen: boolean) => {
    if (browser) {
      document.body.classList.toggle('asset-viewer-open', isOpen);
    }
  };

  const refresh = async () => {
    await refreshStack();
    ocrManager.clear();
    faceManager.clear();
    if (!sharedLink) {
      if (previewStackedAsset) {
        await ocrManager.getAssetOcr(previewStackedAsset.id);
        await faceManager.getAssetFaces(previewStackedAsset.id);
      }
      await ocrManager.getAssetOcr(asset.id);
      await faceManager.getAssetFaces(asset.id);
    }
  };

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    asset;
    untrack(() => handlePromiseError(refresh()));
  });

  let lastCursor = $state<AssetCursor>();

  $effect(() => {
    if (cursor.current.id === lastCursor?.current.id) {
      return;
    }
    if (lastCursor) {
      preloadManager.updateAfterNavigation(lastCursor, cursor, sharedLink);
    }
    if (!lastCursor) {
      preloadManager.initializePreloads(cursor, sharedLink);
    }
    lastCursor = cursor;
  });

  const viewerKind = $derived.by(() => {
    if (brushing) {
      return 'RemoveObjects';
    }
    if (livening) {
      return 'LiveEffects';
    }
    if (adjusting) {
      return 'AdjustPhoto';
    }
    if (previewStackedAsset) {
      return previewStackedAsset.type === AssetTypeEnum.Image ? 'PhotoViewer' : 'StackVideoViewer';
    }
    if (assetViewerManager.isShowEditor && editManager.selectedTool?.type === EditToolType.Trim) {
      return 'TrimArea';
    }
    if (asset.type === AssetTypeEnum.Video) {
      return 'VideoViewer';
    }
    if (assetViewerManager.isPlayingMotionPhoto && asset.livePhotoVideoId) {
      return 'LiveVideoViewer';
    }
    if (
      asset.exifInfo?.projectionType === ProjectionType.EQUIRECTANGULAR ||
      (asset.originalPath && asset.originalPath.toLowerCase().endsWith('.insp'))
    ) {
      return 'ImagePanaramaViewer';
    }
    if (assetViewerManager.isShowEditor && editManager.selectedTool?.type === EditToolType.Transform) {
      return 'CropArea';
    }
    return 'PhotoViewer';
  });

  const showActivityStatus = $derived(
    $slideshowState === SlideshowState.None &&
      isShared &&
      ((album && album.isActivityEnabled) || activityManager.commentCount > 0) &&
      !activityManager.isLoading,
  );

  const showOcrButton = $derived(
    $slideshowState === SlideshowState.None &&
      asset.type === AssetTypeEnum.Image &&
      !assetViewerManager.isShowEditor &&
      !inCuratorTool &&
      ocrManager.hasOcrData,
  );

  const { Tag, TagPeople } = $derived(getAssetActions($t, asset));
  const showDetailPanel = $derived(
    asset.hasMetadata &&
      $slideshowState === SlideshowState.None &&
      assetViewerManager.isShowDetailPanel &&
      !assetViewerManager.isShowEditor &&
      !inCuratorTool,
  );

  const onSwipe = (event: SwipeCustomEvent) => {
    if (assetViewerManager.zoom > 1) {
      return;
    }

    if (ocrManager.showOverlay) {
      return;
    }

    if (event.detail.direction === 'left') {
      navigateAsset('next');
    } else if (event.detail.direction === 'right') {
      navigateAsset('previous');
    }
  };
</script>

<CommandPaletteDefaultProvider name={$t('assets')} actions={[Tag, TagPeople]} />
<OnEvents
  {onAssetUpdate}
  {onAssetsUndoArchive}
  {onStackCreate}
  onStackDelete={() => closeViewer()}
  {onStackUpdate}
  {onPersonThumbnailReady}
/>

<svelte:document
  bind:fullscreenElement
  use:shortcuts={[
    { shortcut: { key: 'ArrowUp' }, onShortcut: () => navigateStack('previous') },
    { shortcut: { key: 'ArrowDown' }, onShortcut: () => navigateStack('next') },
  ]}
/>

<section
  id="immich-asset-viewer"
  class="fixed inset-s-0 top-0 grid size-full grid-cols-4 grid-rows-[64px_1fr] overflow-hidden bg-black"
  use:focusTrap
  bind:this={assetViewerHtmlElement}
>
  <!-- Local Omarchy layer: the photo lights the room. Its thumbnail, blurred far past recognition and dimmed, fills the
       space around it, and crossfades as you move on (omarchy-world.css .ws-ambient). -->
  {#key asset.id}
    <div
      class="ws-ambient"
      aria-hidden="true"
      style:background-image="url({getAssetMediaUrl({
        id: asset.id,
        size: AssetMediaSize.Thumbnail,
        cacheKey: asset.thumbhash,
      })})"
      transition:fade={{ duration: 450 }}
    ></div>
  {/key}
  <!-- Top navigation bar -->
  {#if $slideshowState === SlideshowState.None && !assetViewerManager.isShowEditor && !inCuratorTool}
    <div class="col-span-4 col-start-1 row-span-1 row-start-1 transition-transform">
      <AssetViewerNavBar
        {asset}
        {album}
        {person}
        {stack}
        preAction={handlePreAction}
        onAction={handleAction}
        {onUndoDelete}
        onClose={onClose ? () => onClose(stack?.primaryAssetId ?? asset.id) : undefined}
        {isPlayingOriginalVideo}
        {setPlayOriginalVideo}
        {space}
      />
    </div>
  {/if}

  {#if $slideshowState !== SlideshowState.None}
    <div class="absolute inset-s-0 top-0 flex w-full justify-start">
      <SlideshowBar
        {isFullScreen}
        assetType={previewStackedAsset?.type ?? asset.type}
        onSetToFullScreen={() => assetViewerHtmlElement?.requestFullscreen?.()}
        onPrevious={() => navigateAsset('previous')}
        onNext={() => navigateAsset('next')}
        onClose={() => ($slideshowState = SlideshowState.StopSlideshow)}
      />
    </div>
  {/if}

  {#if $slideshowState === SlideshowState.None && showNavigation && !assetViewerManager.isShowEditor && !assetViewerManager.isFaceEditMode && !inCuratorTool && previousAsset}
    <div class="col-span-1 col-start-1 row-span-full row-start-1 my-auto justify-self-start">
      <PreviousAssetAction onPreviousAsset={() => navigateAsset('previous')} />
    </div>
  {/if}

  <!-- Asset Viewer -->
  <div data-viewer-content class="relative z-[-1] col-span-4 col-start-1 row-span-full row-start-1">
    {#if viewerKind === 'StackVideoViewer'}
      <VideoViewer
        asset={previewStackedAsset!}
        cacheKey={previewStackedAsset!.thumbhash}
        projectionType={previewStackedAsset!.exifInfo?.projectionType}
        loopVideo={true}
        onPreviousAsset={() => navigateAsset('previous')}
        onNextAsset={() => navigateAsset('next')}
        onClose={closeViewer}
        onVideoEnded={() => navigateAsset()}
        onVideoStarted={handleVideoStarted}
        playOriginalVideo={isPlayingOriginalVideo}
        spaceId={effectiveSpaceId}
        {canEditSpacePeople}
      />
    {:else if viewerKind === 'LiveVideoViewer'}
      <VideoViewer
        {asset}
        assetId={asset.livePhotoVideoId!}
        cacheKey={asset.thumbhash}
        projectionType={asset.exifInfo?.projectionType}
        loopVideo={$slideshowState !== SlideshowState.PlaySlideshow}
        onPreviousAsset={() => navigateAsset('previous')}
        onNextAsset={() => navigateAsset('next')}
        onVideoEnded={() => (assetViewerManager.isPlayingMotionPhoto = false)}
        playOriginalVideo={isPlayingOriginalVideo}
        spaceId={effectiveSpaceId}
        {canEditSpacePeople}
      />
    {:else if viewerKind === 'RemoveObjects'}
      <RemoveObjects {asset} onClose={() => removeObjects.close()} />
    {:else if viewerKind === 'LiveEffects'}
      <LiveEffects {asset} onClose={() => liveEffects.close()} />
    {:else if viewerKind === 'AdjustPhoto'}
      <AdjustPhoto {asset} onClose={() => adjustPhoto.close()} onKept={showVersion} />
    {:else if viewerKind === 'ImagePanaramaViewer'}
      <ImagePanoramaViewer {asset} />
    {:else if viewerKind === 'TrimArea'}
      <TrimArea {asset} />
    {:else if viewerKind === 'CropArea'}
      <CropArea {asset} />
    {:else if viewerKind === 'PhotoViewer'}
      <PhotoViewer
        cursor={{ ...cursor, current: asset }}
        {sharedLink}
        {onSwipe}
        spaceId={effectiveSpaceId}
        {canEditSpacePeople}
      />
    {:else if viewerKind === 'VideoViewer'}
      <VideoViewer
        {asset}
        cacheKey={asset.thumbhash}
        projectionType={asset.exifInfo?.projectionType}
        loopVideo={$slideshowState !== SlideshowState.PlaySlideshow}
        extendedControls
        onPreviousAsset={() => navigateAsset('previous')}
        onNextAsset={() => navigateAsset('next')}
        onClose={closeViewer}
        onVideoEnded={() => navigateAsset()}
        onVideoStarted={handleVideoStarted}
        playOriginalVideo={isPlayingOriginalVideo}
        spaceId={effectiveSpaceId}
        {canEditSpacePeople}
      />
    {/if}

    {#if showActivityStatus}
      <div class="absolute inset-e-0 bottom-0 me-8 mb-20">
        <ActivityStatus
          disabled={!album?.isActivityEnabled}
          isLiked={activityManager.isLiked}
          numberOfComments={activityManager.commentCount}
          numberOfLikes={activityManager.likeCount}
          onFavorite={handleFavorite}
        />
      </div>
    {/if}

    <!-- Local Omarchy layer: Curator's "Pick the best" for the stack in view -->
    {#if stack && stackPick.stackId === stack.id && !inCuratorTool && $slideshowState === SlideshowState.None}
      {@const pickedStack = stack}
      <StackPick
        stackId={pickedStack.id}
        onClose={() => stackPick.close()}
        onShow={(id) => {
          const found = pickedStack.assets.find((a) => a.id === id);
          if (found) {
            cursor.current = found;
            previewStackedAsset = undefined;
          }
        }}
      />
    {:else if lookUp.on && asset.type === AssetTypeEnum.Image && !inCuratorTool && $slideshowState === SlideshowState.None}
      <LookUpCard assetId={asset.id} onClose={() => (lookUp.on = false)} />
    {/if}

    {#if showOcrButton}
      <div class="absolute inset-e-0 bottom-0 me-6 mb-6 drop-shadow-[0_0_1px_rgba(0,0,0,0.4)]">
        <OcrButton />
      </div>
    {/if}

    {#if $slideshowState !== SlideshowState.None}
      <SlideshowMetadataOverlay {asset} />
    {/if}
  </div>

  {#if $slideshowState === SlideshowState.None && showNavigation && !assetViewerManager.isShowEditor && !assetViewerManager.isFaceEditMode && !inCuratorTool && nextAsset}
    <div class="col-span-1 col-start-4 row-span-full row-start-1 my-auto justify-self-end">
      <NextAssetAction onNextAsset={() => navigateAsset('next')} />
    </div>
  {/if}

  {#if showDetailPanel || assetViewerManager.isShowEditor}
    <div
      transition:fly={{ duration: 150 }}
      id="detail-panel"
      class={[
        'row-span-4 row-start-1 overflow-y-auto bg-light transition-all dark:border-l dark:border-s-immich-dark-gray',
        showDetailPanel ? 'w-90' : 'w-100',
      ]}
      translate="yes"
    >
      {#if showDetailPanel}
        <DetailPanel {asset} currentAlbum={album} {spaceId} />
      {:else if assetViewerManager.isShowEditor}
        <EditorPanel {asset} onClose={closeEditor} />
      {/if}
    </div>
  {/if}

  {#if stack && withStacked && !assetViewerManager.isShowEditor && !inCuratorTool && $slideshowState === SlideshowState.None}
    {@const stackedAssets = stack.assets}
    <div id="stack-slideshow" class="absolute bottom-0 col-span-4 col-start-1 w-fit max-w-full">
      <div class="no-wrap horizontal-scrollbar relative flex flex-row overflow-x-auto overflow-y-hidden">
        <!-- Local Omarchy layer: ask Curator for the stack's best photo -->
        {#if ownStack && lookUp.available}
          <div class="flex items-center px-1 pb-2">
            <button
              type="button"
              class="grid size-12 place-items-center rounded-xl border border-white/10 bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/75"
              title={$t('stack_pick')}
              aria-label={$t('stack_pick')}
              onclick={() => stack && stackPick.open(stack.id)}
            >
              <Icon icon={mdiStarFourPointsOutline} size="20" />
            </button>
          </div>
        {/if}
        {#each stackedAssets as stackedAsset (stackedAsset.id)}
          <div
            class={['relative inline-block px-1 pb-2 transition-all']}
            style:bottom={stackedAsset.id === asset.id ? '0' : '-10px'}
          >
            <Thumbnail
              imageClass={stackedAsset.id === asset.id ? 'border-2 border-white' : 'brightness-70'}
              brokenAssetClass="text-xs"
              asset={toTimelineAsset(stackedAsset)}
              onClick={() => {
                cursor.current = stackedAsset;
                previewStackedAsset = undefined;
              }}
              onMouseEvent={({ isMouseOver }) => handleStackedAssetMouseEvent(isMouseOver, stackedAsset)}
              readonly
              thumbnailSize={stackedAsset.id === asset.id ? stackSelectedThumbnailSize : stackThumbnailSize}
              showStackedIcon={false}
              disableLinkMouseOver
            />

            {#if stackedAsset.id === asset.id}
              <div class="flex w-full place-content-center place-items-center">
                <div class="mt-0.5 flex size-2 rounded-full bg-white"></div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if isShared && album && assetViewerManager.isShowActivityPanel && authManager.authenticated}
    <div
      transition:fly={{ duration: 150 }}
      id="activity-panel"
      class="row-span-5 row-start-1 w-90 overflow-y-auto transition-all md:w-115 dark:border-l dark:border-s-immich-dark-gray"
      translate="yes"
    >
      <ActivityViewer
        disabled={!album.isActivityEnabled}
        assetType={asset.type}
        albumUsers={album.albumUsers}
        albumId={album.id}
        assetId={asset.id}
      />
    </div>
  {/if}
</section>

<style>
  #immich-asset-viewer {
    contain: layout;
  }

  .horizontal-scrollbar::-webkit-scrollbar {
    width: 8px;
    height: 10px;
  }

  /* Track */
  .horizontal-scrollbar::-webkit-scrollbar-track {
    background: #000000;
    border-radius: 16px;
  }

  /* Handle */
  .horizontal-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(159, 159, 159, 0.408);
    border-radius: 16px;
  }

  /* Handle on hover */
  .horizontal-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #adcbfa;
    border-radius: 16px;
  }
</style>
