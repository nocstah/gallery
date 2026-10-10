// Local Omarchy layer: Mac-Photos-style marquee selection on the timeline. Press and drag on the photo grid
// to draw a box; every tile it touches is selected live, and tiles it leaves again are released. Shift or
// Ctrl/Cmd adds to the existing selection instead of replacing it. A plain click still opens the photo: the
// box only starts after the pointer travels a few pixels, and the click that ends a drag is swallowed.
// Dragging near the top or bottom edge scrolls the timeline. Only rendered tiles can be hit, so tiles that
// scroll out of view keep whatever state the box gave them.
//
// Drag to stack: a drag that starts on a *selected* tile moves the selection instead of drawing a box
// (hold a photo ~0.35s and Immich's long-press selects it, so hold-then-drag works for a single photo).
// Dropping on another tile stacks everything onto it: the drop target becomes the cover, and when it or
// any dragged photo already heads a stack the server folds those stacks in. Esc or an empty drop cancels.
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { handleStack } from '$lib/services/stack.service';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';

type Options = { timelineManager: TimelineManager; assetInteraction: AssetMultiSelectManager; enabled: boolean };

const THRESHOLD = 6;
const EDGE = 56;

export const marqueeSelect = (scroller: HTMLElement, initial: Options) => {
  let options = initial;
  let start: { x: number; y: number } | undefined; // in scroller content coordinates
  let startTile: string | undefined;
  let dragIds: string[] = [];
  let ghost: HTMLDivElement | undefined;
  let dropTarget: HTMLElement | undefined;
  let pointer = { x: 0, y: 0 }; // client coordinates
  let active = false;
  let additive = false;
  let before = new Set<string>();
  let touched = new Set<string>();
  let box: HTMLDivElement | undefined;
  let frame = 0;

  const toContent = (x: number, y: number) => {
    const r = scroller.getBoundingClientRect();
    return { x: x - r.left + scroller.scrollLeft, y: y - r.top + scroller.scrollTop };
  };

  const assetFor = (id: string) => options.timelineManager.getTimelineMonthByAssetId(id)?.findAssetById({ id });

  const update = () => {
    if (!start || !box) {
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    // auto-scroll near the edges
    if (pointer.y < scrollerRect.top + EDGE) {
      scroller.scrollBy(0, -Math.ceil((scrollerRect.top + EDGE - pointer.y) / 3));
    } else if (pointer.y > scrollerRect.bottom - EDGE) {
      scroller.scrollBy(0, Math.ceil((pointer.y - (scrollerRect.bottom - EDGE)) / 3));
    }
    const end = toContent(pointer.x, pointer.y);
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    // draw in client space
    const originX = scrollerRect.left - scroller.scrollLeft;
    const originY = scrollerRect.top - scroller.scrollTop;
    box.style.left = `${left + originX}px`;
    box.style.top = `${Math.max(top + originY, scrollerRect.top)}px`;
    box.style.width = `${right - left}px`;
    box.style.height = `${Math.min(bottom + originY, scrollerRect.bottom) - Math.max(top + originY, scrollerRect.top)}px`;

    for (const tile of scroller.querySelectorAll<HTMLElement>('[data-thumbnail-focus-container][data-asset]')) {
      const id = tile.dataset.asset!;
      const t = tile.getBoundingClientRect();
      const tl = t.left - originX;
      const tt = t.top - originY;
      const hit = tl < right && tl + t.width > left && tt < bottom && tt + t.height > top;
      const selected = options.assetInteraction.hasSelectedAsset(id);
      if (hit && !selected) {
        const asset = assetFor(id);
        if (asset) {
          options.assetInteraction.selectAsset(asset);
          touched.add(id);
        }
      } else if (!hit && selected && touched.has(id) && !before.has(id)) {
        options.assetInteraction.removeAssetFromMultiselectGroup(id);
        touched.delete(id);
      }
    }
    frame = requestAnimationFrame(update);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!options.enabled || event.button !== 0 || event.pointerType === 'touch') {
      return;
    }
    const target = event.target as Element | null;
    // badges, checkboxes, links inside overlays and the scrubber keep their own behaviour
    if (target?.closest('button, input, [role="checkbox"], .ws-stack-badge')) {
      return;
    }
    start = toContent(event.clientX, event.clientY);
    pointer = { x: event.clientX, y: event.clientY };
    startTile = target?.closest<HTMLElement>('[data-thumbnail-focus-container][data-asset]')?.dataset.asset;
    additive = event.shiftKey || event.ctrlKey || event.metaKey;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const begin = () => {
    active = true;
    if (!additive) {
      options.assetInteraction.clear();
    }
    before = new Set(options.assetInteraction.assets.map((asset) => asset.id));
    touched = new Set();
    box = document.createElement('div');
    box.className = 'ws-marquee';
    document.body.append(box);
    document.body.classList.add('ws-marquee-active');
    frame = requestAnimationFrame(update);
  };

  const onPointerMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!active && start) {
      const here = toContent(event.clientX, event.clientY);
      if (Math.hypot(here.x - start.x, here.y - start.y) > THRESHOLD) {
        if (startTile && options.assetInteraction.hasSelectedAsset(startTile)) {
          beginDrag();
        } else {
          begin();
        }
      }
    } else if (dragging) {
      moveGhost();
    }
  };

  // ---- drag to stack ----
  let dragging = false;

  const beginDrag = () => {
    dragging = true;
    active = true;
    dragIds = options.assetInteraction.assets.map((asset) => asset.id);
    const source = scroller.querySelector<HTMLImageElement>(
      `[data-thumbnail-focus-container][data-asset="${CSS.escape(startTile!)}"] img`,
    );
    ghost = document.createElement('div');
    ghost.className = 'ws-drag-ghost';
    if (source?.currentSrc) {
      const img = document.createElement('img');
      img.src = source.currentSrc;
      ghost.append(img);
    }
    const count = document.createElement('span');
    count.textContent = String(dragIds.length);
    ghost.append(count);
    document.body.append(ghost);
    document.body.classList.add('ws-dragging');
    for (const id of dragIds) {
      scroller
        .querySelector(`[data-thumbnail-focus-container][data-asset="${CSS.escape(id)}"]`)
        ?.setAttribute('data-dragging', '');
    }
    window.addEventListener('keydown', onDragKey, true);
    moveGhost();
    frame = requestAnimationFrame(dragFrame);
  };

  const setDropTarget = (tile: HTMLElement | undefined) => {
    if (dropTarget === tile) {
      return;
    }
    dropTarget?.removeAttribute('data-drop-target');
    dropTarget = tile;
    dropTarget?.setAttribute('data-drop-target', '');
  };

  const moveGhost = () => {
    if (!ghost) {
      return;
    }
    ghost.style.transform = `translate(${pointer.x + 14}px, ${pointer.y + 14}px)`;
    const tile = document
      .elementsFromPoint(pointer.x, pointer.y)
      .map((element) => element.closest<HTMLElement>('[data-thumbnail-focus-container][data-asset]'))
      .find(Boolean);
    setDropTarget(tile && !dragIds.includes(tile.dataset.asset!) ? tile : undefined);
  };

  const dragFrame = () => {
    const rect = scroller.getBoundingClientRect();
    if (pointer.y < rect.top + EDGE) {
      scroller.scrollBy(0, -Math.ceil((rect.top + EDGE - pointer.y) / 3));
      moveGhost();
    } else if (pointer.y > rect.bottom - EDGE) {
      scroller.scrollBy(0, Math.ceil((pointer.y - (rect.bottom - EDGE)) / 3));
      moveGhost();
    }
    frame = requestAnimationFrame(dragFrame);
  };

  const endDrag = (drop: boolean) => {
    const target = dropTarget?.dataset.asset;
    window.removeEventListener('keydown', onDragKey, true);
    for (const tile of scroller.querySelectorAll('[data-dragging]')) {
      tile.removeAttribute('data-dragging');
    }
    setDropTarget(undefined);
    ghost?.remove();
    ghost = undefined;
    document.body.classList.remove('ws-dragging');
    dragging = false;
    if (drop && target && dragIds.length > 0) {
      // the drop target leads, so it becomes the cover; existing stacks it or the dragged photos head merge in
      void handleStack([target, ...dragIds]);
    }
    dragIds = [];
  };

  const onDragKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && dragging) {
      event.preventDefault();
      event.stopPropagation();
      cancelAnimationFrame(frame);
      endDrag(false);
      active = false;
      start = undefined;
      window.removeEventListener('pointermove', onPointerMove);
    }
  };

  const swallowClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove);
    cancelAnimationFrame(frame);
    if (dragging) {
      endDrag(true);
    }
    if (active) {
      // the click that ends a drag must not open the photo under the pointer
      window.addEventListener('click', swallowClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 0);
    }
    box?.remove();
    box = undefined;
    document.body.classList.remove('ws-marquee-active');
    active = false;
    start = undefined;
    startTile = undefined;
  };

  // native image dragging would hijack the gesture
  const onDragStart = (event: DragEvent) => {
    if (options.enabled) {
      event.preventDefault();
    }
  };

  scroller.addEventListener('pointerdown', onPointerDown);
  scroller.addEventListener('dragstart', onDragStart);
  return {
    update(next: Options) {
      options = next;
    },
    destroy() {
      onPointerUp();
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('dragstart', onDragStart);
    },
  };
};
