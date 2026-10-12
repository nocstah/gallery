// Local Omarchy layer: once an undo has changed assets on the server they are fetched fresh and every live view is
// told (AssetUpdate for the viewer and its panels, AssetsChanged for the timelines, which take each in, update it or
// drop it), so an undo shows wherever it is made from, not only on the page that made the change; then every stack
// among them is folded up again (StackUpdate), so its cover and count are right. A batch bigger than LIMIT is left to
// the next load of the page.
import { getAssetInfo, getStack, type AssetResponseDto } from '@immich/sdk';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { toTimelineAsset } from '$lib/utils/timeline-util';

const LIMIT = 200;
const AT_ONCE = 8;

export const refreshAssets = async (ids: string[]) => {
  if (ids.length === 0 || ids.length > LIMIT) {
    return;
  }
  const fresh: AssetResponseDto[] = [];
  for (let index = 0; index < ids.length; index += AT_ONCE) {
    const batch = await Promise.all(
      ids.slice(index, index + AT_ONCE).map((id) => getAssetInfo({ ...authManager.params, id }).catch(() => undefined)),
    );
    fresh.push(...batch.filter((asset): asset is AssetResponseDto => !!asset));
  }
  // a stack's other photos stay folded under its cover, where a plain update would lay them out
  for (const asset of fresh) {
    if (!asset.stack || asset.stack.primaryAssetId === asset.id) {
      eventManager.emit('AssetUpdate', asset);
    }
  }
  eventManager.emit('AssetsChanged', fresh.map((asset) => toTimelineAsset(asset)));
  for (const id of new Set(fresh.flatMap(({ stack }) => (stack ? [stack.id] : [])))) {
    const stack = await getStack({ id }).catch(() => undefined);
    if (stack) {
      eventManager.emit('StackUpdate', stack);
    }
  }
};
