// Local Omarchy layer: To do, a place to set photos aside to deal with later. The user asked for "a special album called
// todo, where I can easily send photos for dealing with later; they are removed from the main list, tagged todo and only
// show under the todo album". Moving a photo there puts it in the album "To do", tags it "To do" and archives it, which
// is Gallery's own way of taking a photo out of Photos (so, like every archived photo, it also shows under Archive).
// Each photo notes where it came from in Gallery's per-photo metadata (key omarchy-todo), and Mark done puts it back
// there: into Photos, or left in Archive when it was archived before; it never takes a photo out of the Locked Folder.
// Both are undoable (the bar, Ctrl+Z, the toast). Every way into the album goes through here (the album picker, the
// album's own Add photos, uploads into it: services/album.service), so a photo is never in To do and in Photos too.
import {
  addAssetsToAlbum,
  AssetOrder,
  AssetVisibility,
  BulkIdErrorReason,
  createAlbum,
  deleteBulkAssetMetadata,
  getAllAlbums,
  getAssetInfo,
  getAssetMetadataByKey,
  removeAssetFromAlbum,
  tagAssets,
  untagAssets,
  updateAlbumInfo,
  updateAssets,
  updateBulkAssetMetadata,
  upsertTags,
  type BulkIdResponseDto,
} from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { refreshAssets } from '$lib/utils/asset-refresh';
import { handleError } from '$lib/utils/handle-error';
import { toastUndoable } from '$lib/utils/undoable';

/** The album's and the tag's name: data, so the same in every language. */
export const TODO_NAME = 'To do';
/** Where each photo notes where it came from, in Gallery's per-photo metadata. */
export const TODO_KEY = 'omarchy-todo';

export type TodoFrom = 'timeline' | 'archive';
/** A photo as the caller knows it; a missing visibility is read from Gallery. */
export type TodoAsset = { id: string; visibility?: string; ownerId?: string };
export type TodoNote = { id: string; from: TodoFrom };

const AT_ONCE = 8;

/** Reads something for every id, a few at a time; undefined where the read fails (a photo with no note). */
const readEach = async <T>(ids: string[], read: (id: string) => Promise<T>) => {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const found = new Map<string, T | undefined>();
  for (let index = 0; index < ids.length; index += AT_ONCE) {
    const batch = ids.slice(index, index + AT_ONCE);
    const values = await Promise.all(batch.map((id) => read(id).catch(() => undefined)));
    for (const [position, id] of batch.entries()) {
      found.set(id, values[position]);
    }
  }
  return found;
};

const succeeded = (results: BulkIdResponseDto[]) => results.filter(({ success }) => success).map(({ id }) => id);

/**
 * What moving to To do changes: a photo on the timeline is archived and notes that it came from Photos; one already
 * archived notes that it came from Archive when it is new to To do. One already in To do and archived keeps its note.
 */
export const planMove = (ids: string[], visibility: ReadonlyMap<string, string | undefined>, added: Set<string>) => {
  const notes: TodoNote[] = [];
  const archive: string[] = [];
  for (const id of ids) {
    const where = visibility.get(id);
    if (where === AssetVisibility.Timeline) {
      notes.push({ id, from: 'timeline' });
      archive.push(id);
    } else if (where === AssetVisibility.Archive && added.has(id)) {
      notes.push({ id, from: 'archive' });
    }
  }
  return { notes, archive };
};

/**
 * The photos Mark done takes back to Photos: those that came from there and are still archived. A photo that was
 * archived before stays archived, and so does one with no note; one moved to the Locked Folder stays locked.
 */
export const planDone = (
  ids: string[],
  visibility: ReadonlyMap<string, string | undefined>,
  notes: ReadonlyMap<string, TodoFrom | undefined>,
) => ids.filter((id) => notes.get(id) === 'timeline' && visibility.get(id) === AssetVisibility.Archive);

const asFrom = (value: unknown): TodoFrom | undefined =>
  value === 'timeline' || value === 'archive' ? value : undefined;

class TodoManager {
  /** the To do album, once known */
  albumId = $state<string | undefined>();
  /** how many photos wait in it (the sidebar shows it) */
  count = $state<number | undefined>();
  #looking: Promise<string | undefined> | undefined;
  #checked = false;

  isTodo(albumId: string | null | undefined) {
    return !!albumId && albumId === this.albumId;
  }

  /** The To do album's page, or a photo open in it. */
  isTodoPath(pathname: string) {
    return !!this.albumId && pathname.startsWith(`/albums/${this.albumId}`);
  }

