// Local Omarchy layer: the undo side of everyday actions (managers/undo-manager). Each is called right after its action
// succeeded, records how to take it back, and shows the action's toast with an Undo; the undo puts the old state back
// on the server and lets every live view catch up (utils/asset-refresh, or the stack and album events). Trash and
// archive record theirs where they happen (utils/actions, utils/asset-utils), and people theirs in services/person.
import {
  addAssetsToAlbum,
  bulkTagAssets,
  createStack,
  deleteStacks,
  editAsset,
  getAssetEdits,
  getAssetInfo,
  getStack,
  removeAssetEdits,
  removeAssetFromAlbum,
  restoreAssets,
  untagAssets,
  updateAsset,
  updateAssetFavorites,
  updateAssets,
  updateStack,
  type AssetEditActionItemDto,
  type StackResponseDto,
} from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { DateTime } from 'luxon';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { waitForWebsocketEvent } from '$lib/stores/websocket';
import { refreshAssets } from '$lib/utils/asset-refresh';

type Tone = 'primary' | 'info' | 'success' | 'warning';

// a toast offering Undo stays a while: the default 3 s is gone before a hand gets there, and an album page has no bar
// undo to fall back on (Ctrl+Z still works there). A memory removed waits this long before it is deleted
// (managers/memory-manager), so the toast's Undo puts it back as it was
export const UNDO_TOAST_MS = 8000;

/** The toast of a done action, with an Undo that takes back its history entry (in the tone its own toast had: `info`
 * or `warning` for a partly done one). */
export const toastUndoable = (description: string, entry: number, tone: Tone = 'primary') => {
  const $t = get(t);
  toastManager[tone](
    {
      description,
      button: (close) => ({
        label: $t('undo'),
        onclick: () => {
          close();
          void undoManager.undo(entry);
        },
      }),
    },
    { timeout: UNDO_TOAST_MS },
  );
};

/** Favourites: taken back by setting them the other way round. */
export const favoritesDone = (ids: string[], isFavorite: boolean, description?: string) => {
  if (ids.length === 0) {
    return;
  }
  const $t = get(t);
  const count = ids.length;
  const added = $t('added_to_favorites_count', { values: { count } });
  const removed = $t('removed_from_favorites_count', { values: { count } });
  const label = description ?? (isFavorite ? added : removed);
  const entry = undoManager.record(
    label,
    async () => {
      await updateAssetFavorites({ assetFavoriteUpdateDto: { ids, isFavorite: !isFavorite } });
      await refreshAssets(ids);
      return isFavorite ? removed : added;
    },
    $t('errors.unable_to_add_remove_favorites', { values: { favorite: !isFavorite } }),
  );
  toastUndoable(label, entry);
};

// -1 is "rejected" where ratings allow it
const stars = (rating: number | null | undefined) => (rating && rating > 0 ? '★'.repeat(rating) : '–');

/** A star rating: taken back to the rating it had. Rating has no toast of its own, so it records quietly. */
export const ratingDone = (id: string, before: number | null | undefined, after: number | null) => {
  const $t = get(t);
  undoManager.record(
    `${$t('rating')} ${stars(after)}`,
    async () => {
      await updateAsset({ id, updateAssetDto: { rating: before ?? null } });
      await refreshAssets([id]);
      return `${$t('rating')} ${stars(before)}`;
    },
    $t('errors.unable_to_set_rating'),
  );
};

/** A stack as it was: its cover first, then the rest. */
type StackShape = { primaryAssetId: string; assetIds: string[] };

const shapeOf = (stack: StackResponseDto): StackShape => ({
  primaryAssetId: stack.primaryAssetId,
  assetIds: stack.assets.map(({ id }) => id),
});

/** Puts stacks back as they were (new ids; a stack whose cover is given first takes in the rest). */
const restack = async (shapes: StackShape[]) => {
  for (const { primaryAssetId, assetIds } of shapes) {
    const stack = await createStack({
      stackCreateDto: { assetIds: [primaryAssetId, ...assetIds.filter((id) => id !== primaryAssetId)] },
    });
    eventManager.emit('StackCreate', stack);
  }
};

/** The stacks the given photos are in before they are stacked (stacking moves them, and merges a stack whose cover is
 * among them); undefined when there are too many to read, and the stacking then records no undo. */
export const stacksBefore = async (assetIds: string[]): Promise<StackShape[] | undefined> => {
  if (assetIds.length > 50) {
    return undefined;
  }
  try {
    const assets = await Promise.all(assetIds.map((id) => getAssetInfo({ ...authManager.params, id })));
    const stackIds = new Set(assets.flatMap(({ stack }) => (stack ? [stack.id] : [])));
    const stacks = await Promise.all([...stackIds].map((id) => getStack({ id })));
    return stacks.map((stack) => shapeOf(stack));
  } catch {
    return undefined;
  }
};

