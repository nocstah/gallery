// Local Omarchy layer: what Kioku's right-click menu offers on each page with a photo grid (PhotoMenu). A page's menu
// offers what that page's own selection bar offers, and only that; the menu draws them in its own order, the Photos
// menu's (TileContextMenu): what a person does most, the downloads, then the edits and the ways out. The Photos page,
// an album and the Locked Folder draw their menus themselves; a Space's follows its bar's capabilities (spaceOffer).
// Like the Photos menu, none offers the bars' maintenance jobs or Link Live Photo.
import type { AssetResponseDto } from '@immich/sdk';
import type { SelectionCapabilities } from '$lib/managers/selection-capabilities';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import { toTimelineAsset } from '$lib/utils/timeline-util';

export type PhotoMenuAction =
  /** the trash's own: back out of the trash */
  | 'restore'
  /** Favorite, or Unfavorite when every photo is one */
  | 'favorite'
  /** the favourites' own: Unfavorite, which takes the photos off the page */
  | 'unfavorite'
  | 'addToAlbum'
  | 'newAlbum'
  | 'share'
  /** To do, Villa: the special albums this library offers */
  | 'specialAlbums'
  | 'download'
  | 'rotate'
  /** Stack and Unstack, on a timeline (not on search results) */
  | 'stack'
  | 'tag'
  | 'changeDate'
  | 'changeLocation'
  | 'changeDescription'
  /** a Space's or a Space album's cover, from one photo */
  | 'setCover'
  /** the person page's own: Fix incorrect match */
  | 'fixMatch'
  | 'removeFromAlbum'
  | 'removeFromSpace'
  /** Move to <library> (gallery/moves), which gates itself */
  | 'move'
  /** Archive, or Unarchive when every photo is archived */
  | 'archive'
  /** the archive's own: Unarchive */
  | 'unarchive'
  /** Move to Locked Folder */
  | 'setVisibility'
  | 'delete'
  /** the trash's own: Delete permanently */
  | 'deletePermanently';

export type PhotoMenuOffer = {
  /** offered for any selection the page's bar acts on */
  readonly actions: readonly PhotoMenuAction[];
  /** offered only while every selected photo is the viewer's own, where the page's bar asks the same */
  readonly whenOwned?: readonly PhotoMenuAction[];
};

const KEEP = ['favorite', 'addToAlbum', 'newAlbum', 'share', 'download'] as const;
const EDITS = ['tag', 'changeDate', 'changeLocation', 'changeDescription'] as const;
const OUT = ['archive', 'setVisibility', 'delete'] as const;

/**
 * Each page's menu, read off its selection bar (its buttons, its ⋮, and Show selected's Share, New album and Add to
 * album where the bar keeps them).
 */
export const photoMenuOffers = {
  /** a person's photos: the bar's ⋮ holds Fix incorrect match and Move to <library>, with the person */
  person: { actions: [...KEEP, ...EDITS, 'fixMatch', 'move', ...OUT] },
  archive: { actions: [...KEEP, 'rotate', 'unarchive', 'setVisibility', 'delete'] },
  favorites: { actions: ['unfavorite', 'addToAlbum', 'newAlbum', 'share', 'download', 'rotate', ...EDITS, ...OUT] },
  /** the trash: no Share or Add to album, so no Show selected either */
  trash: { actions: ['restore', 'deletePermanently'] },
  tags: { actions: [...KEEP, 'rotate', ...EDITS, ...OUT] },
  folders: { actions: [...KEEP, 'rotate', ...EDITS, ...OUT] },
  /** a memory's photos: no Move to Locked Folder in its bar */
  memory: { actions: [...KEEP, ...EDITS, 'archive', 'delete'] },
  /** the search page: its ⋮ and the special albums only for the viewer's own photos, else Download */
  search: { actions: KEEP, whenOwned: ['specialAlbums', 'rotate', ...EDITS, ...OUT] },
  recentlyAdded: { actions: KEEP, whenOwned: ['stack', ...EDITS, ...OUT] },
  /** the map's photos beside it */
  map: { actions: KEEP, whenOwned: ['stack', ...EDITS, ...OUT] },
  /** a partner's photos are theirs to change: only Download */
  partner: { actions: ['download'] },
} as const satisfies Record<string, PhotoMenuOffer>;

/** The pages with a menu of their own here, named as above. */
export type PhotoMenuPage = keyof typeof photoMenuOffers;

/** Where a page's photos are: its timeline, or a gallery of photos (GalleryViewer: a folder, the search, results). */
export const TIMELINE_GRID = '#asset-grid';
export const GALLERY_GRID = '[data-testid="gallery-viewer"]';

/** What an offer holds for this selection: everything, or without its owner-only part. */
export const offeredActions = (offer: PhotoMenuOffer, allOwned: boolean): ReadonlySet<PhotoMenuAction> =>
  new Set([...offer.actions, ...(allOwned ? (offer.whenOwned ?? []) : [])]);

/**
 * A Space's menu (its timeline and search results, a Space album, a Space person): what its selection bar
 * (SelectionToolbar) shows for these capabilities, which the bar works out from the viewer's role in the Space and the
 * photos they may edit (#734). Show selected's New album goes with Add to album there too.
 */
export const spaceOffer = (caps: SelectionCapabilities): PhotoMenuOffer => {
  const actions: PhotoMenuAction[] = [];
  const offer = (allowed: boolean, ...some: PhotoMenuAction[]) => {
    if (allowed) {
      actions.push(...some);
    }
  };
  offer(caps.canFavorite, 'favorite');
  offer(caps.canAddToAlbum, 'addToAlbum', 'newAlbum');
  offer(caps.canShare, 'share');
  offer(caps.canDownload, 'download');
  offer(caps.canSetCover, 'setCover');
  offer(caps.canEditMetadata, 'rotate', 'changeDate', 'changeLocation', 'changeDescription');
  offer(caps.canTag, 'tag');
  offer(caps.canRemoveFromAlbum, 'removeFromAlbum');
  offer(caps.canRemoveFromSpace, 'removeFromSpace');
  offer(caps.canSetVisibility, 'archive', 'setVisibility');
  offer(caps.canDelete, 'delete');
  return { actions };
};

/** Finds a right-clicked photo in a page's timeline, or among the search results it shows instead. */
export const findTimelinePhoto =
  (timelineManager: TimelineManager | undefined, results: AssetResponseDto[] | undefined) =>
  (id: string): TimelineAsset | undefined => {
    if (results) {
      const found = results.find((asset) => asset.id === id);
      return found ? toTimelineAsset(found) : undefined;
    }
    return timelineManager?.getTimelineMonthByAssetId(id)?.findAssetById({ id });
  };
