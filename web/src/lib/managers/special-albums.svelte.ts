// Local Omarchy layer: special albums, places that keep photos out of Photos. To do came first: the user asked for "a
// special album called todo, where I can easily send photos for dealing with later; they are removed from the main
// list, tagged todo and only show under the todo album". Villa followed: "another special album called Villa, that works
// in a similar way as todo", and QR for the bank slips: "they should all be in one album similar to villa and todo
// called QR" (Curator's slips.archive files new ones there, utilities/slips reads their amounts). Moving a photo into one puts it in the album, tags it with the album's name and archives
// it, which is Gallery's own way of taking a photo out of Photos (so, like every archived photo, it also shows under
// Archive). Each photo notes where it came from in Gallery's per-photo metadata (a key per album), and taking it out
// again (Mark done, Remove from Villa) puts it back there: into Photos, or left in Archive when it was archived before;
// never out of the Locked Folder, and not while another special album still holds it. Both are undoable (the bar,
// Ctrl+Z, the toast). Every way into these albums goes through here (the album picker, the album's own Add photos,
// uploads into it: services/album.service), so a photo is never in one of them and in Photos too.
import {
  addAssetsToAlbum,
  AssetOrder,
  AssetVisibility,
  BulkIdErrorReason,
  createAlbum,
  deleteBulkAssetMetadata,
  getAllAlbums,
  getAssetInfo,
  getAssetMetadata,
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
import {
  mdiClipboardCheckOutline,
  mdiClipboardTextClock,
  mdiClipboardTextClockOutline,
  mdiHome,
  mdiHomeMinusOutline,
  mdiHomeOutline,
  mdiQrcode,
  mdiQrcodeRemove,
  mdiQrcodeScan,
} from '@mdi/js';
import { t, type Translations } from 'svelte-i18n';
import { get } from 'svelte/store';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { refreshAssets } from '$lib/utils/asset-refresh';
import { handleError } from '$lib/utils/handle-error';
import { toastUndoable } from '$lib/utils/undoable';

export type From = 'timeline' | 'archive';
/** A photo as the caller knows it; a missing visibility is read from Gallery. */
export type SpecialAsset = { id: string; visibility?: string; ownerId?: string };
export type Note = { id: string; from: From };

/** The i18n keys an album speaks with. */
type Words = {
  /** its name in the sidebar and the palette */
  label: Translations;
  /** into the album, and the toast after it (with a count) */
  move: Translations;
  moved: Translations;
  /** out of it, and the toast after it when not every photo went back to Photos */
  done: Translations;
  doneCount: Translations;
  failed: Translations;
  /** nothing selected could go there (someone else's photos, the Locked Folder) */
  nothing: Translations;
  /** one line under the album's title */
  note: Translations;
  /** the album with nothing in it, and /todo before the album exists */
  emptyTitle: Translations;
  emptyBody: Translations;
};

type Config = {
  /** the album's and the tag's name: data, so the same in every language */
  name: string;
  /** where each photo notes where it came from, in Gallery's per-photo metadata */
  key: string;
  /** the sidebar's page (/todo): the album, or how to fill it before it exists */
  slug: string;
  /** moves the selection in, and takes it out inside the album */
  shortcut: string;
  icon: string;
  activeIcon: string;
  /** the way out */
  doneIcon: string;
  words: Words;
  /** Local Omarchy layer: the owner's own (the villa, bank slips), never offered to a family account */
  ownerOnly?: boolean;
  /** Local Omarchy layer: what it holds is not for looking at (bank slips), so its cover is its icon, never a photo */
  iconCover?: boolean;
};

const AT_ONCE = 8;

/** Reads something for every id, a few at a time; undefined where the read fails. */
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

const asFrom = (value: unknown): From | undefined => (value === 'timeline' || value === 'archive' ? value : undefined);

/**
 * What moving into a special album changes: a photo on the timeline is archived and notes that it came from Photos.
 * One already archived notes where it came from when it is new to the album: from Photos when another special album
 * took it out of there (that album's note says so), else from Archive. One already in the album keeps its note.
 */
export const planMove = (
  ids: string[],
  visibility: ReadonlyMap<string, string | undefined>,
  added: ReadonlySet<string>,
  elsewhere?: ReadonlyMap<string, From | undefined>,
) => {
  const notes: Note[] = [];
  const archive: string[] = [];
  for (const id of ids) {
    const where = visibility.get(id);
    if (where === AssetVisibility.Timeline) {
      notes.push({ id, from: 'timeline' });
      archive.push(id);
    } else if (where === AssetVisibility.Archive && added.has(id)) {
      notes.push({ id, from: elsewhere?.get(id) === 'timeline' ? 'timeline' : 'archive' });
    }
  }
  return { notes, archive };
};

/**
 * The photos taking them out puts back in Photos: those that came from there and are still archived, unless another
 * special album still holds them (they come back when the last one lets go). A photo that was archived before stays
 * archived, and so does one with no note; one moved to the Locked Folder stays locked.
 */
export const planDone = (
  ids: string[],
  visibility: ReadonlyMap<string, string | undefined>,
  notes: ReadonlyMap<string, From | undefined>,
  elsewhere?: ReadonlyMap<string, From | undefined>,
) =>
  ids.filter(
    (id) => notes.get(id) === 'timeline' && visibility.get(id) === AssetVisibility.Archive && !elsewhere?.get(id),
  );

export class SpecialAlbumManager {
  readonly name: string;
  readonly key: string;
  readonly slug: string;
  readonly shortcut: string;
  readonly icon: string;
  readonly activeIcon: string;
  readonly doneIcon: string;
  readonly words: Words;
  readonly ownerOnly: boolean;
  readonly iconCover: boolean;
  /** the album, once known */
  albumId = $state<string | undefined>();
  /** how many photos it holds (the sidebar shows it) */
  count = $state<number | undefined>();
  #looking: Promise<string | undefined> | undefined;
  #checked = false;

  constructor({
    name,
    key,
    slug,
    shortcut,
    icon,
    activeIcon,
    doneIcon,
    words,
    ownerOnly = false,
    iconCover = false,
  }: Config) {
    this.name = name;
    this.key = key;
    this.slug = slug;
    this.shortcut = shortcut;
    this.icon = icon;
    this.activeIcon = activeIcon;
    this.doneIcon = doneIcon;
    this.words = words;
    this.ownerOnly = ownerOnly;
    this.iconCover = iconCover;
  }

  /**
   * Local Omarchy layer: whether whoever is signed in has this album ("Hide Villa and QR, keep To do"): To do is
   * everyone's; Villa and QR are the owner's own workflows, the server's admin's. A family account is offered neither,
   * its keys don't move photos there, and an album of its own that happens to bear the name is just an album.
   */
  get offered() {
    return !this.ownerOnly || (authManager.authenticated && authManager.user.isAdmin);
  }

  get route() {
    return `/${this.slug}`;
  }

  isAlbum(albumId: string | null | undefined) {
    return !!albumId && albumId === this.albumId;
  }

  /** The album's page, or a photo open in it. */
  isAlbumPath(pathname: string) {
    return !!this.albumId && pathname.startsWith(`/albums/${this.albumId}`);
  }

  /** The album by its name (the user's own), so a renamed or deleted one is noticed; throws when Gallery can't say. */
  async #fetch() {
    if (!this.offered) {
      this.albumId = undefined;
      this.count = undefined;
      return;
    }
    const [album] = await getAllAlbums({ name: this.name, isOwned: true });
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
    const album = await createAlbum({ createAlbumDto: { albumName: this.name } });
    // newest first, as in Photos
    await updateAlbumInfo({ id: album.id, updateAlbumDto: { order: AssetOrder.Desc } }).catch(() => undefined);
    this.albumId = album.id;
    this.count = 0;
    return album.id;
  }

  async #tag() {
    const [tag] = await upsertTags({ tagUpsertDto: { tags: [this.name] } });
    return tag.id;
  }

  /** Each photo's visibility as the caller knows it, else as Gallery has it; undefined for someone else's photo. */
  async #visibilities(assets: SpecialAsset[]) {
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

  /**
   * This album's note on each photo, and where the other special albums holding it say it came from (Photos wins):
   * one read per photo, its whole metadata.
   */
  async #notes(ids: string[]) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const mine = new Map<string, From | undefined>();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const elsewhere = new Map<string, From | undefined>();
    for (const [id, items] of await readEach(ids, (id) => getAssetMetadata({ id }))) {
      for (const { key, value } of items ?? []) {
        const from = asFrom(value?.from);
        if (key === this.key) {
          mine.set(id, from);
        } else if (from && elsewhere.get(id) !== 'timeline' && specialAlbums.some((album) => album.key === key)) {
          elsewhere.set(id, from);
        }
      }
    }
    return { mine, elsewhere };
  }

  /** Whether taking this photo out would put it back in Photos (the viewer moves on first when it would). */
  async wouldReturn(asset: SpecialAsset) {
    const visibility = await this.#visibilities([asset]);
    const { mine, elsewhere } = await this.#notes([asset.id]);
    return planDone([asset.id], visibility, mine, elsewhere).length > 0;
  }

  /**
   * Moves photos in: into the album, tagged, out of Photos. Quiet (an upload into the album) skips the toast and the
   * undo. Resolves with what it did, or undefined when nothing moved.
   */
  async move(assets: SpecialAsset[], { quiet = false }: { quiet?: boolean } = {}) {
    if (!this.offered) {
      return;
    }
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
          toastManager.warning(translate(this.words.nothing));
        }
        return;
      }
      const albumId = await this.#album();
      const tagId = await this.#tag();
      const results = await addAssetsToAlbum({ ...authManager.params, id: albumId, bulkIdsDto: { ids } });
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const added = new Set(succeeded(results));
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const already = new Set(results.filter(({ error }) => error === BulkIdErrorReason.Duplicate).map(({ id }) => id));
      const there = ids.filter((id) => added.has(id) || already.has(id));
      // an archived photo new here may be out of Photos only because another special album holds it
      const { elsewhere } = await this.#notes(
        there.filter((id) => added.has(id) && visibility.get(id) === AssetVisibility.Archive),
      );
      const { notes, archive } = planMove(there, visibility, added, elsewhere);
      if (notes.length > 0) {
        await updateBulkAssetMetadata({
          assetMetadataBulkUpsertDto: {
            items: notes.map(({ id, from }) => ({ assetId: id, key: this.key, value: { from } })),
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
        const label = translate(this.words.moved, { values: { count: there.length } });
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
            // one another special album took in meanwhile stays out of Photos
            const { elsewhere: held } = await this.#notes(archive);
            const free = archive.filter((id) => !held.get(id));
            if (free.length > 0) {
              await updateAssets({ assetBulkUpdateDto: { ids: free, visibility: AssetVisibility.Timeline } });
            }
            if (notes.length > 0) {
              await deleteBulkAssetMetadata({
                assetMetadataBulkDeleteDto: { items: notes.map(({ id }) => ({ assetId: id, key: this.key })) },
              });
            }
            this.count = Math.max(0, (this.count ?? 0) - added.size);
            await refreshAssets(free);
            return free.length > 0 ? translate('back_in_photos_count', { values: { count: free.length } }) : undefined;
          },
          translate(this.words.failed),
        );
        toastUndoable(label, entry);
      }
      return { albumId, added: [...added], archived: archive, count: there.length };
    } catch (error) {
      handleError(error, translate(this.words.failed));
    }
  }

  /** Takes photos out: out of the album and the tag, back where they came from. Resolves with what it did. */
  async done(assets: SpecialAsset[]) {
    const translate = get(t);
    try {
      const visibility = await this.#visibilities(assets);
      const ids = assets.map(({ id }) => id).filter((id) => visibility.get(id) !== undefined);
      if (ids.length === 0) {
        return;
      }
      const albumId = await this.#fetch();
      const tagId = await this.#tag();
      const { mine: notes, elsewhere } = await this.#notes(ids);
      const back = planDone(ids, visibility, notes, elsewhere);
      const removed = albumId ? succeeded(await removeAssetFromAlbum({ id: albumId, bulkIdsDto: { ids } })) : [];
      const untagged = succeeded(await untagAssets({ id: tagId, bulkIdsDto: { ids } }));
      if (back.length > 0) {
        await updateAssets({ assetBulkUpdateDto: { ids: back, visibility: AssetVisibility.Timeline } });
      }
      const noted = ids.filter((id) => notes.get(id));
      if (noted.length > 0) {
        await deleteBulkAssetMetadata({
          assetMetadataBulkDeleteDto: { items: noted.map((id) => ({ assetId: id, key: this.key })) },
        });
      }
      this.count = Math.max(0, (this.count ?? 0) - removed.length);
      if (albumId && removed.length > 0) {
        eventManager.emit('AlbumRemoveAssets', { assetIds: removed, albumIds: [albumId] });
      }
      await refreshAssets(back);

      const label =
        back.length === ids.length
          ? translate('back_in_photos_count', { values: { count: back.length } })
          : translate(this.words.doneCount, { values: { count: ids.length } });
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
                items: noted.map((id) => ({ assetId: id, key: this.key, value: { from: notes.get(id) } })),
              },
            });
          }
          this.count = (this.count ?? 0) + removed.length;
          await refreshAssets(back);
          return translate(this.words.moved, { values: { count: ids.length } });
        },
        translate(this.words.failed),
      );
      toastUndoable(label, entry);
      return { back, removed };
    } catch (error) {
      handleError(error, translate(this.words.failed));
    }
  }
}