/** Stacking: taken back by unstacking the new stack and putting the photos' old stacks back. */
export const stackedDone = (stack: StackResponseDto, before: StackShape[] | undefined) => {
  if (!before) {
    return;
  }
  const $t = get(t);
  const count = stack.assets.length;
  undoManager.record(
    $t('stacked_assets_count', { values: { count } }),
    async () => {
      await deleteStacks({ bulkIdsDto: { ids: [stack.id] } });
      eventManager.emit('StackDelete', { id: stack.id, assets: stack.assets });
      await restack(before);
      return $t('unstacked_assets_count', { values: { count } });
    },
    $t('errors.failed_to_unstack_assets'),
  );
};

/** Unstacking: taken back by stacking the photos again, each stack around its cover. */
export const unstackedDone = (stacks: StackResponseDto[], description: string) => {
  const $t = get(t);
  const shapes = stacks.map((stack) => shapeOf(stack));
  const count = shapes.reduce((sum, { assetIds }) => sum + assetIds.length, 0);
  const entry = undoManager.record(
    description,
    async () => {
      await restack(shapes);
      return $t('stacked_assets_count', { values: { count } });
    },
    $t('errors.failed_to_stack_assets'),
  );
  toastUndoable(description, entry);
};

/** A new cover: taken back to the old one. */
export const coverDone = (stackId: string, before: string) => {
  const $t = get(t);
  undoManager.record(
    $t('set_stack_primary_asset'),
    async () => {
      const stack = await updateStack({ id: stackId, stackUpdateDto: { primaryAssetId: before } });
      eventManager.emit('StackUpdate', stack);
    },
    $t('errors.something_went_wrong'),
  );
};

/** A photo taken out of its stack: taken back by stacking it under the stack's cover again. */
export const unstackedOneDone = (stack: StackResponseDto, assetId: string) => {
  const $t = get(t);
  const label = $t('removed_from_stack');
  const entry = undoManager.record(
    label,
    async () => {
      await restack([{ primaryAssetId: stack.primaryAssetId, assetIds: [assetId] }]);
      await refreshAssets([assetId]);
    },
    $t('errors.failed_to_stack_assets'),
  );
  toastUndoable(label, entry);
};

/** "Keep this, delete others": taken back by restoring the others and stacking the whole stack again. */
export const keptThisDone = (stack: StackResponseDto, trashedIds: string[], description: string) => {
  const $t = get(t);
  const shape = shapeOf(stack);
  const entry = undoManager.record(
    description,
    async () => {
      await restoreAssets({ bulkIdsDto: { ids: trashedIds } });
      await restack([shape]);
      await refreshAssets(shape.assetIds);
      return $t('assets_restored_count', { values: { count: trashedIds.length } });
    },
    $t('errors.unable_to_restore_assets'),
  );
  toastUndoable(description, entry);
};

/** Photos added to an album: taken back by removing just those that were added (not those already in it). */
export const addedToAlbumDone = (albumId: string, addedIds: string[], albumName?: string) => {
  if (addedIds.length === 0) {
    return;
  }
  const $t = get(t);
  const count = addedIds.length;
  undoManager.record(
    albumName
      ? $t('album_add_photos_added', { values: { count, album: albumName } })
      : $t('assets_added_to_album_count', { values: { count } }),
    async () => {
      await removeAssetFromAlbum({ id: albumId, bulkIdsDto: { ids: addedIds } });
      eventManager.emit('AlbumRemoveAssets', { assetIds: addedIds, albumIds: [albumId] });
      return $t('assets_removed_count', { values: { count } });
    },
    $t('errors.error_removing_assets_from_album'),
  );
};

/** Photos removed from an album: taken back by adding them again. */
export const removedFromAlbumDone = (
  albumId: string,
  removedIds: string[],
  description: string,
  tone: Tone = 'primary',
) => {
  if (removedIds.length === 0) {
    return;
  }
  const $t = get(t);
  const count = removedIds.length;
  const entry = undoManager.record(
    description,
    async () => {
      await addAssetsToAlbum({ ...authManager.params, id: albumId, bulkIdsDto: { ids: removedIds } });
      eventManager.emit('AlbumAddAssets', { assetIds: removedIds, albumIds: [albumId] });
      return $t('assets_added_to_album_count', { values: { count } });
    },
    $t('errors.error_adding_assets_to_album'),
  );
  toastUndoable(description, entry, tone);
};