  /** The album by its name (the user's own), so a renamed or deleted one is noticed; throws when Gallery can't say. */
  async #fetch() {
    const [album] = await getAllAlbums({ name: TODO_NAME, isOwned: true });
    this.albumId = album?.id;
    this.count = album?.assetCount;
    return album?.id;
  }

  /** Looks the album up for the sidebar and the album picker; a failed lookup keeps what was known. */
  lookUp() {
    this.#looking ??= this.#fetch()
      .catch(() => this.albumId)
      .finally(() => {
        this.#looking = undefined;
      });
    return this.#looking;
  }

  /** The album, looked up once per page load (the user layout asks at start). */
  async ready() {
    if (!this.#checked) {
      this.#checked = true;
      await this.lookUp();
    }
    return this.albumId;
  }

  async #album() {
    // a lookup that failed must not make a second album
    const id = await this.#fetch();
    if (id) {
      return id;
    }
    const album = await createAlbum({ createAlbumDto: { albumName: TODO_NAME } });
    // newest first, as in Photos
    await updateAlbumInfo({ id: album.id, updateAlbumDto: { order: AssetOrder.Desc } }).catch(() => undefined);
    this.albumId = album.id;
    this.count = 0;
    return album.id;
  }

  async #tag() {
    const [tag] = await upsertTags({ tagUpsertDto: { tags: [TODO_NAME] } });
    return tag.id;
  }

  /** Each photo's visibility as the caller knows it, else as Gallery has it; undefined for someone else's photo. */
  async #visibilities(assets: TodoAsset[]) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const known = new Map<string, string | undefined>();
    const unknown: string[] = [];
    for (const { id, visibility } of assets) {
      known.set(id, visibility);
      if (!visibility) {
        unknown.push(id);
      }
    }
    const read = await readEach(unknown, (id) => getAssetInfo({ ...authManager.params, id }));
    for (const [id, asset] of read) {
      const own = asset && (!authManager.authenticated || asset.ownerId === authManager.user.id);
      known.set(id, own ? asset.visibility : undefined);
    }
    return known;
  }

  async #notes(ids: string[]) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const notes = new Map<string, TodoFrom | undefined>();
    for (const [id, note] of await readEach(ids, (id) => getAssetMetadataByKey({ id, key: TODO_KEY }))) {
      notes.set(id, asFrom(note?.value?.from));
    }
    return notes;
  }

  /** Whether Mark done would take this photo back to Photos (the viewer moves on first when it would). */
  async wouldReturn(asset: TodoAsset) {
    const visibility = await this.#visibilities([asset]);
    return planDone([asset.id], visibility, await this.#notes([asset.id])).length > 0;
  }

  /**
   * Sets photos aside: into the album, tagged, out of Photos. Quiet (an upload into the album) skips the toast and the
   * undo. Resolves with what it did, or undefined when nothing moved.
   */
  async move(assets: TodoAsset[], { quiet = false }: { quiet?: boolean } = {}) {
    const translate = get(t);
    try {
      const visibility = await this.#visibilities(assets);
      const ids = assets
        .map(({ id }) => id)
        .filter((id) => {
          const where = visibility.get(id);
          return where === AssetVisibility.Timeline || where === AssetVisibility.Archive;
        });
      if (ids.length === 0) {
        if (!quiet) {
          toastManager.warning(translate('todo_nothing_to_move'));
        }
        return;
      }
      const albumId = await this.#album();
      const tagId = await this.#tag();
      const results = await addAssetsToAlbum({ ...authManager.params, id: albumId, bulkIdsDto: { ids } });
      const added = new Set(succeeded(results));
      const already = new Set(results.filter(({ error }) => error === BulkIdErrorReason.Duplicate).map(({ id }) => id));
      const there = ids.filter((id) => added.has(id) || already.has(id));
      const { notes, archive } = planMove(there, visibility, added);
      if (notes.length > 0) {
        await updateBulkAssetMetadata({
          assetMetadataBulkUpsertDto: {
            items: notes.map(({ id, from }) => ({ assetId: id, key: TODO_KEY, value: { from } })),
          },
        });
      }
      const tagged = there.length > 0 ? succeeded(await tagAssets({ id: tagId, bulkIdsDto: { ids: there } })) : [];
      if (archive.length > 0) {
        await updateAssets({ assetBulkUpdateDto: { ids: archive, visibility: AssetVisibility.Archive } });
      }
      this.count = (this.count ?? 0) + added.size;
      eventManager.emit('AlbumAddAssets', { assetIds: [...added], albumIds: [albumId] });
      // every live view catches up, whichever way the photos came (the album picker tells no page)
      await refreshAssets(archive);

      if (!quiet && there.length > 0) {
        const label = translate('todo_moved_count', { values: { count: there.length } });
        const entry = undoManager.record(
          label,
          async () => {
            const back = [...added];
            if (back.length > 0) {
              await removeAssetFromAlbum({ id: albumId, bulkIdsDto: { ids: back } });
              eventManager.emit('AlbumRemoveAssets', { assetIds: back, albumIds: [albumId] });
            }
            if (tagged.length > 0) {
              await untagAssets({ id: tagId, bulkIdsDto: { ids: tagged } });
            }
            if (archive.length > 0) {
              await updateAssets({ assetBulkUpdateDto: { ids: archive, visibility: AssetVisibility.Timeline } });
            }
            if (notes.length > 0) {
              await deleteBulkAssetMetadata({
                assetMetadataBulkDeleteDto: { items: notes.map(({ id }) => ({ assetId: id, key: TODO_KEY })) },
              });
            }
            this.count = Math.max(0, (this.count ?? 0) - added.size);
            await refreshAssets(archive);
            return archive.length > 0 ? translate('todo_back_count', { values: { count: archive.length } }) : undefined;
          },
          translate('todo_failed'),
        );
        toastUndoable(label, entry);
      }
      return { albumId, added: [...added], archived: archive, count: there.length };
    } catch (error) {
      handleError(error, translate('todo_failed'));
    }
  }

  /** Marks photos done: out of the album and the tag, back where they came from. Resolves with what it did. */
  async done(assets: TodoAsset[]) {
    const translate = get(t);
    try {
      const visibility = await this.#visibilities(assets);
      const ids = assets.map(({ id }) => id).filter((id) => visibility.get(id) !== undefined);
      if (ids.length === 0) {
        return;
      }
      const albumId = await this.#fetch();
      const tagId = await this.#tag();
      const notes = await this.#notes(ids);
      const back = planDone(ids, visibility, notes);
      const removed = albumId ? succeeded(await removeAssetFromAlbum({ id: albumId, bulkIdsDto: { ids } })) : [];
      const untagged = succeeded(await untagAssets({ id: tagId, bulkIdsDto: { ids } }));
      if (back.length > 0) {
        await updateAssets({ assetBulkUpdateDto: { ids: back, visibility: AssetVisibility.Timeline } });
      }
      const noted = ids.filter((id) => notes.get(id));
      if (noted.length > 0) {
        await deleteBulkAssetMetadata({
          assetMetadataBulkDeleteDto: { items: noted.map((id) => ({ assetId: id, key: TODO_KEY })) },
        });
      }
      this.count = Math.max(0, (this.count ?? 0) - removed.length);
      if (albumId && removed.length > 0) {
        eventManager.emit('AlbumRemoveAssets', { assetIds: removed, albumIds: [albumId] });
      }
      await refreshAssets(back);

      const label =
        back.length === ids.length
          ? translate('todo_back_count', { values: { count: back.length } })
          : translate('todo_done_count', { values: { count: ids.length } });
      const entry = undoManager.record(
        label,
        async () => {
          if (albumId && removed.length > 0) {
            await addAssetsToAlbum({ ...authManager.params, id: albumId, bulkIdsDto: { ids: removed } });
            eventManager.emit('AlbumAddAssets', { assetIds: removed, albumIds: [albumId] });
          }
          if (untagged.length > 0) {
            await tagAssets({ id: tagId, bulkIdsDto: { ids: untagged } });
          }
          if (back.length > 0) {
            await updateAssets({ assetBulkUpdateDto: { ids: back, visibility: AssetVisibility.Archive } });
          }
          if (noted.length > 0) {
            await updateBulkAssetMetadata({
              assetMetadataBulkUpsertDto: {
                items: noted.map((id) => ({ assetId: id, key: TODO_KEY, value: { from: notes.get(id) } })),
              },
            });
          }
          this.count = (this.count ?? 0) + removed.length;
          await refreshAssets(back);
          return translate('todo_moved_count', { values: { count: ids.length } });
        },
        translate('todo_failed'),
      );
      toastUndoable(label, entry);
      return { back, removed };
    } catch (error) {
      handleError(error, translate('todo_failed'));
    }
  }
}

export const todoManager = new TodoManager();
