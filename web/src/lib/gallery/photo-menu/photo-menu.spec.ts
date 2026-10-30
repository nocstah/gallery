import type { SelectionCapabilities } from '$lib/managers/selection-capabilities';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import { assetFactory, timelineAssetFactory } from '@test-data/factories/asset-factory';
import { findTimelinePhoto, offeredActions, photoMenuOffers, spaceOffer, type PhotoMenuAction } from './photo-menu';

// Local Omarchy layer: what each page's right-click menu offers (gallery/photo-menu), as its selection bar does.

const none: SelectionCapabilities = {
  canSelectAll: false,
  canDownload: false,
  canShare: false,
  shareScopedToSpace: false,
  canAddToAlbum: false,
  canFavorite: false,
  canEditMetadata: false,
  canSetVisibility: false,
  canTag: false,
  canDelete: false,
  canSetCover: false,
  canRemoveFromAlbum: false,
  canRemoveFromSpace: false,
};

const everything = (page: keyof typeof photoMenuOffers): PhotoMenuAction[] => {
  const offer = photoMenuOffers[page];
  return [...offer.actions, ...('whenOwned' in offer ? offer.whenOwned : [])];
};

describe('photoMenuOffers', () => {
  it('names each action once a page', () => {
    for (const page of Object.keys(photoMenuOffers) as (keyof typeof photoMenuOffers)[]) {
      expect({ page, actions: new Set(everything(page)).size }).toEqual({ page, actions: everything(page).length });
    }
  });

  it('keeps each page’s own actions to that page', () => {
    const pagesWith = (action: PhotoMenuAction) =>
      (Object.keys(photoMenuOffers) as (keyof typeof photoMenuOffers)[]).filter((page) =>
        everything(page).includes(action),
      );
    expect(pagesWith('fixMatch')).toEqual(['person']);
    expect(pagesWith('move')).toEqual(['person']);
    expect(pagesWith('unarchive')).toEqual(['archive']);
    expect(pagesWith('unfavorite')).toEqual(['favorites']);
    expect(pagesWith('restore')).toEqual(['trash']);
    expect(pagesWith('deletePermanently')).toEqual(['trash']);
    expect(pagesWith('specialAlbums')).toEqual(['search']);
  });

  it('offers a partner’s photos for download only', () => {
    expect(everything('partner')).toEqual(['download']);
  });

  it('adds the owner-only part only for the viewer’s own photos', () => {
    expect(offeredActions(photoMenuOffers.search, false).has('delete')).toBe(false);
    expect(offeredActions(photoMenuOffers.search, true).has('delete')).toBe(true);
    expect(offeredActions(photoMenuOffers.search, false).has('download')).toBe(true);
  });
});

describe('spaceOffer', () => {
  it('offers nothing the bar does not', () => {
    expect(spaceOffer(none).actions).toEqual([]);
  });

  it('follows each of the bar’s capabilities', () => {
    expect(spaceOffer({ ...none, canFavorite: true, canDownload: true }).actions).toEqual(['favorite', 'download']);
    expect(spaceOffer({ ...none, canAddToAlbum: true }).actions).toEqual(['addToAlbum', 'newAlbum']);
    expect(spaceOffer({ ...none, canEditMetadata: true, canTag: true }).actions).toEqual([
      'rotate',
      'changeDate',
      'changeLocation',
      'changeDescription',
      'tag',
    ]);
    expect(spaceOffer({ ...none, canSetVisibility: true }).actions).toEqual(['archive', 'setVisibility']);
    expect(
      spaceOffer({ ...none, canSetCover: true, canRemoveFromAlbum: true, canRemoveFromSpace: true, canDelete: true })
        .actions,
    ).toEqual(['setCover', 'removeFromAlbum', 'removeFromSpace', 'delete']);
  });
});

describe('findTimelinePhoto', () => {
  it('finds a photo in the timeline', () => {
    const asset = timelineAssetFactory.build({ id: 'on-the-timeline' });
    const timelineManager = {
      getTimelineMonthByAssetId: (id: string) => (id === asset.id ? { findAssetById: () => asset } : undefined),
    } as unknown as TimelineManager;
    expect(findTimelinePhoto(timelineManager, undefined)(asset.id)).toBe(asset);
    expect(findTimelinePhoto(timelineManager, undefined)('elsewhere')).toBeUndefined();
    expect(findTimelinePhoto(undefined, undefined)(asset.id)).toBeUndefined();
  });

  it('finds a photo among the search results shown instead of the timeline', () => {
    const result = assetFactory.build({ id: 'a-result' });
    expect(findTimelinePhoto(undefined, [result])(result.id)).toMatchObject({ id: result.id });
    expect(findTimelinePhoto(undefined, [result])('elsewhere')).toBeUndefined();
  });
});