// ---- dates and places: read just before the change, put back by the undo ----

/** A photo's date, place and tags as Gallery holds them (null where it has none). */
type Before = {
  date: string | null;
  timeZone: string | null;
  latitude: number | null;
  longitude: number | null;
  tags: string[];
};

/** The most photos read before a change so it can be undone (a bigger change records no undo). */
const SNAPSHOT_AT_MOST = 200;
const AT_ONCE = 8;

/** Each photo's date, place and tags before a change; undefined when there are too many to read. */
export const beforeChange = async (ids: string[]): Promise<Map<string, Before> | undefined> => {
  if (ids.length === 0 || ids.length > SNAPSHOT_AT_MOST) {
    return undefined;
  }
  const before = new Map<string, Before>();
  try {
    for (let index = 0; index < ids.length; index += AT_ONCE) {
      const assets = await Promise.all(
        ids.slice(index, index + AT_ONCE).map((id) => getAssetInfo({ ...authManager.params, id })),
      );
      for (const asset of assets) {
        const exif = asset.exifInfo;
        before.set(asset.id, {
          date: exif?.dateTimeOriginal ?? null,
          timeZone: exif?.timeZone ?? null,
          latitude: exif?.latitude ?? null,
          longitude: exif?.longitude ?? null,
          tags: (asset.tags ?? []).map(({ id }) => id),
        });
      }
    }
  } catch {
    return undefined;
  }
  return before;
};

/** Photos that share one old value go back in one call. */
const groupBy = <T>(entries: [string, T][], key: (value: T) => string) => {
  const groups = new Map<string, { value: T; ids: string[] }>();
  for (const [id, value] of entries) {
    const group = groups.get(key(value));
    if (group) {
      group.ids.push(id);
    } else {
      groups.set(key(value), { value, ids: [id] });
    }
  }
  return [...groups.values()];
};

/** What an undo says: done, and (for dates and places) how many had nothing to go back to (Gallery cannot take a
 * date or a place away from a photo, only change it). */
export const undone = (label: string, kept = 0) => {
  const $t = get(t);
  const done = $t('undone', { values: { action: label } });
  return kept > 0 ? `${done}. ${$t('undo_kept_new', { values: { count: kept } })}` : done;
};

/** A date change (one photo or many, to a date or by an offset): undone by giving each photo its old date and time
 * zone back. The time goes back with its own offset; a named zone (Asia/Bangkok) goes back by name. */
export const datesDone = (ids: string[], before: Map<string, Before> | undefined) => {
  if (!before) {
    return;
  }
  const $t = get(t);
  const label = `${$t('change_date')} · ${$t('items_count', { values: { count: ids.length } })}`;
  const entry = undoManager.record(
    label,
    async () => {
      const dated = [...before].filter(([, value]) => value.date !== null);
      const groups = groupBy(dated, (value) => `${value.date}|${value.timeZone}`);
      for (const { value, ids: group } of groups) {
        const zone = value.timeZone ?? 'UTC';
        const at = DateTime.fromISO(value.date!, { zone: 'utc' }).setZone(zone);
        const dateTimeOriginal = (at.isValid ? at : DateTime.fromISO(value.date!, { zone: 'utc' })).toISO();
        if (!dateTimeOriginal) {
          continue;
        }
        await updateAssets({
          assetBulkUpdateDto: {
            ids: group,
            dateTimeOriginal,
            // a named zone keeps its name (an offset alone would come back as UTC+7)
            ...(value.timeZone?.includes('/') && { timeZone: value.timeZone }),
          },
        });
      }
      await refreshAssets(ids);
      return undone(label, before.size - dated.length);
    },
    $t('errors.unable_to_change_date'),
  );
  toastUndoable(label, entry);
};

/** A place change: undone by moving each photo back to its old coordinates. */
export const placesDone = (ids: string[], before: Map<string, Before> | undefined) => {
  if (!before) {
    return;
  }
  const $t = get(t);
  const label = `${$t('change_location')} · ${$t('items_count', { values: { count: ids.length } })}`;
  const entry = undoManager.record(
    label,
    async () => {
      const placed = [...before].filter(([, value]) => value.latitude !== null && value.longitude !== null);
      const groups = groupBy(placed, (value) => `${value.latitude},${value.longitude}`);
      for (const { value, ids: group } of groups) {
        await updateAssets({
          assetBulkUpdateDto: { ids: group, latitude: value.latitude!, longitude: value.longitude! },
        });
      }
      await refreshAssets(ids);
      return undone(label, before.size - placed.length);
    },
    $t('errors.unable_to_update_location'),
  );
  toastUndoable(label, entry);
};

