import { addAssetsToAlbums } from '#lib/gallery/album/album-add.ts';
import { vaultEdition } from '#lib/gallery/edition.ts';
import { albumSeriesAction } from '#lib/gallery/series/series-album.svelte.ts';
import { albumFolders } from '#lib/managers/album-folders.svelte.ts';
import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { photoBooks } from '#lib/managers/photo-book-manager.svelte.ts';
import { specialAlbumOf } from '#lib/managers/special-albums.svelte.ts';
import type { TimelineAsset } from '#lib/managers/timeline-manager/types.ts';
import AddUsersModal from '#lib/modals/AddUsersModal.svelte';
import AlbumEditModal from '#lib/modals/AlbumEditModal.svelte';
import AlbumOptionsModal from '#lib/modals/AlbumOptionsModal.svelte';
import AlbumShareModal from '#lib/modals/AlbumShareModal.svelte';
import {
  addUsersToAlbumMutation,
  deleteAlbumMutation,
  removeUserFromAlbumMutation,
  updateAlbumInfoMutation,
  updateAlbumUserMutation,
} from '#lib/queries/album.query.ts';
import { executeMutation } from '#lib/queries/client.ts';
import { Route } from '#lib/route.ts';
import { pickAndMerge } from '#lib/utils/album-merge.ts';
import { createAlbumAndRedirect } from '#lib/utils/album-utils.ts';
import { downloadArchive } from '#lib/utils/asset-utils.ts';
import { openFileUploadDialog } from '#lib/utils/file-uploader.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import { getPinAction } from '#lib/utils/pin-menu.ts';
import { AlbumUserRole, type AlbumResponseDto, type UserResponseDto } from '@immich/sdk';
import { modalManager, type ActionItem } from '@immich/ui';
import {
  mdiBookOpenPageVariantOutline,
  mdiCallMerge,
  mdiCogOutline,
  mdiDownload,
  mdiExitToApp,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiFolderMoveOutline,
  mdiImageOutline,
  mdiPlus,
  mdiPlusBoxOutline,
  mdiRenameOutline,
  mdiShareVariantOutline,
  mdiTrashCanOutline,
  mdiUpload,
} from '@mdi/js';
import { type MessageFormatter } from 'svelte-i18n';
import { goto } from '$app/navigation';
import { page } from '$app/state';

export const isAlbumOwner = (album: AlbumResponseDto) => album.albumUsers[0].user.id === authManager.user.id;
export const isAlbumEditor = (album: AlbumResponseDto) =>
  isAlbumOwner(album) ||
  album.albumUsers.find(({ user: { id } }) => id === authManager.user.id)?.role === AlbumUserRole.Editor;

export const getAlbumsActions = ($t: MessageFormatter) => {
  const Create: ActionItem = {
    title: $t('create_album'),
    icon: mdiPlusBoxOutline,
    onAction: () => createAlbumAndRedirect(),
  };

  return { Create };
};

