<script lang="ts">
  // Local Omarchy layer: Kioku's right-click menu on a page's photos (TileContextMenu) with that page's own actions, as
  // its selection bar offers them (photo-menu.ts), each where the Photos menu has it: what a person does most
  // (Restore in the trash, Favorite, Add to album, New album, Share, the special albums), the downloads, the edits
  // (a cover, Rotate, Stack, Tag, the date, place and description), then the ways out (Fix incorrect match, Remove from
  // album or Space, Move to <library>, Archive, the Locked Folder, Delete). The page passes how its view follows each
  // action, the handlers its bar gets. TimelinePhotoMenu, GalleryPhotoMenu and SpacePhotoMenu say where the grid is,
  // find its photos and bring the page's offer.
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import RemoveFromAlbum from '$lib/components/timeline/actions/RemoveFromAlbumAction.svelte';
  import RemoveFromSpaceAction from '$lib/components/timeline/actions/RemoveFromSpaceAction.svelte';
  import RotateAction from '$lib/components/timeline/actions/RotateAction.svelte';
  import SetVisibilityAction from '$lib/components/timeline/actions/SetVisibilityAction.svelte';
  import SpecialAlbumAction from '$lib/components/timeline/actions/SpecialAlbumAction.svelte';
  import TileContextMenu from '$lib/components/timeline/TileContextMenu.svelte';
  import MoveToActions from '$lib/gallery/moves/MoveToActions.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { offeredSpecialAlbums } from '$lib/managers/special-albums.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { getStackBulkActions } from '$lib/services/stack.service';
  import type { OnArchive, OnDelete, OnFavorite, OnRestore, OnSetVisibility, OnUndoDelete } from '$lib/utils/actions';
  import type { AlbumResponseDto, PersonResponseDto } from '@immich/sdk';
  import { mdiAccountMultipleCheckOutline, mdiImageOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { offeredActions, type PhotoMenuAction, type PhotoMenuOffer } from './photo-menu';
  import RestoreMenuItem from './RestoreMenuItem.svelte';

  type Props = {
    /** the photo grid the menu serves, as a selector */
    grid: string;
    findAsset: (id: string) => TimelineAsset | undefined;
    /** what the page's selection bar offers */
    offer: PhotoMenuOffer;
    /** Show in Photos (or Archive) for one of the viewer's own photos, where that is somewhere else */
    reveal?: boolean;
    /** the grid is a timeline, which shows what Stack and Unstack did (search results do not) */
    stacks?: boolean;
    /** the name a download of several photos is saved under */
    downloadName?: string;
    /** the person whose page this is: Move to <library> names them */
    person?: PersonResponseDto;
    /** the album whose page this is: Remove from album, and its cover */
    album?: AlbumResponseDto;
    /** the Space whose page this is: Remove from Space, its cover, and Share and Add to album from it */
    spaceId?: string;
    /** #734: the selection the viewer may edit, where a Space's bar works it out */
    editableSelectedAssetIds?: string[];
    /** #1018: Share makes the link against this Space */
    shareSpaceId?: string;
    onFavorite?: OnFavorite;
    onArchive?: OnArchive;
    onVisibilitySet?: OnSetVisibility;
    onAssetDelete?: OnDelete;
    onUndoDelete?: OnUndoDelete;
    onRestore?: OnRestore;
    /** Fix incorrect match: the person page's own */
    onFixMatch?: () => void;
    onSetCover?: () => void;
    /** after Remove from album or Space */
    onRemove?: (assetIds: string[]) => void;
  };

  let {
    grid,
    findAsset,
    offer,
    reveal = false,
    stacks = false,
    downloadName,
    person,
    album,
    spaceId,
    editableSelectedAssetIds,
    shareSpaceId,
    onFavorite,
    onArchive,
    onVisibilitySet,
    onAssetDelete,
    onUndoDelete,
    onRestore,
    onFixMatch,
    onSetCover,
    onRemove,
  }: Props = $props();

  const offered = $derived(offeredActions(offer, assetMultiSelectManager.isAllUserOwned));
  const has = (action: PhotoMenuAction) => offered.has(action);

  // RemoveFromAlbum takes its album bindable (it reads the album again after a removal), as SelectionToolbar keeps it
  const EMPTY_ALBUM = {} as AlbumResponseDto;
  let boundAlbum = $derived(album ?? EMPTY_ALBUM);
</script>

<TileContextMenu {grid} {findAsset} withStackItems={false} {reveal} assetInteraction={assetMultiSelectManager}>
  {@const Actions = getAssetBulkActions($t, { editableSelectedAssetIds, shareSpaceId, fromSpaceId: spaceId })}
  {#if has('restore')}
    <RestoreMenuItem {onRestore} />
  {/if}
  {#if has('favorite')}
    <FavoriteAction menuItem removeFavorite={assetMultiSelectManager.isAllFavorite} {onFavorite} />
  {/if}
  {#if has('unfavorite')}
    <FavoriteAction menuItem removeFavorite {onFavorite} />
  {/if}
  {#if has('addToAlbum')}
    <ActionMenuItem action={Actions.AddToAlbum} hint />
  {/if}
  {#if has('newAlbum')}
    <ActionMenuItem action={Actions.NewAlbum} hint />
  {/if}
  {#if has('share')}
    <ActionMenuItem action={Actions.CreateSharedLink} />
  {/if}
  {#if has('specialAlbums') && assetMultiSelectManager.isAllUserOwned}
    {#each offeredSpecialAlbums() as special (special.key)}
      <SpecialAlbumAction {special} menuItem {onArchive} />
    {/each}
  {/if}
  {#snippet downloads()}
    {#if has('download')}
      <DownloadAction menuItem filename={downloadName} />
    {/if}
  {/snippet}
  {#snippet more()}
    {@const Edits = getAssetBulkActions($t, { editableSelectedAssetIds, shareSpaceId, fromSpaceId: spaceId })}
    {@const Stacks = getStackBulkActions($t)}
    {#if has('setCover') && onSetCover && assetMultiSelectManager.assets.length === 1}
      {#if album}
        <MenuOption text={$t('set_as_album_cover')} icon={mdiImageOutline} onClick={onSetCover} />
      {:else}
        <MenuOption text={$t('set_as_space_cover')} icon={mdiImageOutline} onClick={onSetCover} />
      {/if}
    {/if}
    {#if has('rotate')}
      <RotateAction {editableSelectedAssetIds} />
    {/if}
    {#if has('stack') && stacks}
      <ActionMenuItem action={Stacks.Stack} />
      <ActionMenuItem action={Stacks.Unstack} />
    {/if}
    {#if has('tag')}
      <ActionMenuItem action={Edits.Tag} hint />
    {/if}
    {#if has('changeDate')}
      <ChangeDate menuItem {editableSelectedAssetIds} />
    {/if}
    {#if has('changeLocation')}
      <ChangeLocation menuItem {editableSelectedAssetIds} />
    {/if}
    {#if has('changeDescription')}
      <ChangeDescription menuItem {editableSelectedAssetIds} />
    {/if}
    <hr />
    {#if has('fixMatch') && onFixMatch}
      <MenuOption icon={mdiAccountMultipleCheckOutline} text={$t('fix_incorrect_match')} onClick={onFixMatch} />
    {/if}
    {#if has('removeFromAlbum') && album}
      <RemoveFromAlbum menuItem bind:album={boundAlbum} {onRemove} />
    {/if}
    {#if has('removeFromSpace') && spaceId}
      <RemoveFromSpaceAction menuItem {spaceId} {onRemove} />
    {/if}
    {#if has('move')}
      <MoveToActions menuItem {person} />
    {/if}
    {#if has('archive')}
      <ArchiveAction menuItem unarchive={assetMultiSelectManager.isAllArchived} {onArchive} />
    {/if}
    {#if has('unarchive')}
      <ArchiveAction menuItem unarchive {onArchive} />
    {/if}
    {#if has('setVisibility') && onVisibilitySet}
      <SetVisibilityAction menuItem {onVisibilitySet} />
    {/if}
    {#if has('delete') && onAssetDelete}
      <DeleteAssets menuItem {onAssetDelete} {onUndoDelete} />
    {/if}
    {#if has('deletePermanently') && onAssetDelete}
      <DeleteAssets menuItem force {onAssetDelete} />
    {/if}
  {/snippet}
</TileContextMenu>
