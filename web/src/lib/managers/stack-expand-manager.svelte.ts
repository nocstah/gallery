// Local Omarchy layer: expand a stack in place. Clicking a tile's stack badge inserts the stack's other
// photos into the timeline beside its cover (they sort in by capture time); clicking again takes them
// back out. Nothing is changed on the server: the stack stays a stack. Any expanded photo can be made
// the cover (right-click > Make stack cover), which folds the stack back up around it.
import { AssetOrder, getAssetInfo, getStack, updateStack } from '@immich/sdk';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { updateGeometry } from '$lib/managers/timeline-manager/internal/layout-support.svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';
import { toTimelineAsset } from '$lib/utils/timeline-util';
import { coverDone } from '$lib/utils/undoable';

class StackExpandManager {
  /** stack id -> ids of the photos inserted for it (everything but the cover) */
  #expanded = new SvelteMap<string, string[]>();
  /** inserted photo id -> its stack id, for the tile styling and the context menu */
  #members = new SvelteMap<string, string>();
  #pending = new SvelteSet<string>();
  /** stack id -> every photo of the expanded stack, cover included, in timeline order: the tiles' "2 / 5" */
  #order = new SvelteMap<string, string[]>();
  /** cover id -> its stack id, while expanded */
  #covers = new SvelteMap<string, string>();
  /** the expanded stack under the pointer: the rest of the timeline dims so the stack's photos stand out */
  spotlight = $state<string | undefined>();
  timelineManager: TimelineManager | undefined;

  constructor() {
    // a stack that changes anywhere (here, the viewer's menu, a drag onto it) is folded back up by the
    // timeline, so its expansion is over; inserted ids must not be removed again on the next collapse
    eventManager.on({
      AssetsDelete: (ids) => void this.#recount(ids),
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

  /** The expanded stack a tile belongs to, its cover included. */
  groupOf(assetId: string) {
    return this.#members.get(assetId) ?? this.#covers.get(assetId);
  }

  /** A tile's place in its expanded stack as laid out, counted from 1. */
  position(assetId: string) {
    const stackId = this.groupOf(assetId);
    const order = stackId ? this.#order.get(stackId) : undefined;
    return order ? { index: order.indexOf(assetId) + 1, total: order.length } : undefined;
  }

  isPending(stackId: string) {
    return this.#pending.has(stackId);
  }

  #forget(stackId: string) {
    for (const id of this.#expanded.get(stackId) ?? []) {
      this.#members.delete(id);
    }
    this.#expanded.delete(stackId);
    this.#order.delete(stackId);
    for (const [coverId, id] of this.#covers) {
      if (id === stackId) {
        this.#covers.delete(coverId);
      }
    }
    if (this.spotlight === stackId) {
      this.spotlight = undefined;
    }
  }

  async toggle(stackId: string, coverId: string) {
    const manager = this.timelineManager;
    if (!manager || this.#pending.has(stackId)) {
      return;
    }
    const inserted = this.#expanded.get(stackId);
    if (inserted) {
      manager.setPersonStackExpanded(stackId, false);
      manager.removeAssets(inserted);
      this.#forget(stackId);
      this.#relayout(manager, coverId);
      return;
    }
    this.#pending.add(stackId);
    const generation = manager.reloadToken;
    try {
      const stack = await getStack({ id: stackId });
      if (manager !== this.timelineManager || generation !== manager.reloadToken) {
        return;
      }
      const allowed = manager.personStackMembers(stackId);
      const matching = allowed ? stack.assets.filter((asset) => allowed.has(asset.id)) : stack.assets;
      const members = matching.filter((asset) => asset.id !== coverId).map((asset) => toTimelineAsset(asset));
      if (allowed) {
        // Load an existing month before inserting into it, otherwise a partial month looks loaded.
        const months = new Map(
          members.map((asset) => [`${asset.localDateTime.year}-${asset.localDateTime.month}`, asset.localDateTime]),
        );
        await Promise.all([...months.values()].map((month) => manager.loadTimelineMonth(month, { cancelable: false })));
        if (manager !== this.timelineManager || generation !== manager.reloadToken) {
          return;
        }
      }
      manager.setPersonStackExpanded(stackId, true);
      manager.upsertAssets(members);
      this.#relayout(manager, coverId);
      for (const member of members) {
        this.#members.set(member.id, stackId);
      }
      this.#expanded.set(
        stackId,
        members.map((member) => member.id),
      );
      this.#covers.set(coverId, stackId);
      // numbered in the order the timeline lays them out (newest first, unless the timeline runs oldest first)
      const ascending = manager.getAssetOrder() === AssetOrder.Asc;
      const byTime = [...matching]
        .sort((a, b) => a.fileCreatedAt.localeCompare(b.fileCreatedAt) * (ascending ? 1 : -1))
        .map((asset) => asset.id);
      this.#order.set(stackId, byTime);
    } catch (error) {
      handleError(error, 'Could not expand the stack');
    } finally {
      this.#pending.delete(stackId);
    }
  }

  /** Photos went to the trash (here, the viewer, another tab): the stacks they were in count again, so a cover whose
   * stack is down to itself loses its badge at once rather than at the next reload. Stacks that are expanded here are
   * known; for a handful of other photos the server says which stack each was in (a big bulk delete skips those). */
  async #recount(ids: string[]) {
    const manager = this.timelineManager;
    if (!manager || ids.length === 0) {
      return;
    }
    if (manager.refreshPersonStacks()) {
      return;
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local lookup for this request
    const stackIds = new Set<string>();
    const unknown: string[] = [];
    for (const id of ids) {
      const stackId = this.#members.get(id) ?? this.#covers.get(id);
      if (stackId) {
        stackIds.add(stackId);
      } else {
        unknown.push(id);
      }
    }
    if (unknown.length <= 20) {
      const infos = await Promise.allSettled(unknown.map((id) => getAssetInfo({ id })));
      for (const info of infos) {
        if (info.status === 'fulfilled' && info.value.stack) {
          stackIds.add(info.value.stack.id);
        }
      }
    }
    for (const stackId of stackIds) {
      try {
        // the server lists only the stack's photos outside the trash
        const stack = await getStack({ id: stackId });
        const left = stack.assets.length;
        const inserted = this.#expanded.get(stackId);
        if (inserted) {
          // fold it back up around its cover, as a collapse would
          manager.removeAssets(inserted.filter((id) => id !== stack.primaryAssetId));
          this.#forget(stackId);
        }
        manager.update([stack.primaryAssetId], (asset) => {
          asset.stack = left > 1 ? { id: stackId, primaryAssetId: stack.primaryAssetId, assetCount: left } : null;
        });
      } catch {
        // the stack is gone: the timeline's own stack events handle that
      }
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
      // A person page's displayed representative can differ from the stack's real cover.
      const previous = await getStack({ id: stackId });
      const before = previous.primaryAssetId;
      const stack = await updateStack({ id: stackId, stackUpdateDto: { primaryAssetId: assetId } });
      eventManager.emit('StackUpdate', stack);
      // the old cover can be had back from the bar's undo (utils/undoable)
      coverDone(stackId, before);
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
    this.#order.clear();
    this.#covers.clear();
    this.spotlight = undefined;
  }
}

export const stackExpandManager = new StackExpandManager();
