<script lang="ts">
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import type { OnAction, PreAction } from '$lib/components/asset-viewer/actions/action';
  import ArchiveAction from '$lib/components/asset-viewer/actions/ArchiveAction.svelte';
  import DeleteAction from '$lib/components/asset-viewer/actions/DeleteAction.svelte';
  import RestoreAction from '$lib/components/asset-viewer/actions/RestoreAction.svelte';
  import SaveFrameAction from '$lib/components/asset-viewer/actions/SaveFrameAction.svelte';
  import SetVisibilityAction from '$lib/components/asset-viewer/actions/SetVisibilityAction.svelte';
  import SpecialAlbumAction from '$lib/components/asset-viewer/actions/SpecialAlbumAction.svelte';
  import { specialAlbums } from '$lib/managers/special-albums.svelte';
  import { removeObjects } from '$lib/components/curator/remove-objects.svelte';
  import { adjustPhoto } from '$lib/components/curator/adjust-photo.svelte';
  import { liveEffects } from '$lib/components/curator/live-effects.svelte';
  import { lookUp } from '$lib/components/curator/look-up.svelte';
  import { shareVideos } from '$lib/managers/share-video-manager.svelte';
  import { copySubject } from '$lib/utils/copy-subject';
  import LoadingDots from '$lib/components/LoadingDots.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { languageManager } from '$lib/managers/language-manager.svelte';
  import { getAlbumAssetActions } from '$lib/services/album.service';
  import { getGlobalActions } from '$lib/services/app.service';
  import { getAssetActions } from '$lib/services/asset.service';
  import { getPersonAssetActions } from '$lib/services/person.service';
  import { getStackActions } from '$lib/services/stack.service';
  import { getSharedLink, withoutIcons } from '$lib/utils';
  import type { OnUndoDelete } from '$lib/utils/actions';
  import { canEditAsset } from '$lib/utils/asset-editability';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import {
    AssetTypeEnum,
    AssetVisibility,
    type AlbumResponseDto,
    type AssetResponseDto,
    type PersonResponseDto,
    type StackResponseDto,
  } from '@immich/sdk';
  import { ActionButton, CommandPaletteDefaultProvider, Icon, Tooltip, type ActionItem } from '@immich/ui';
  import {
    mdiArrowLeft,
    mdiArrowRight,
    mdiContentCut,
    mdiCreationOutline,
    mdiDotsVertical,
    mdiEraser,
    mdiMotionPlayOutline,
    mdiPencilOutline,
    mdiSendOutline,
    mdiTuneVariant,
    mdiVideoOutline,
    mdiWhatsapp,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    asset: AssetResponseDto;
    album?: AlbumResponseDto;
    person?: PersonResponseDto | null;
    stack?: StackResponseDto;
    preAction: PreAction;
    onAction: OnAction;
    onUndoDelete?: OnUndoDelete;
    onClose?: () => void;
    isPlayingOriginalVideo: boolean;
    setPlayOriginalVideo: (value: boolean) => void;
    /**
     * Present on shared-space surfaces (direct space, space album, space person). Gates and
     * narrows the add-to-album action for assets the caller does not own — see
     * `getAssetActions` (#889).
     */
    space?: { id: string; canWrite: boolean };
  }

  let {
    asset,
    album,
    person = null,
    stack,
    preAction,
    onAction,
    onUndoDelete = undefined,
    onClose,
    isPlayingOriginalVideo = false,
    setPlayOriginalVideo,
    space,
  }: Props = $props();

  const isOwner = $derived(authManager.authenticated && asset.ownerId === authManager.user.id);
  const isLocked = $derived(asset.visibility === AssetVisibility.Locked);
  // #734: a space Owner/Editor may edit a member's asset. Server-authoritative via `asset.canEdit`
  // on a single-asset read; falls back to ownership otherwise (see `canEditAsset`).
  const isEditable = $derived(
    canEditAsset(asset, { userId: authManager.authenticated ? authManager.user.id : undefined }),
  );

  const { Cast } = $derived(getGlobalActions($t));

  const Close: ActionItem = $derived({
    title: $t('go_back'),
    icon: languageManager.rtl ? mdiArrowRight : mdiArrowLeft,
    $if: () => !!onClose && !assetViewerManager.isFaceEditMode && !assetViewerManager.isEditFacesPanelOpen,
    onAction: () => onClose?.(),
    shortcuts: [{ key: 'Escape' }],
  });

  const PlayOriginalVideo: ActionItem = $derived({
    title: isPlayingOriginalVideo ? $t('play_transcoded_video') : $t('play_original_video'),
    icon: mdiVideoOutline,
    $if: () => asset.type === AssetTypeEnum.Video,
    onAction: () => setPlayOriginalVideo(!isPlayingOriginalVideo),
  });

  const Actions = $derived(
    getAssetActions($t, { ...asset, stackPrimaryAssetId: stack?.primaryAssetId }, { space, album }),
  );
  const StackActions = $derived(getStackActions($t, stack, asset));
  const sharedLink = getSharedLink();

  // Local Omarchy layer: Curator's object-removal brush, for the owner's own photos when Curator offers it
  const RemoveObjects: ActionItem = $derived({
    title: $t('remove_objects'),
    icon: mdiEraser,
    $if: () =>
      removeObjects.available &&
      isOwner &&
      !isLocked &&
      !asset.isTrashed &&
      !sharedLink &&
      asset.type === AssetTypeEnum.Image,
    onAction: () => removeObjects.open(asset.id),
  });
  $effect(() => {
    if (isOwner && !sharedLink) {
      removeObjects.check();
      liveEffects.check();
      adjustPhoto.check();
      lookUp.check();
    }
  });
  // Local Omarchy layer: Curator's Adjust panel (light, colour, filters, straighten), for the owner's own photos
  const Adjust: ActionItem = $derived({
    title: $t('adjust'),
    icon: mdiTuneVariant,
    $if: () =>
      adjustPhoto.available &&
      isOwner &&
      !isLocked &&
      !asset.isTrashed &&
      !sharedLink &&
      asset.type === AssetTypeEnum.Image,
    onAction: () => adjustPhoto.open(asset.id),
  });
  // Local Omarchy layer: subject lift, the photo's main subject to the clipboard (Curator)
  const CopySubject: ActionItem = $derived({
    title: $t('copy_subject'),
    icon: mdiContentCut,
    $if: () => lookUp.available && isOwner && !sharedLink && !asset.isTrashed && asset.type === AssetTypeEnum.Image,
    onAction: () => void copySubject(asset.id, asset.originalFileName),
  });
  // Local Omarchy layer: Curator's Look Up, what in the photo has a name
  const LookUp: ActionItem = $derived({
    title: $t('look_up'),
    icon: mdiCreationOutline,
    $if: () => lookUp.available && isOwner && !sharedLink && !asset.isTrashed && asset.type === AssetTypeEnum.Image,
    onAction: () => lookUp.toggle(),
  });
  // Local Omarchy layer: a video (or a Live Photo's clip) made ready by Curator for a chat app and saved: H.264 and AAC
  // in an MP4 sized for the app (managers/share-video-manager); the download itself is the original
  const shareable = $derived(
    lookUp.available &&
      isOwner &&
      !sharedLink &&
      !asset.isTrashed &&
      (asset.type === AssetTypeEnum.Video || !!asset.livePhotoVideoId),
  );
  const ForWhatsApp: ActionItem = $derived({
    title: $t('download_for_app', { values: { app: 'WhatsApp' } }),
    icon: mdiWhatsapp,
    $if: () => shareable,
    onAction: () => shareVideos.start(asset.id, 'whatsapp', asset.originalFileName),
  });
  const ForTelegram: ActionItem = $derived({
    title: $t('download_for_app', { values: { app: 'Telegram' } }),
    icon: mdiSendOutline,
    $if: () => shareable,
    onAction: () => shareVideos.start(asset.id, 'telegram', asset.originalFileName),
  });
  // Local Omarchy layer: Curator's effects: a Live Photo's loop, bounce, long exposure, key photo; cinematic for any
  const LiveEffects: ActionItem = $derived({
    title: $t('live_effects'),
    icon: mdiMotionPlayOutline,
    $if: () =>
      liveEffects.available &&
      isOwner &&
      !isLocked &&
      !asset.isTrashed &&
      !sharedLink &&
      asset.type === AssetTypeEnum.Image,
    onAction: () => liveEffects.open(asset.id),
  });
