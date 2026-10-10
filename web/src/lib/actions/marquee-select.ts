// Local Omarchy layer: Mac-Photos-style marquee selection on the timeline. Press and drag on the photo grid
// to draw a box; every tile it touches is selected live, and tiles it leaves again are released. Shift or
// Ctrl/Cmd adds to the existing selection instead of replacing it. A plain click still opens the photo: the
// box only starts after the pointer travels a few pixels, and the click that ends a drag is swallowed.
// Dragging near the top or bottom edge scrolls the timeline. Only rendered tiles can be hit, so tiles that
// scroll out of view keep whatever state the box gave them.
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';

type Options = { timelineManager: TimelineManager; assetInteraction: AssetMultiSelectManager; enabled: boolean };

const THRESHOLD = 6;
const EDGE = 56;

export const marqueeSelect = (scroller: HTMLElement, initial: Options) => {
  let options = initial;
  let start: { x: number; y: number } | undefined; // in scroller content coordinates
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
        begin();
      }
    }
  };

  const swallowClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove);
    cancelAnimationFrame(frame);
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
