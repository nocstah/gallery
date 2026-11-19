import { notifyAddToAlbum } from '#lib/gallery/album/notify-add-to-album.ts';
import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { specialAlbumOf, specialAlbums } from '#lib/managers/special-albums.svelte.ts';
import {
  addAssetsToAlbumsMutation,
  createAlbumMutation,
  invalidateAlbum,
  invalidateAlbums,
} from '#lib/queries/album.query.ts';
import { executeMutation } from '#lib/queries/client.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import { rememberLastAlbum } from '#lib/utils/last-album.ts';
import { addedToAlbumDone } from '#lib/utils/undoable.ts';
import { BulkIdErrorReason, addAssetsToAlbum } from '@immich/sdk';

/**
Single-album add that reports WHICH assets the server accepted.

`POST /albums/:id/assets` answers HTTP 200 with per-asset outcomes, so "the call did not throw"
is not "every photo landed" — an asset can come back `success:false, error:no_permission`. A
caller that paints the whole selection into the album on a non-throwing call shows photos that
disappear on the next reload. Cross-owner adds make that routine, because an asset visible
through a space is not necessarily one the #764 contribution path will accept.

Upstream's addAssetsToAlbumsMutation (album.query.ts) only resolves the raw results; this keeps
the same event and query invalidation it performs.
*/
export const addAssetsToAlbumWithOutcome = async (
  albumId: string,
  assetIds: string[],
  // Local Omarchy layer: the album's name, where the caller has it (the picker, a sidebar drop, the album's own page),
  // for a notice and an undo that say where the photos went
  { notify, albumName }: { notify: boolean; albumName?: string },
): Promise<{ ok: boolean; addedIds: string[]; deniedIds: string[] }> => {
  const $t = await getFormatter();

  // Local Omarchy layer: a special album (To do, Villa) takes photos its own way, tagged and out of Photos too
  // (managers/special-albums); an upload into it (no notice) goes quietly
  await Promise.all(specialAlbums.map((album) => album.ready()));
  const special = specialAlbumOf(albumId);
  if (special) {
    const moved = await special.move(
      assetIds.map((id) => ({ id })),
      { quiet: !notify },
    );
    return moved ? { ok: true, addedIds: moved.added, deniedIds: [] } : { ok: false, addedIds: [], deniedIds: [] };
  }

  try {
    const results = await addAssetsToAlbum({ ...authManager.params, id: albumId, bulkIdsDto: { ids: assetIds } });
    if (notify) {
      notifyAddToAlbum($t, albumId, assetIds, results, albumName);
    }
    eventManager.emit('AlbumAddAssets', { assetIds, albumIds: [albumId] });
    await Promise.all([invalidateAlbum(albumId), invalidateAlbums()]);
    const addedIds = results.filter(({ success }) => success).map(({ id }) => id);
    // Local Omarchy layer: the photos this added (not those already there) can be taken out again from the bar's undo
    addedToAlbumDone(albumId, addedIds, albumName);
    // and a person's add (not an upload's) makes this the album the Add to album picker offers first
    if (notify) {
      rememberLastAlbum(albumId);
    }
    return {
      ok: true,
      addedIds,
      // An asset already in the album comes back `success:false, error:duplicate`. That is not a
      // refusal — the photo is already where the caller wanted it and there is nothing to retry —
      // so it must not be lumped in with a genuine permission denial.
      deniedIds: results
        .filter(({ success, error }) => !success && error !== BulkIdErrorReason.Duplicate)
        .map(({ id }) => id),
    };
  } catch (error) {
    handleError(error, $t('errors.error_adding_assets_to_album'));
    return { ok: false, addedIds: [], deniedIds: [] };
  }
};

/**
Add to one or more albums through upstream's addAssetsToAlbumsMutation, resolving whether the call
succeeded. Keeps the boolean call shape the unified album + Space picker (#708) composes into one
aggregate toast. executeMutation swallows the error (the mutation toasts it) and resolves undefined.
Local Omarchy layer: one album goes through addAssetsToAlbumWithOutcome instead, for To do and Villa's own way, the
notice that names the album, the undo and the album the picker offers first.
*/
export const addAssetsToAlbums = async (
  albumIds: string[],
  assetIds: string[],
  { notify, albumName }: { notify: boolean; albumName?: string },
): Promise<boolean> => {
  if (albumIds.length === 0) {
    return true;
  }

  if (albumIds.length === 1) {
    const { ok } = await addAssetsToAlbumWithOutcome(albumIds[0], assetIds, { notify, albumName });
    return ok;
  }

  // Local Omarchy layer: a special album among several still takes its photos its own way
  const special = albumIds.find((id) => specialAlbumOf(id));
  if (special) {
    const [moved, rest] = await Promise.all([
      addAssetsToAlbumWithOutcome(special, assetIds, { notify }),
      addAssetsToAlbums(
        albumIds.filter((id) => id !== special),
        assetIds,
        { notify },
      ),
    ]);
    return moved.ok && rest;
  }

  return (await executeMutation(() => addAssetsToAlbumsMutation({ notify }), { albumIds, assetIds })) !== undefined;
};

/**
Create an album through upstream's createAlbumMutation (which toasts a failure), resolving the album
or undefined. Keeps the call shape the fork's Google Takeout import and Space album creation use.
*/
export const createAlbum = (albumName = '', assetIds?: string[]) =>
  executeMutation(createAlbumMutation, [{ createAlbumDto: { albumName, assetIds } }]);