</script>

<CommandPaletteDefaultProvider
  name={$t('assets')}
  actions={withoutIcons([
    Close,
    Cast,
    ...Object.values(Actions),
    Adjust,
    RemoveObjects,
    LiveEffects,
    LookUp,
    CopySubject,
  ])}
/>

<div
  class="ws-viewer-bar flex h-16 place-items-center justify-between bg-linear-to-b from-black/40 px-3 drop-shadow-[0_0_1px_rgba(0,0,0,0.4)] transition-transform duration-200"
>
  <div class="dark">
    <ActionButton action={Close} />
  </div>

  <div
    class="dark -m-1 flex items-center gap-2 overflow-x-auto p-1 *:shrink-0"
    data-testid="asset-viewer-navbar-actions"
  >
    {#if asset.isEdited}
      <div class="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">
        <Icon icon={mdiPencilOutline} size="14" />
        <span>{$t('edited')}</span>
      </div>
    {/if}
    {#if assetViewerManager.isImageLoading}
      <Tooltip text={$t('loading')}>
        {#snippet child({ props })}
          <div {...props} role="status" aria-label={$t('loading')}>
            <LoadingDots class="me-1" />
          </div>
        {/snippet}
      </Tooltip>
    {/if}
    <ActionButton action={Actions.Share} />
    <ActionButton action={Actions.Offline} />
    <ActionButton action={Actions.PlayMotionPhoto} />
    <ActionButton action={Actions.StopMotionPhoto} />
    <ActionButton action={Actions.SharedLinkDownload} />
    <ActionButton action={Actions.Info} />
    <ActionButton action={Actions.Favorite} />
    <ActionButton action={Actions.Unfavorite} />

    <ActionButton action={Actions.Edit} />
    <ActionButton action={Adjust} />
    <ActionButton action={RemoveObjects} />
    <ActionButton action={LiveEffects} />
    <ActionButton action={LookUp} />
    <ActionButton action={CopySubject} />
    <!-- Local Omarchy layer: Save frame as photo, for a video on screen (Curator) -->
    <SaveFrameAction {asset} />

    {#if isOwner}
      <DeleteAction {asset} {onAction} {preAction} {onUndoDelete} />
    {/if}

    {#if !sharedLink}
      <ButtonContextMenu direction="left" align="top-right" color="secondary" title={$t('more')} icon={mdiDotsVertical}>
        <ActionMenuItem action={Actions.PlaySlideshow} />
        <!-- Local Omarchy layer: the rarely used bar actions live here; the bar keeps the everyday ones -->
        <ActionMenuItem action={Cast} />
        <ActionMenuItem action={Actions.ZoomIn} />
        <ActionMenuItem action={Actions.ZoomOut} />
        <ActionMenuItem action={Actions.Copy} />
        <ActionMenuItem action={Actions.RotateRight} />

        <ActionMenuItem action={Actions.Download} />
        <ActionMenuItem action={Actions.DownloadOriginal} />
        <ActionMenuItem action={ForWhatsApp} />
        <ActionMenuItem action={ForTelegram} />
        <ActionMenuItem action={Actions.RotateLeft} />
        <ActionMenuItem action={Actions.Rotate180} />

        {#if !isLocked && asset.isTrashed}
          <RestoreAction {asset} {onAction} />
        {/if}

        <ActionMenuItem action={Actions.AddToAlbum} />
        <ActionMenuItem action={Actions.RemoveFromAlbum} />

        <ActionMenuItem action={StackActions.AddUploads} />
        <ActionMenuItem action={StackActions.Unstack} />
        <ActionMenuItem action={StackActions.KeepThisDeleteOthers} />
        <ActionMenuItem action={StackActions.SetPrimaryAsset} />
        <ActionMenuItem action={StackActions.RemoveAsset} />

        {#if album}
          {@const { SetCover } = getAlbumAssetActions($t, album, asset)}
          <ActionMenuItem action={SetCover} />
        {/if}
        {#if person}
          {@const { SetFeaturedPhoto } = getPersonAssetActions($t, person, asset)}
          <ActionMenuItem action={SetFeaturedPhoto} />
        {/if}

        <ActionMenuItem action={Actions.SetProfilePicture} />

        {#if isOwner && !isLocked}
          <ArchiveAction {asset} {onAction} {preAction} />
          <!-- Local Omarchy layer: into a special album (To do B, Villa V), or out of it again -->
          {#if !asset.isTrashed}
            {#each specialAlbums as special (special.key)}
              <SpecialAlbumAction {special} {asset} {album} {onAction} {preAction} />
            {/each}
          {/if}
        {/if}
        <ActionMenuItem action={Actions.ViewInTimeline} />
        <ActionMenuItem action={Actions.ViewSimilar} />

        {#if !asset.isTrashed && isOwner}
          <SetVisibilityAction asset={toTimelineAsset(asset)} {onAction} {preAction} />
        {/if}

        <ActionMenuItem action={PlayOriginalVideo} />

        {#if isEditable}
          <hr />
          <ActionMenuItem action={Actions.RefreshFacesJob} />
          <ActionMenuItem action={Actions.RefreshMetadataJob} />
          <ActionMenuItem action={Actions.RegenerateThumbnailJob} />
          <ActionMenuItem action={Actions.TranscodeVideoJob} />
        {/if}
      </ButtonContextMenu>
    {/if}
  </div>
</div>
