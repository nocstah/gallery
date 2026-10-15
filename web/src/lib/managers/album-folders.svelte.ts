// Local Omarchy layer: album folders on the Albums page. The user's albums came from the Mac in folders ("We need
// support for album folders though I think"). Gallery keeps album folders only inside a Space, so the Albums page
// shows the folders of the personal Space "Library", where Curator and the Mac's albums are filed: an album filed in
// one of its folders sits in that folder here too, and every other album sits at the top. Folders are made, renamed,
// moved and deleted here with the Space's own calls, and an album goes into a folder by Move to folder or by dragging it
// onto one; an album that is not in the Space yet is added to it on the way. Gallery's "hide this album from my
// timeline" works on an album of a Space too, so the album menus offer it here ("each album can i set it to hide from
// showing its contents in main photos?").
import {
  createSharedSpaceAlbumFolder,
  createSpace,
  deleteSharedSpaceAlbumFolder,
  getAlbumTimelineHidePreview,
  getAllSpaces,
  getSharedSpaceAlbumFolders,
  getSharedSpaceAlbums,
  linkAlbum,
  setSharedSpaceAlbumFolder,
  unlinkAlbum,
  updateAlbumTimelineForMember,
  updateSharedSpaceAlbumFolder,
  type AlbumResponseDto,
  type SharedSpaceAlbumFolderDto,
  type SharedSpaceLinkedAlbumDto,
} from '@immich/sdk';
import { modalManager } from '@immich/ui';
import { t, type Translations } from 'svelte-i18n';
import { get } from 'svelte/store';
import { authManager } from '$lib/managers/auth-manager.svelte';
import AlbumHideFromMyTimelineConfirmModal from '$lib/modals/AlbumHideFromMyTimelineConfirmModal.svelte';
import SpaceAlbumFolderPickerModal from '$lib/modals/SpaceAlbumFolderPickerModal.svelte';
import { handleError } from '$lib/utils/handle-error';

/** The Space whose folders are the Albums page's (Curator files its albums into it by this name too). */
export const FOLDER_SPACE = 'Library';

/** Where an album sits on the Albums page: its folder (null at the top) and whether I hid it from my timeline. */
export type AlbumPlace = { folderId: string | null; hidden: boolean };

/** Me, or undefined when signed out (a shared link's page, a test), where `authManager.user` throws. */
const myId = () => (authManager.authenticated ? authManager.user.id : undefined);

class AlbumFolderManager {
  spaceId = $state<string | undefined>();
  folders = $state<SharedSpaceAlbumFolderDto[]>([]);
  linked = $state<SharedSpaceLinkedAlbumDto[]>([]);
  #folderIds = $derived(new Set(this.folders.map(({ id }) => id)));
  #albumFolders = $derived(new Map(this.linked.map(({ id, folderId }) => [id, folderId ?? null])));
  #loading?: Promise<void>;

  /** The folder an album sits in: its folder in the Space, or the top (null) for anything else. */
  folderOf(albumId: string): string | null {
    const folderId = this.#albumFolders.get(albumId);
    return folderId && this.#folderIds.has(folderId) ? folderId : null;
  }

  /** What the last load found, loading when nothing has (an album's way back to its folder needs no fresh copy). */
  ready() {
    return this.#loading ?? this.load();
  }

  /** Fresh from the server: the Albums page loads it on every visit. */
  load() {
    this.#loading = this.#load();
    return this.#loading;
  }

  async #load() {
    try {
      // signed out (a shared link's page, a test) there is no Library to find
      const me = myId();
      const spaces = (me && (await getAllSpaces())) || [];
      const space = spaces
        .filter(({ name, createdById }) => name === FOLDER_SPACE && createdById === me)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      this.spaceId = space?.id;
      await this.reload();
    } catch (error) {
      // without its folders the page still lists every album, at the top
      handleError(error, this.#t('spaces_linked_albums_error_load'));
    }
  }

  async reload() {
    if (!this.spaceId) {
      this.folders = [];
      this.linked = [];
      return;
    }
    const [folders, linked] = await Promise.all([
      getSharedSpaceAlbumFolders({ id: this.spaceId }),
      getSharedSpaceAlbums({ id: this.spaceId }),
    ]);
    this.folders = folders;
    this.linked = linked;
  }