export const todoManager = new SpecialAlbumManager({
  name: 'To do',
  key: 'omarchy-todo',
  slug: 'todo',
  shortcut: 'b',
  icon: mdiClipboardTextClockOutline,
  activeIcon: mdiClipboardTextClock,
  doneIcon: mdiClipboardCheckOutline,
  words: {
    label: 'todo',
    move: 'todo_move',
    moved: 'todo_moved_count',
    done: 'todo_mark_done',
    doneCount: 'todo_done_count',
    failed: 'todo_failed',
    nothing: 'todo_nothing_to_move',
    note: 'todo_note',
    emptyTitle: 'todo_empty_title',
    emptyBody: 'todo_empty_body',
  },
});

export const villaManager = new SpecialAlbumManager({
  name: 'Villa',
  key: 'omarchy-villa',
  ownerOnly: true,
  slug: 'villa',
  shortcut: 'v',
  icon: mdiHomeOutline,
  activeIcon: mdiHome,
  doneIcon: mdiHomeMinusOutline,
  words: {
    label: 'villa',
    move: 'villa_move',
    moved: 'villa_moved_count',
    done: 'villa_remove',
    doneCount: 'villa_removed_count',
    failed: 'villa_failed',
    nothing: 'villa_nothing_to_move',
    note: 'villa_note',
    emptyTitle: 'villa_empty_title',
    emptyBody: 'villa_empty_body',
  },
});

