// Local Omarchy layer: a stack shows in the timeline through its cover, so trashing (or deleting) the cover took the
// stack's other photos out of sight with it, though nothing had happened to them (until Curator's stacks.covers gave
// the stack a new cover, minutes later). Before photos leave, every stack whose cover is among them now gets a new
// cover from the photos that stay (a favourite first, else the next in the stack), and once they have left the
// timeline is told, so the stack stays in view; an undo puts the old covers back.
import { getStack, updateStack, type StackResponseDto } from '@immich/sdk';
import { eventManager } from '$lib/managers/event-manager.svelte';

type Leaving = { id: string; stack?: { id: string; primaryAssetId: string } | null };

export type CoverChange = { from: string; stack: StackResponseDto };

/** Hands each stack whose cover is leaving to one of its photos that stay. Never throws: a stack it cannot re-cover
 * only drops out of sight as before (its photos are untouched either way). */
export const handOverCovers = async (assets: Leaving[]): Promise<CoverChange[]> => {
  const leaving = new Set(assets.map(({ id }) => id));
  const stackIds = new Set(assets.flatMap(({ id, stack }) => (stack && stack.primaryAssetId === id ? [stack.id] : [])));
  const changes: CoverChange[] = [];
  for (const id of stackIds) {
    try {
      const stack = await getStack({ id });
      const staying = stack.assets.filter((asset) => !leaving.has(asset.id));
      if (!leaving.has(stack.primaryAssetId) || staying.length === 0) {
        continue;
      }
      const cover = staying.find((asset) => asset.isFavorite) ?? staying[0];
      const updated = await updateStack({ id, stackUpdateDto: { primaryAssetId: cover.id } });
      changes.push({ from: stack.primaryAssetId, stack: updated });
    } catch (error) {
      console.error(`Could not give stack ${id} a new cover`, error);
    }
  }
  return changes;
};

/** After the photos have left: the timeline and an open viewer fold each stack around its new cover. */
export const announceCovers = (changes: CoverChange[], left: string[]) => {
  const gone = new Set(left);
  for (const { stack } of changes) {
    eventManager.emit('StackUpdate', { ...stack, assets: stack.assets.filter((asset) => !gone.has(asset.id)) });
  }
};

/** Undo: each stack gets its old cover back (call once the photos are restored). */
export const restoreCovers = async (changes: CoverChange[]) => {
  for (const { from, stack } of changes) {
    const updated = await updateStack({ id: stack.id, stackUpdateDto: { primaryAssetId: from } });
    eventManager.emit('StackUpdate', updated);
  }
};