export const getAlbumActions = ($t: MessageFormatter, album: AlbumResponseDto) => {
  const isOwned = isAlbumOwner(album);
  const isEditor = isAlbumEditor(album);

  const AddUsers: ActionItem = {
    // Local Omarchy layer: the Share sheet's People: people with their own Gallery account, not "users"
    title: $t('album_add_people'),
    icon: mdiPlus,
    color: 'primary',
    $if: () => !vaultEdition(), // ... and none in a vault's Gallery (gallery/edition)
    onAction: () =>
      modalManager.show(AddUsersModal, {
        excludedUserIds: album.albumUsers.map(({ user: { id } }) => id),
        // TODO that explicit UserResponseDto[] shouldn't be necessary, but svelte's types seem to be messed up right now and AlbumAddUsersModal has a bad type
        // Local Omarchy layer: the modal closes on true; the mutation resolves to the album when the people were added
        onAddUsers: async (users: UserResponseDto[]) => !!(await handleAddUsersToAlbum(album, users)),
      }),
  };

  const Delete: ActionItem = {
    title: $t('delete_album'),
    icon: mdiTrashCanOutline,
    $if: () => isOwned,
    onAction: () => handleDeleteAlbum(album),
  };

  const Download: ActionItem = {
    title: $t('download'),
    icon: mdiDownload,
    $if: () => album.assetCount > 0,
    onAction: () => handleDownloadAlbum(album),
  };

  // Gallery (#990): editing follows the server's Permission.AlbumUpdate (owner ∪ editor), so an
  // album editor can change the album's name, description and creation date. Share and delete stay
  // owner-only (Permission.AlbumDelete is owner-only; share keeps the stricter UI gate).
  const Edit: ActionItem = {
    title: $t('edit_album'),
    icon: mdiRenameOutline,
    $if: () => isEditor,
    onAction: () => modalManager.show(AlbumEditModal, { album }),
  };

  // Gallery: gate on membership, not just non-ownership. A Space member can reach an album through its Space link
  // without being an album user, and the server rejects leaving an album you were never shared into.
  const isNonOwnerMember = album.albumUsers.some(
    ({ user, role }) => user.id === authManager.user.id && role !== AlbumUserRole.Owner,
  );

  const Leave: ActionItem = {
    title: $t('leave_album'),
    icon: mdiExitToApp,
    $if: () => isNonOwnerMember,
    onAction: () => handleLeaveAlbum(album),
  };

  // Local Omarchy layer: album folders (managers/album-folders), from the album's right-click menu and its ⋮ menu
  const MoveToFolder: ActionItem = {
    title: $t('space_album_folder_move'),
    icon: mdiFolderMoveOutline,
    $if: () => isOwned,
    onAction: () => albumFolders.pickFolder(album.id),
  };

  // Local Omarchy layer: Merge into… (utils/album-merge): its photos join another album, then it goes, with an Undo;
  // never To do, Villa or QR, whose photos also carry a tag and the archive
  const Merge: ActionItem = {
    title: $t('album_merge_into'),
    icon: mdiCallMerge,
    $if: () => isOwned && !specialAlbumOf(album.id),
    onAction: () => void pickAndMerge(album),
  };

  // Local Omarchy layer: Gallery's "hide this album from my timeline", from the same menus (managers/album-folders)
  const hiddenFromTimeline = albumFolders.hiddenFromTimeline(album.id);
  const ToggleTimeline: ActionItem = {
    title: hiddenFromTimeline ? $t('space_albums_show_in_my_timeline') : $t('space_albums_hide_from_my_timeline'),
    icon: hiddenFromTimeline ? mdiEyeOutline : mdiEyeOffOutline,
    $if: () => isOwned,
    onAction: () => albumFolders.toggleTimeline(album),
  };

  // Local Omarchy layer: Make photo book (managers/photo-book-manager): Curator lays the album's best photos out as a
  // print-ready book; offered once Curator says it makes books, to Curator's owner only (`available` holds
  // utils/curator's curatorIsMine), and never for To do, Villa or QR, which hold photos set aside
  const MakeBook: ActionItem = {
    title: $t('photo_book_make'),
    icon: mdiBookOpenPageVariantOutline,
    $if: () => photoBooks.available && album.assetCount > 0 && !specialAlbumOf(album.id),
    onAction: () => void photoBooks.askForAlbum(album),
  };

  // Local Omarchy layer: A memory a day from this album (gallery/series): a smart album's own series, opened or made,
  // for Curator's owner only
  const MemoryADay = albumSeriesAction($t, album);

  const Options: ActionItem = {
    title: $t('options'),
    icon: mdiCogOutline,
    $if: () => album.assetCount > 0,
    onAction: () => modalManager.show(AlbumOptionsModal, { album, readOnly: !isOwned }),
  };

  // Local Omarchy layer: Pin to sidebar / Unpin from sidebar (stores/pinned-albums), for any album I can open; never
  // To do, Villa or QR, which have rows of their own
  const Pin: ActionItem = {
    ...getPinAction($t, album.id),
    $if: () => !specialAlbumOf(album.id),
  };

  const Share: ActionItem = {
    title: $t('share'),
    icon: mdiShareVariantOutline,
    $if: () => isOwned && !vaultEdition(), // Local Omarchy layer: a vault's Gallery shares nothing (gallery/edition)
    // Local Omarchy layer (plan A): the Share sheet (people, links, Spaces); the album's settings stay in Options
    onAction: () => modalManager.show(AlbumShareModal, { album }),
  };

  return {
    AddUsers,
    Delete,
    Download,
    Edit,
    Leave,
    MakeBook,
    MemoryADay,
    Merge,
    MoveToFolder,
    Options,
    Pin,
    Share,
    ToggleTimeline,
  };
};

export const getAlbumAssetActions = ($t: MessageFormatter, album: AlbumResponseDto, asset: { id: string }) => {
  const SetCover: ActionItem = {
    title: $t('set_as_album_cover'),
    icon: mdiImageOutline,
    onAction: () => handleUpdateThumbnail(album, asset.id),
  };

  return { SetCover };
};