  async createFolder(name: string, parentId: string | null) {
    try {
      const id = await this.#space();
      await createSharedSpaceAlbumFolder({ id, sharedSpaceAlbumFolderCreateDto: { name, parentId } });
    } catch (error) {
      handleError(error, this.#t('space_album_folder_error_create'));
    }
    await this.#settle();
  }

  async renameFolder(folder: SharedSpaceAlbumFolderDto, name: string) {
    await this.#update(folder.id, { name }, 'space_album_folder_error_rename');
  }

  async moveFolder(folderId: string, parentId: string | null) {
    await this.#update(folderId, { parentId }, 'space_album_folder_error_move');
  }

  /** Its albums and folders move up one level (Gallery does that), nothing is deleted with it. */
  async deleteFolder(folder: SharedSpaceAlbumFolderDto) {
    try {
      await deleteSharedSpaceAlbumFolder({ id: folder.spaceId, folderId: folder.id });
    } catch (error) {
      handleError(error, this.#t('space_album_folder_error_delete'));
    }
    await this.#settle();
  }

  async moveAlbum(albumId: string, folderId: string | null) {
    const previous = this.linked;
    this.linked = previous.map((album) => (album.id === albumId ? { ...album, folderId } : album));
    try {
      const id = await this.#space();
      if (previous.some((album) => album.id === albumId)) {
        await setSharedSpaceAlbumFolder({
          id,
          albumId,
          sharedSpaceAlbumFolderMoveAlbumDto: { folderId },
        });
      } else if (folderId) {
        // `?? undefined` matters to linkAlbum: its folderId may be left out but never null (see the Space page)
        await linkAlbum({ id, albumId, folderId: folderId ?? undefined });
      }
    } catch (error) {
      this.linked = previous;
      handleError(error, this.#t('space_album_folder_error_move'));
    }
    await this.#settle();
  }

  /** Move to folder: the folder picker, then the move. */
  async pickFolder(albumId: string) {
    await this.ready();
    // typed here: outside a .svelte file the modal's own result type does not reach tsc
    const result = (await modalManager.show(SpaceAlbumFolderPickerModal, {
      folders: this.folders,
      excludeFolderId: null,
      currentFolderId: this.folderOf(albumId),
    })) as { folderId: string | null } | undefined;
    if (result && result.folderId !== this.folderOf(albumId)) {
      await this.moveAlbum(albumId, result.folderId);
    }
  }

  /** Whether I hid an album's photos from my timeline (Gallery's switch, on an album of the Space). */
  hiddenFromTimeline(albumId: string) {
    return this.linked.some(({ id, hiddenFromMyTimeline }) => id === albumId && hiddenFromMyTimeline);
  }

  /** Where an album sits in the Space (its folder, hidden from my timeline or not); undefined when it is not in it. */
  placeOf(albumId: string): AlbumPlace | undefined {
    const linked = this.linked.find(({ id }) => id === albumId);
    return linked ? { folderId: this.folderOf(albumId), hidden: !!linked.hiddenFromMyTimeline } : undefined;
  }

  /** Puts an album where another one sat, without asking (the undo of a merge brings an album back this way). */
  async refile(albumId: string, place: AlbumPlace) {
    try {
      const id = await this.#space();
      // `?? undefined` matters to linkAlbum: its folderId may be left out but never null (see moveAlbum)
      await linkAlbum({ id, albumId, folderId: place.folderId ?? undefined });
      if (place.hidden) {
        await updateAlbumTimelineForMember({
          id,
          albumId,
          sharedSpaceAlbumMemberTimelineDto: { showInTimeline: false },
        });
      }
    } catch (error) {
      handleError(error, this.#t('space_album_folder_error_move'));
    }
    await this.#settle();
  }

  /**
   * Hide from my timeline, or show again, as on the Space's own Albums tab: hiding asks first, with Gallery's count of
   * the photos that go and of those that stay because another album of the Space still shows them. An album outside
   * the Space joins it at the top first (its place on this page stays the same), and leaves again if I change my mind.
   */
  async toggleTimeline(album: Pick<AlbumResponseDto, 'id' | 'albumName'>) {
    await this.ready();
    const hidden = this.hiddenFromTimeline(album.id);
    const outside = this.linked.every(({ id }) => id !== album.id);
    try {
      const id = await this.#space();
      if (outside) {
        await linkAlbum({ id, albumId: album.id });
      }
      if (!hidden) {
        const { hiddenAssetCount, retainedAssetCount } = await getAlbumTimelineHidePreview({ id, albumId: album.id });
        // typed here for the same reason as in pickFolder
        const confirmed = (await modalManager.show(AlbumHideFromMyTimelineConfirmModal, {
          albumName: album.albumName,
          count: hiddenAssetCount,
          retainedCount: retainedAssetCount,
        })) as boolean | undefined;
        if (!confirmed) {
          if (outside) {
            await unlinkAlbum({ id, albumId: album.id });
          }
          await this.#settle();
          return;
        }
      }
      await updateAlbumTimelineForMember({
        id,
        albumId: album.id,
        sharedSpaceAlbumMemberTimelineDto: { showInTimeline: hidden },
      });
    } catch (error) {
      handleError(error, this.#t('spaces_linked_albums_error_update'));
    }
    await this.#settle();
  }

  async #update(folderId: string, change: { name?: string; parentId?: string | null }, failed: Translations) {
    const folder = this.folders.find(({ id }) => id === folderId);
    if (!folder) {
      return;
    }
    try {
      await updateSharedSpaceAlbumFolder({
        id: folder.spaceId,
        folderId,
        sharedSpaceAlbumFolderUpdateDto: change,
      });
    } catch (error) {
      handleError(error, this.#t(failed));
    }
    await this.#settle();
  }

  /** The Space, made the first time a folder is wanted and there is none. */
  async #space() {
    if (!this.spaceId) {
      const space = await createSpace({
        sharedSpaceCreateDto: { name: FOLDER_SPACE, description: 'Albums organised by Curator' },
      });
      this.spaceId = space.id;
    }
    return this.spaceId;
  }

  /** Back to what the server holds, after a change or a failed one. */
  async #settle() {
    try {
      await this.reload();
    } catch (error) {
      handleError(error, this.#t('spaces_linked_albums_error_load'));
    }
  }

  #t(key: Translations) {
    return get(t)(key);
  }
}

export const albumFolders = new AlbumFolderManager();

/**
 * Library, the Space that holds the album folders, is the Albums page's engine rather than a Space of its own (plan A,
 * "Let's go with A"): every list of Spaces leaves it out, so its folders are seen once, under Albums, and an album is
 * never taken out of its folder by unlinking "Library" somewhere. Matched by the id the folders came from, or before
 * they have loaded, by its name and maker.
 */
export const isLibrarySpace = (space: { id: string; name?: string | null; createdById?: string | null }) =>
  albumFolders.spaceId
    ? space.id === albumFolders.spaceId
    : space.name === FOLDER_SPACE && (!space.createdById || space.createdById === myId());
