// Local Omarchy layer: search results come without stack data, so every burst shot and the edit beside its
// original showed as its own tile. This looks each result up and keeps one tile per stack: the best match, which
// carries the stack (its count badge). Moving that tile to the Locked Folder takes the whole stack along.
import { getAssetInfo, type AssetResponseDto } from '@immich/sdk';

/** `shown`: stacks already on screen from earlier pages; updated in place. */
export const groupStacks = async (items: AssetResponseDto[], shown: Set<string>): Promise<AssetResponseDto[]> => {
  const stacks: (AssetResponseDto['stack'] | undefined)[] = [];
  for (let index = 0; index < items.length; index += 8) {
    const batch = items.slice(index, index + 8);
    const infos = await Promise.all(batch.map((asset) => getAssetInfo({ id: asset.id }).catch(() => undefined)));
    stacks.push(...infos.map((info) => info?.stack));
  }
  const kept: AssetResponseDto[] = [];
  for (const [index, asset] of items.entries()) {
    const stack = stacks[index];
    if (!stack) {
      kept.push(asset);
    } else if (!shown.has(stack.id)) {
      shown.add(stack.id);
      kept.push({ ...asset, stack });
    }
  }
  return kept;
};
