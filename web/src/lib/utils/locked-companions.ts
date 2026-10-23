// Local Omarchy layer: moving a photo into or out of the Locked Folder takes everything that is the same picture
// with it: the rest of its stack (bursts, the edit beside the original) and each Live Photo's video half. Gallery
// moves only the ids it is given, which left copies in the timeline and the video halves outside the PIN.
import { AssetVisibility, getAssetInfo, getStack, updateAssets, type AssetResponseDto } from '@immich/sdk';

const inBatches = async <T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(...(await Promise.all(items.slice(index, index + size).map((item) => run(item)))));
  }
  return out;
};

/**
 * Locks (or unlocks) `ids` together with their stack mates and Live Photo videos. Returns every photo that moved
 * (the given ids and their stack mates), for the page to take out of view; the video halves never show anyway.
 * Unlocking returns the video halves to hidden, where Gallery keeps them, not to the timeline.
 */
export const setLockedWithCompanions = async (ids: string[], unlock: boolean): Promise<string[]> => {
  const seen = new Set([AssetVisibility.Timeline, AssetVisibility.Archive]);
  const photos = new Set(ids);
  const videos = new Set<string>();
  const stacks = new Set<string>();
  const addVideo = (asset: AssetResponseDto) => asset.livePhotoVideoId && videos.add(asset.livePhotoVideoId);

  const infos = await inBatches(ids, 8, (id) => getAssetInfo({ id }).catch(() => undefined));
  for (const info of infos) {
    if (!info) {
      continue;
    }
    addVideo(info);
    if (info.stack) {
      stacks.add(info.stack.id);
    }
  }
  const stackInfos = await inBatches([...stacks], 8, (id) => getStack({ id }).catch(() => undefined));
  for (const stack of stackInfos) {
    for (const mate of stack?.assets ?? []) {
      // only mates on the side being left: in the timeline or archive when locking, in the folder when unlocking
      const onSide = unlock ? mate.visibility === AssetVisibility.Locked : seen.has(mate.visibility);
      if (photos.has(mate.id) || mate.isTrashed || !onSide) {
        continue;
      }
      photos.add(mate.id);
      addVideo(mate);
    }
  }

  const moved = [...photos];
  await updateAssets({
    assetBulkUpdateDto: { ids: moved, visibility: unlock ? AssetVisibility.Timeline : AssetVisibility.Locked },
  });
  if (videos.size > 0) {
    await updateAssets({
      assetBulkUpdateDto: { ids: [...videos], visibility: unlock ? AssetVisibility.Hidden : AssetVisibility.Locked },
    });
  }
  return moved;
};
