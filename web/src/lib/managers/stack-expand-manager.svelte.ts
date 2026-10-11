// Local Omarchy layer: expand a stack in place. Clicking a tile's stack badge inserts the stack's other
// photos into the timeline beside its cover (they sort in by capture time); clicking again takes them
// back out. Nothing is changed on the server: the stack stays a stack. Any expanded photo can be made
// the cover (right-click > Make stack cover), which folds the stack back up around it.
import { getStack, updateStack } from '@immich/sdk';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { updateGeometry } from '$lib/managers/timeline-manager/internal/layout-support.svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { toTimelineAsset } from '$lib/utils/timeline-util';

class StackExpandManager {
  /** stack id -> ids of the photos inserted for it (everything but the cover) */
  #expanded = new SvelteMap<string, string[]>();
  /** inserted photo id -> its stack id, for the tile styling and the context menu */
  #members = new SvelteMap<string, string>();
  #pending = new SvelteSet<string>();
  timelineManager: TimelineManager | undefined;

  constructor() {
    // a stack that changes anywhere (here, the viewer's menu, a drag onto it) is folded back up by the
    // timeline, so its expansion is over; inserted ids must not be removed again on the next collapse
    eventManager.on({
      StackUpdate: (stack) => this.#forget(stack.id),
      StackDelete: (stack) => this.#forget(stack.id),
      StackCreate: (stack) => {
        const ids = new Set(stack.assets.map((asset) => asset.id));
        for (const [stackId, inserted] of this.#expanded) {
          if (stackId === stack.id || inserted.some((id) => ids.has(id))) {
            this.#forget(stackId);
          }
        }
      },
    });
  }

  isExpanded(stackId: string) {
    return this.#expanded.has(stackId);
  }

  isMember(assetId: string) {
    return this.#members.has(assetId);
  }

  /** The stack an expanded (non-cover) photo belongs to. */
  stackOf(assetId: string) {
    return this.#members.get(assetId);
  }

  isPending(stackId: string) {
    return this.#pending.has(stackId);
  }

  #forget(stackId: string) {
    for (const id of this.#expanded.get(stackId) ?? []) {
      this.#members.delete(id);
    }
    this.#expanded.delete(stackId);
  }

  async toggle(stackId: string, coverId: string) {
    const manager = this.timelineManager;
    if (!manager || this.#pending.has(stackId)) {
      return;
    }
    const inserted = this.#expanded.get(stackId);
    if (inserted) {
      manager.removeAssets(inserted);
      this.#forget(stackId);
      this.#relayout(manager, coverId);
      return;
    }
    this.#pending.add(stackId);
    try {
      const stack = await getStack({ id: stackId });
      const members = stack.assets.filter((asset) => asset.id !== coverId).map((asset) => toTimelineAsset(asset));
      manager.upsertAssets(members);
      this.#relayout(manager, coverId);
      for (const member of members) {
        this.#members.set(member.id, stackId);
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

  // The timeline defers the layout of days it thinks are off screen, and an expanded stack often reaches
  // past the screen: the day then kept its old size while the new tiles kept no or stale positions, drawn
  // on top of their neighbours. Lay the cover's month out now, whole.
  #relayout(manager: TimelineManager, coverId: string) {
    const month = manager.getTimelineMonthByAssetId(coverId);
    if (month) {
      updateGeometry(manager, month, { invalidateHeight: true, noDefer: true });
      manager.updateViewportProximities();
    }
  }

  /** Make a photo its stack's cover. The timeline's StackUpdate handler collapses the stack onto it. */
  async makeCover(stackId: string, assetId: string) {
    try {
      const stack = await updateStack({ id: stackId, stackUpdateDto: { primaryAssetId: assetId } });
      eventManager.emit('StackUpdate', stack);
    } catch (error) {
      const translate = await getFormatter();
      handleError(error, translate('errors.something_went_wrong'));
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