// ---- descriptions, tags and edits ----

/** A description change: undone by putting the old words back. */
export const descriptionDone = (asset: { id: string; originalFileName: string }, before: string) => {
  const $t = get(t);
  const label = `${$t('description')} · ${asset.originalFileName}`;
  const entry = undoManager.record(
    label,
    async () => {
      await updateAsset({ id: asset.id, updateAssetDto: { description: before } });
      await refreshAssets([asset.id]);
      return undone(label);
    },
    $t('cannot_update_the_description'),
  );
  toastUndoable($t('asset_description_updated'), entry);
};

/** Tagging: undone by taking each tag off just the photos that did not have it before (read by beforeChange), so a
 * tag a photo already had stays on it. Too many photos to read beforehand: the plain toast, no undo. */
export const taggedDone = (
  assetIds: string[],
  tagIds: string[],
  before: Map<string, Before> | undefined,
  description: string,
) => {
  const $t = get(t);
  const added = before
    ? tagIds
        .map((tagId) => ({ tagId, ids: assetIds.filter((id) => before.get(id)?.tags.includes(tagId) === false) }))
        .filter(({ ids }) => ids.length > 0)
    : [];
  if (added.length === 0) {
    toastManager.primary(description);
    return;
  }
  const entry = undoManager.record(
    description,
    async () => {
      for (const { tagId, ids } of added) {
        await untagAssets({ id: tagId, bulkIdsDto: { ids } });
      }
      const ids = [...new Set(added.flatMap(({ ids }) => ids))];
      eventManager.emit('AssetsTag', ids);
      await refreshAssets(ids);
      return $t('removed_tagged_assets', { values: { count: ids.length } });
    },
    $t('errors.something_went_wrong'),
  );
  toastUndoable(description, entry);
};

/** A tag taken off a photo: undone by tagging it again. */
export const untaggedDone = (assetId: string, tag: { id: string; value: string }) => {
  const $t = get(t);
  const label = `${$t('removed_tagged_assets', { values: { count: 1 } })} · ${tag.value}`;
  const entry = undoManager.record(
    label,
    async () => {
      await bulkTagAssets({ tagBulkAssetsDto: { assetIds: [assetId], tagIds: [tag.id] } });
      eventManager.emit('AssetsTag', [assetId]);
      await refreshAssets([assetId]);
      return $t('tagged_assets', { values: { count: 1 } });
    },
    $t('errors.failed_to_tag_assets'),
  );
  toastUndoable(label, entry);
};

type Edits = AssetEditActionItemDto[];

/** A photo's edits as the server holds them (crop, rotation, mirror, trim), in the shape it takes them back in. */
export const editsOf = async (id: string): Promise<Edits> => {
  const { edits } = await getAssetEdits({ id });
  return edits.map(({ action, parameters }) => ({ action, parameters }));
};

/** Rotations and the editor's edits: undone by giving each photo its edits from before, then waiting until the server
 * has drawn them again (a video takes longer). `toast` is the action's own toast, which gains the Undo; without one
 * the undo is recorded quietly, as a quick rotate has no toast of its own. */
export const editsDone = (
  label: string,
  before: { id: string; edits: Edits }[],
  { video = false, toast, tone = 'primary' }: { video?: boolean; toast?: string; tone?: Tone } = {},
) => {
  if (before.length === 0) {
    // nothing was changed (every one failed): the toast alone
    if (toast) {
      toastManager[tone](toast);
    }
    return;
  }
  const $t = get(t);
  const entry = undoManager.record(
    label,
    async () => {
      const drawn: Promise<unknown>[] = [];
      for (const { id, edits } of before) {
        const ready = waitForWebsocketEvent(
          'AssetEditReadyV2',
          (event) => event.asset.id === id,
          video ? 30_000 : 10_000,
        );
        // a request that fails leaves nobody waiting for the redraw
        ready.catch(() => {});
        await (edits.length === 0 ? removeAssetEdits({ id }) : editAsset({ id, assetEditsCreateDto: { edits } }));
        drawn.push(ready);
      }
      // a photo the server is slow to draw again has its edits back all the same; it shows once drawn
      await Promise.allSettled(drawn);
      const ids = before.map(({ id }) => id);
      await refreshAssets(ids);
      for (const id of ids) {
        eventManager.emit('AssetEditsApplied', id);
      }
      return undone(label);
    },
    $t('editor_edits_applied_error'),
  );
  if (toast) {
    toastUndoable(toast, entry, tone);
  }
};
