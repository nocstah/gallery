// Local Omarchy layer: Mac-Photos-style marquee selection and drag-to-stack on the timeline. One rule decides
// what a press on the grid does, and it depends only on timing, never on what is already selected:
//
//   press and move right away   a selection box. Every tile it touches is selected live, and tiles it leaves
//                               again are released. Shift or Ctrl/Cmd adds to the selection instead of replacing it.
//   press and hold on a photo   the photo lifts out of the grid (with the rest of the selection, when it is part
//                               of one). Move to carry it and drop it on another photo to stack them there: the
//                               drop target becomes the cover, and stacks either side already heads fold in.
//                               Esc or an empty drop puts it back; releasing without moving toggles its selection,
//                               the way Immich's long-press does.
//   click                       still opens the photo.
//
// Dragging near the top or bottom edge scrolls the timeline. Only rendered tiles can be hit, so tiles that scroll
// out of view keep whatever state the box gave them. Touch keeps Immich's own long-press (Thumbnail.svelte skips
// mouse and pen holds inside [data-ws-gestures]).
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import { handleStack } from '$lib/services/stack.service';

type Options = { timelineManager: TimelineManager; assetInteraction: AssetMultiSelectManager; enabled: boolean };
type Phase = 'idle' | 'pressed' | 'marquee' | 'lifted' | 'dragging';
type Box = { x: number; y: number; w: number; h: number };

const TILE = '[data-thumbnail-focus-container][data-asset]';
const THRESHOLD = 6;
const LIFT_DELAY = 300;
const EDGE = 56;
const GHOST_SIZE = 104; // longest side of the carried photo
const SETTLE = 180;

