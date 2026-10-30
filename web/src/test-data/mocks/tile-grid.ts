import type { TimelineAsset } from '$lib/managers/timeline-manager/types';

/**
 * Local Omarchy layer: the photos the tile stand-ins draw as tiles (tile-timeline.stub, tile-gallery-viewer.stub), for
 * the specs of the pages' right-click menu (gallery/photo-menu), and what a page asked its timeline to do with them.
 */
export const tileGrid = {
  assets: [] as TimelineAsset[],
  calls: [] as [string, unknown][],
};

export const resetTileGrid = (assets: TimelineAsset[] = []) => {
  tileGrid.assets = assets;
  tileGrid.calls = [];
};