export const getAlbumAssetsActions = ($t: MessageFormatter, album: AlbumResponseDto, assets: TimelineAsset[]) => {
  const AddAssets: ActionItem = {
    title: $t('add_assets'),
    color: 'primary',
    icon: mdiPlusBoxOutline,
    $if: () => assets.length > 0,
    onAction: () =>
      // Local Omarchy layer: through the fork's add (gallery/album/album-add), which takes To do and Villa's own way,
      // names the album in its notice and leaves an undo
      addAssetsToAlbums(
        [album.id],
        assets.map(({ id }) => id),
        { notify: true, albumName: album.albumName },
      ).then(() => undefined),
  };

  const Upload: ActionItem = {
    title: $t('select_from_computer'),
    description: $t('album_upload_assets'),
    icon: mdiUpload,
    onAction: () => void openFileUploadDialog({ albumId: album.id }),
  };

  return { AddAssets, Upload };
};

// Local Omarchy layer: back to the folder the album sat in (managers/album-folders), the top of Albums when none
const leaveAlbumPage = (album: AlbumResponseDto) => {
  if (page.params.albumId === album.id) {
    void goto(Route.albums({ folder: albumFolders.folderOf(album.id) }));
  }
};

export const handleUpdateUserAlbumRole = ({
  albumId,
  userId,
  role,
}: {
  albumId: string;
  userId: string;
  role: AlbumUserRole;
}) => executeMutation(updateAlbumUserMutation, [{ id: albumId, userId, updateAlbumUserDto: { role } }]);

export const handleAddUsersToAlbum = (album: AlbumResponseDto, users: UserResponseDto[], onSuccess?: () => void) =>
  executeMutation(
    addUsersToAlbumMutation,
    [{ id: album.id, addUsersDto: { albumUsers: users.map(({ id }) => ({ userId: id })) } }],
    { onSuccess },
  );

export const handleRemoveUserFromAlbum = async (album: AlbumResponseDto, albumUser: UserResponseDto) => {
  const $t = await getFormatter();

  const confirmed = await modalManager.showDialog({
    title: $t('album_remove_user'),
    prompt: $t('album_remove_user_confirmation', { values: { user: albumUser.name } }),
    confirmText: $t('remove_user'),
  });

  if (!confirmed) {
    return;
  }

  await executeMutation(removeUserFromAlbumMutation, [{ id: album.id, userId: albumUser.id }]);
};

export const handleLeaveAlbum = async (album: AlbumResponseDto) => {
  const $t = await getFormatter();

  const confirmed = await modalManager.showDialog({
    title: $t('leave_album'),
    prompt: $t('are_you_sure_to_do_this'),
    confirmText: $t('leave'),
  });

  if (!confirmed) {
    return;
  }

  await executeMutation(removeUserFromAlbumMutation, [{ id: album.id, userId: 'me' }], {
    onSuccess: () => leaveAlbumPage(album),
  });
};

const handleUpdateThumbnail = (album: AlbumResponseDto, assetId: string) =>
  executeMutation(
    () =>
      updateAlbumInfoMutation({
        success: { toast: 'album_cover_updated' },
        error: { toast: 'errors.unable_to_update_album_cover' },
      }),
    [{ id: album.id, updateAlbumDto: { albumThumbnailAssetId: assetId } }],
  );

export const handleDeleteAlbum = async (album: AlbumResponseDto, options?: { prompt?: boolean; notify?: boolean }) => {
  const $t = await getFormatter();
  const { prompt = true, notify = true } = options ?? {};

  if (prompt) {
    const confirmation =
      album.albumName.length > 0
        ? $t('album_delete_confirmation', { values: { album: album.albumName } })
        : $t('unnamed_album_delete_confirmation');
    const description = $t('album_delete_confirmation_description');
    const success = await modalManager.showDialog({ prompt: `${confirmation} ${description}` });
    if (!success) {
      return;
    }
  }

  await executeMutation(
    () =>
      deleteAlbumMutation(
        notify ? { success: { toast: true }, error: { toast: 'errors.unable_to_delete_album' } } : {},
      ),
    [{ id: album.id }],
    { onSuccess: () => leaveAlbumPage(album) },
  );
};

export const handleDownloadAlbum = async (album: AlbumResponseDto) => {
  await downloadArchive(album.albumName, { albumId: album.id });
};
