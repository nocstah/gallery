// Local Omarchy layer: expand a stack in place. Clicking a tile's stack badge inserts the stack's other
// photos into the timeline beside its cover (they sort in by capture time); clicking again takes them
// back out. Nothing is changed on the server: the stack stays a stack.
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import { handleError } from '$lib/utils/handle-error';
import { toTimelineAsset } from '$lib/utils/timeline-util';
import { getStack } from '@immich/sdk';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

class StackExpandManager {
  /** stack id -> ids of the photos inserted for it (everything but the cover) */
  #expanded = new SvelteMap<string, string[]>();
  /** every inserted member id, for the tile styling */
  #members = new SvelteSet<string>();
  #pending = new SvelteSet<string>();
  timelineManager: TimelineManager | undefined;

  isExpanded(stackId: string) {
    return this.#expanded.has(stackId);
  }

  isMember(assetId: string) {
    return this.#members.has(assetId);
  }

  isPending(stackId: string) {
    return this.#pending.has(stackId);
  }

  async toggle(stackId: string, coverId: string) {
    const manager = this.timelineManager;
    if (!manager || this.#pending.has(stackId)) {
      return;
    }
    const inserted = this.#expanded.get(stackId);
    if (inserted) {
      manager.removeAssets(inserted);
      for (const id of inserted) {
        this.#members.delete(id);
      }
      this.#expanded.delete(stackId);
      return;
    }
    this.#pending.add(stackId);
    try {
      const stack = await getStack({ id: stackId });
      const members = stack.assets.filter((asset) => asset.id !== coverId).map((asset) => toTimelineAsset(asset));
      manager.upsertAssets(members);
      for (const member of members) {
        this.#members.add(member.id);
      }
      this.#expanded.set(
        stackId,
        members.map((member) => member.id),
      );
    } catch (error) {
      handleError(error, 'Could not expand the stack');
    } finally {
      this.#pending.delete(stackId);
    }
  }

  /** a fresh timeline starts collapsed */
  reset(manager: TimelineManager | undefined) {
    this.timelineManager = manager;
    this.#expanded.clear();
    this.#members.clear();
  }
}

export const stackExpandManager = new StackExpandManager();