export const qrManager = new SpecialAlbumManager({
  name: 'QR',
  key: 'omarchy-qr',
  ownerOnly: true,
  iconCover: true,
  slug: 'qr',
  shortcut: 'q',
  icon: mdiQrcode,
  activeIcon: mdiQrcodeScan,
  doneIcon: mdiQrcodeRemove,
  words: {
    label: 'qr',
    move: 'qr_move',
    moved: 'qr_moved_count',
    done: 'qr_remove',
    doneCount: 'qr_removed_count',
    failed: 'qr_failed',
    nothing: 'qr_nothing_to_move',
    note: 'qr_note',
    emptyTitle: 'qr_empty_title',
    emptyBody: 'qr_empty_body',
  },
});

/** Every special album, in sidebar order. */
export const specialAlbums: readonly SpecialAlbumManager[] = [todoManager, villaManager, qrManager];

/** Local Omarchy layer: the special albums whoever is signed in has (`offered`): all three for the owner, To do for a
 * family account. Rows, buttons, menu items and keys come from this; lookups by id go through every one. */
export const offeredSpecialAlbums = () => specialAlbums.filter((special) => special.offered);

/** The special album with this id, if it is one. */
export const specialAlbumOf = (albumId: string | null | undefined) =>
  specialAlbums.find((album) => album.isAlbum(albumId));