const tileFor = (scroller: HTMLElement, id: string) =>
  scroller.querySelector<HTMLElement>(`[data-thumbnail-focus-container][data-asset="${CSS.escape(id)}"]`) ?? undefined;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const marqueeSelect = (scroller: HTMLElement, initial: Options) => {
  let options = initial;
  let phase: Phase = 'idle';
  let start: { x: number; y: number } | undefined; // in scroller content coordinates
  let press = { x: 0, y: 0 }; // client coordinates
  let pointer = { x: 0, y: 0 }; // client coordinates
  let startTile: HTMLElement | undefined;
  let liftTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  // marquee
  let additive = false;
  let before = new Set<string>();
  let touched = new Set<string>();
  let box: HTMLDivElement | undefined;
  // lift and drag
  let dragIds: string[] = [];
  let ghost: HTMLDivElement | undefined;
  let home: Box | undefined; // where the lifted photo sits in the grid
  let dropTarget: HTMLElement | undefined;

  const sync = () => scroller.toggleAttribute('data-ws-gestures', options.enabled);

  const toContent = (x: number, y: number) => {
    const r = scroller.getBoundingClientRect();
    return { x: x - r.left + scroller.scrollLeft, y: y - r.top + scroller.scrollTop };
  };

  const assetFor = (id: string) => options.timelineManager.getTimelineMonthByAssetId(id)?.findAssetById({ id });

  const autoScroll = () => {
    const rect = scroller.getBoundingClientRect();
    if (pointer.y < rect.top + EDGE) {
      scroller.scrollBy(0, -Math.ceil((rect.top + EDGE - pointer.y) / 3));
      return true;
    }
    if (pointer.y > rect.bottom - EDGE) {
      scroller.scrollBy(0, Math.ceil((pointer.y - (rect.bottom - EDGE)) / 3));
      return true;
    }
    return false;
  };

  // ---- marquee ----

  const beginMarquee = () => {
    phase = 'marquee';
    if (!additive) {
      options.assetInteraction.clear();
    }
    before = new Set(options.assetInteraction.assets.map((asset) => asset.id));
    touched = new Set();
    box = document.createElement('div');
    box.className = 'ws-marquee';
    document.body.append(box);
    document.body.classList.add('ws-marquee-active');
    frame = requestAnimationFrame(marqueeFrame);
  };

  const marqueeFrame = () => {
    if (!start || !box) {
      return;
    }
    autoScroll();
    const scrollerRect = scroller.getBoundingClientRect();
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

    for (const tile of scroller.querySelectorAll<HTMLElement>(TILE)) {
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
    frame = requestAnimationFrame(marqueeFrame);
  };

  // ---- lift and drag to stack ----

  const lift = () => {
    liftTimer = undefined;
    if (phase !== 'pressed' || !startTile?.isConnected) {
      return;
    }
    phase = 'lifted';
    const id = startTile.dataset.asset!;
    const selection = options.assetInteraction.assets.map((asset) => asset.id);
    // a photo that is part of the selection carries the selection with it; any other photo travels alone
    dragIds = selection.includes(id) ? [id, ...selection.filter((other) => other !== id)] : [id];
    for (const dragId of dragIds) {
      tileFor(scroller, dragId)?.setAttribute('data-dragging', '');
    }

    const rect = startTile.getBoundingClientRect();
    home = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    ghost = document.createElement('div');
    ghost.className = 'ws-drag-ghost';
    ghost.classList.toggle('is-multi', dragIds.length > 1);
    ghost.style.borderRadius = getComputedStyle(startTile).borderRadius;
    place(ghost, home);
    const source = startTile.querySelector<HTMLImageElement>('img');
    if (source?.currentSrc) {
      const img = document.createElement('img');
      img.src = source.currentSrc;
      img.alt = '';
      ghost.append(img);
    }
    if (dragIds.length > 1) {
      const count = document.createElement('span');
      count.textContent = String(dragIds.length);
      ghost.append(count);
    }
    document.body.append(ghost);
    // commit the resting state so the lift animates from it
    void ghost.getBoundingClientRect();
    ghost.classList.add('is-lifted');
    document.body.classList.add('ws-lifted');
    addEventListener('keydown', onKey, { capture: true });
  };

  const place = (element: HTMLElement, at: Box) => {
    element.style.translate = `${at.x}px ${at.y}px`;
    element.style.width = `${at.w}px`;
    element.style.height = `${at.h}px`;
  };

  const beginDrag = () => {
    phase = 'dragging';
    document.body.classList.replace('ws-lifted', 'ws-dragging');
    moveGhost();
    // the photo glides from its tile to the cursor, then follows it without easing
    const carried = ghost;
    setTimeout(
      () => {
        if (carried && carried === ghost) {
          carried.classList.add('is-following');
        }
      },
      reducedMotion() ? 0 : SETTLE,
    );
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
    if (!ghost || !home) {
      return;
    }
    const scale = Math.min(1, GHOST_SIZE / Math.max(home.w, home.h));
    place(ghost, { x: pointer.x + 14, y: pointer.y + 14, w: home.w * scale, h: home.h * scale });
    const tile = document
      .elementsFromPoint(pointer.x, pointer.y)
      .map((element) => element.closest<HTMLElement>(TILE))
      .find(Boolean);
    setDropTarget(tile && !dragIds.includes(tile.dataset.asset!) ? tile : undefined);
  };

  const dragFrame = () => {
    if (autoScroll()) {
      moveGhost();
    }
    frame = requestAnimationFrame(dragFrame);
  };

  /** Animate the carried photo to a tile (or back home) and remove it. */
  const settleGhost = (into: HTMLElement | undefined) => {
    const leaving = ghost;
    ghost = undefined;
    if (!leaving) {
      return;
    }
    leaving.classList.remove('is-following', 'is-lifted');
    const rect = into?.isConnected ? into.getBoundingClientRect() : undefined;
    if (rect) {
      place(leaving, { x: rect.left, y: rect.top, w: rect.width, h: rect.height });
    }
    leaving.classList.add('is-settling');
    setTimeout(() => leaving.remove(), reducedMotion() ? 0 : SETTLE);
  };

  const toggleSelection = (id: string) => {
    const interaction = options.assetInteraction;
    if (interaction.hasSelectedAsset(id)) {
      interaction.removeAssetFromMultiselectGroup(id);
      interaction.setAssetSelectionStart(null);
      return;
    }
    const asset = assetFor(id);
    if (asset && !options.timelineManager.albumAssets.has(id)) {
      interaction.selectAsset(asset);
      interaction.setAssetSelectionStart(asset);
    }
  };

  // ---- gesture lifecycle ----

  const swallowNextClick = () => {
    // the click that ends a gesture must not open the photo under the pointer
    const swallow = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);
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
    finish();
    phase = 'pressed';
    start = toContent(event.clientX, event.clientY);
    press = { x: event.clientX, y: event.clientY };
    pointer = press;
    startTile = target?.closest<HTMLElement>(TILE) ?? undefined;
    additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (startTile) {
      liftTimer = setTimeout(lift, LIFT_DELAY);
    }
    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
    addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    scroller.addEventListener('scroll', onScroll, { passive: true });
  };

  const onPointerMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    const moved = Math.hypot(pointer.x - press.x, pointer.y - press.y) > THRESHOLD;
    if (phase === 'pressed' && moved) {
      clearTimeout(liftTimer);
      beginMarquee();
    } else if (phase === 'lifted' && moved) {
      beginDrag();
    } else if (phase === 'dragging') {
      moveGhost();
    }
  };

  // scrolling before the hold completes means the pointer is no longer on the photo it pressed
  const onScroll = () => {
    if (phase === 'pressed') {
      clearTimeout(liftTimer);
      liftTimer = undefined;
    }
  };

  const onPointerUp = () => {
    switch (phase) {
      case 'marquee': {
        swallowNextClick();
        break;
      }
      case 'lifted': {
        // held and released in place
        toggleSelection(startTile!.dataset.asset!);
        settleGhost(startTile);
        swallowNextClick();
        break;
      }
      case 'dragging': {
        const target = dropTarget?.dataset.asset;
        if (target) {
          settleGhost(dropTarget);
          // the drop target leads, so it becomes the cover; stacks it or the carried photos head merge in
          void handleStack([target, ...dragIds]);
        } else {
          settleGhost(tileFor(scroller, startTile?.dataset.asset ?? ''));
        }
        swallowNextClick();
        break;
      }
      case 'idle':
      case 'pressed': {
        // a plain click goes through and opens the photo
        break;
      }
    }
    finish();
  };

  /** Esc, pointercancel or losing focus: put a carried photo back, keep whatever a box selected. */
  const cancel = () => {
    if (phase === 'lifted' || phase === 'dragging') {
      settleGhost(tileFor(scroller, startTile?.dataset.asset ?? ''));
    }
    finish();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && (phase === 'lifted' || phase === 'dragging')) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  /** Back to idle: listeners, timers, box and markers go; a carried photo is settled by the caller. */
  const finish = () => {
    removeEventListener('pointermove', onPointerMove);
    removeEventListener('pointerup', onPointerUp);
    removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
    removeEventListener('keydown', onKey, { capture: true });
    scroller.removeEventListener('scroll', onScroll);
    clearTimeout(liftTimer);
    liftTimer = undefined;
    cancelAnimationFrame(frame);
    box?.remove();
    box = undefined;
    settleGhost(undefined);
    for (const tile of scroller.querySelectorAll<HTMLElement>('[data-dragging]')) {
      delete tile.dataset.dragging;
    }
    setDropTarget(undefined);
    document.body.classList.remove('ws-marquee-active', 'ws-lifted', 'ws-dragging');
    phase = 'idle';
    start = undefined;
    startTile = undefined;
    home = undefined;
    dragIds = [];
  };

  // native image dragging would hijack the gesture
  const onDragStart = (event: DragEvent) => {
    if (options.enabled) {
      event.preventDefault();
    }
  };

  sync();
  scroller.addEventListener('pointerdown', onPointerDown);
  scroller.addEventListener('dragstart', onDragStart);
  return {
    update(next: Options) {
      options = next;
      sync();
      if (!options.enabled) {
        cancel();
      }
    },
    destroy() {
      cancel();
      delete scroller.dataset.wsGestures;
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('dragstart', onDragStart);
    },
  };
};
