// Local Omarchy layer: Mac-Photos-style marquee selection and drag-to-stack on the timeline, and the same selection
// box on every other photo grid (search results, folders: GalleryViewer). One rule decides what a press on the grid
// does, and it depends only on timing, never on what is already selected:
//
//   press and move right away   a selection box. Every tile it touches is selected live, and tiles it leaves
//                               again are released. Shift or Ctrl/Cmd adds to the selection instead of replacing it.
//   press and hold on a photo   the photo lifts out of the grid (with the rest of the selection, when it is part
//                               of one). Move to carry it: drop it on another photo to stack them there (the timeline
//                               only: the drop target becomes the cover, and stacks either side already heads fold
//                               in), or on the sidebar, into an album, To do, Villa, QR, a Space or a new album
//                               (managers/sidebar-drop). The carried photo says what a drop would do. Esc or an empty
//                               drop puts it back; releasing without moving toggles its selection, the way Immich's
//                               long-press does. Where neither can take it (no stacking, no sidebar on screen)
//                               nothing lifts: releasing toggles the selection and moving draws the box.
//   click                       still opens the photo.
//
// Dragging near the top or bottom edge scrolls the grid (or the page or pane it scrolls in: `scroller`), or the
// sidebar while over it. Only rendered tiles can be hit, so tiles that scroll out of view keep whatever state the box
// gave them. Touch keeps Immich's own long-press (Thumbnail.svelte skips mouse and pen holds inside
// [data-ws-gestures]).
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
import { sidebarDrop, sourceOf, type Offer } from '$lib/managers/sidebar-drop.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import type { DropResult } from '$lib/services/sidebar-drop.service';

type Options = {
  assetInteraction: AssetMultiSelectManager;
  enabled: boolean;
  /** the photo a tile shows, by its id; a tile it can't name is left alone */
  assetFor: (id: string) => TimelineAsset | undefined;
  /** photos a hold may not pick (those already in the album being added to) */
  locked?: (id: string) => boolean;
  /** hold and drag a photo onto another to stack them (the timeline, the default); elsewhere photos only go to the
   * sidebar */
  stacking?: boolean;
  /** what scrolls, when it is not the grid itself: the pane the grid sits in, or null for the page */
  scroller?: HTMLElement | null;
  /** a drop on the sidebar is done: the photos To do, Villa or QR took out of view leave the grid */
  onSidebarDrop?: (result: DropResult) => void;
};
type Phase = 'idle' | 'pressed' | 'marquee' | 'held' | 'lifted' | 'dragging';
type Box = { x: number; y: number; w: number; h: number };

const TILE = '[data-thumbnail-focus-container][data-asset]';
const THRESHOLD = 6;
const LIFT_DELAY = 300;
const EDGE = 56;
const GHOST_SIZE = 104; // longest side of the carried photo
const LABEL_ROOM = 60; // what the carried photo says, under it (two lines)
const SETTLE = 180;

const tileFor = (grid: HTMLElement, id: string) =>
  grid.querySelector<HTMLElement>(`[data-thumbnail-focus-container][data-asset="${CSS.escape(id)}"]`) ?? undefined;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const marqueeSelect = (grid: HTMLElement, initial: Options) => {
  let options = initial;
  let phase: Phase = 'idle';
  let start: { x: number; y: number } | undefined; // in grid content coordinates
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
  let carried: TimelineAsset[] = []; // the lifted photos as the grid knows them, for the sidebar
  let fromSelection = false; // the selection travels, so it goes once a drop has used it up
  let ghost: HTMLDivElement | undefined;
  let label: HTMLSpanElement | undefined; // what a drop here would do, under the carried photo
  let home: Box | undefined; // where the lifted photo sits in the grid
  let dropTarget: HTMLElement | undefined;
  let scrolling: EventTarget | undefined; // what scrolls under a press, for its listener

  const sync = () => grid.toggleAttribute('data-ws-gestures', options.enabled);

  // a grid that scrolls itself (the timeline) adds its scroll offset; one inside a pane or the page moves with it
  const toContent = (x: number, y: number) => {
    const r = grid.getBoundingClientRect();
    return { x: x - r.left + grid.scrollLeft, y: y - r.top + grid.scrollTop };
  };

  /** the element that scrolls: the grid, the pane it sits in, or null for the page */
  const scrollerOf = () => (options.scroller === undefined ? grid : options.scroller);
  /** the part of the grid on screen: the scroller's box, or the window */
  const visible = () => scrollerOf()?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
  const scrollBy = (top: number) => (scrollerOf() ?? document.scrollingElement)?.scrollBy(0, top);

  const autoScroll = () => {
    const rect = visible();
    if (pointer.y < rect.top + EDGE) {
      scrollBy(-Math.ceil((rect.top + EDGE - pointer.y) / 3));
      return true;
    }
    if (pointer.y > rect.bottom - EDGE) {
      scrollBy(Math.ceil((pointer.y - (rect.bottom - EDGE)) / 3));
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
    const view = visible();
    const gridRect = grid.getBoundingClientRect();
    const end = toContent(pointer.x, pointer.y);
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    // draw in client space, cut to what is on screen
    const originX = gridRect.left - grid.scrollLeft;
    const originY = gridRect.top - grid.scrollTop;
    box.style.left = `${left + originX}px`;
    box.style.top = `${Math.max(top + originY, view.top)}px`;
    box.style.width = `${right - left}px`;
    box.style.height = `${Math.max(0, Math.min(bottom + originY, view.bottom) - Math.max(top + originY, view.top))}px`;

    for (const tile of grid.querySelectorAll<HTMLElement>(TILE)) {
      const id = tile.dataset.asset!;
      const t = tile.getBoundingClientRect();
      const tl = t.left - originX;
      const tt = t.top - originY;
      const hit = tl < right && tl + t.width > left && tt < bottom && tt + t.height > top;
      const selected = options.assetInteraction.hasSelectedAsset(id);
      if (hit && !selected) {
        const asset = options.assetFor(id);
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
    if (options.stacking === false && !sidebarDrop.available()) {
      // nothing to carry it to: the hold only selects, and moving on draws the box
      phase = 'held';
      return;
    }
    phase = 'lifted';
    const id = startTile.dataset.asset!;
    const selected = options.assetInteraction.assets;
    const selection = selected.map((asset) => asset.id);
    // a photo that is part of the selection carries the selection with it; any other photo travels alone
    fromSelection = selection.includes(id);
    dragIds = fromSelection ? [id, ...selection.filter((other) => other !== id)] : [id];
    const asset = fromSelection ? undefined : options.assetFor(id);
    carried = fromSelection ? [...selected] : asset ? [asset] : [];
    for (const dragId of dragIds) {
      tileFor(grid, dragId)?.setAttribute('data-dragging', '');
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
      count.className = 'ws-drag-count';
      count.textContent = String(dragIds.length);
      ghost.append(count);
    }
    label = document.createElement('span');
    label.className = 'ws-drag-label';
    label.hidden = true;
    ghost.append(label);
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
    if (sidebarDrop.available()) {
      sidebarDrop.begin({ ids: [...dragIds], assets: carried, source: sourceOf(location.pathname) });
    }
    moveGhost();
    // the photo glides from its tile to the cursor, then follows it without easing
    const gliding = ghost;
    setTimeout(
      () => {
        if (gliding && gliding === ghost) {
          gliding.classList.add('is-following');
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

  /** What a drop here would do, under the carried photo: "Stack", "Add to Bali", "New album" and its name. */
  const offer = (next: Offer | undefined) => {
    const said = `${next?.label ?? ''}\n${next?.detail ?? ''}`;
    if (!label || label.dataset.said === said) {
      return;
    }
    label.dataset.said = said;
    label.hidden = !next?.label;
    label.replaceChildren();
    if (next?.label) {
      const what = document.createElement('span');
      what.textContent = next.label;
      label.append(what);
    }
    if (next?.detail) {
      const detail = document.createElement('small');
      detail.textContent = next.detail;
      label.append(detail);
    }
  };

  const moveGhost = () => {
    if (!ghost || !home) {
      return;
    }
    const scale = Math.min(1, GHOST_SIZE / Math.max(home.w, home.h));
    const w = home.w * scale;
    const h = home.h * scale;
    // it hangs below and right of the pointer, with what it says under it, unless that would leave the window (New
    // album sits at the sidebar's foot)
    const up = pointer.y + 14 + h + LABEL_ROOM > innerHeight;
    const back = pointer.x + 14 + Math.max(w, LABEL_ROOM * 3) > innerWidth;
    ghost.classList.toggle('is-up', up);
    place(ghost, { x: back ? pointer.x - 14 - w : pointer.x + 14, y: up ? pointer.y - 14 - h : pointer.y + 14, w, h });
    const stack = document.elementsFromPoint(pointer.x, pointer.y);
    // over the sidebar the rows take the photos, never a photo behind them
    const sidebar = sidebarDrop.hover(stack);
    if (sidebar) {
      setDropTarget(undefined);
      offer(sidebar);
      return;
    }
    const tile =
      options.stacking === false ? undefined : stack.map((element) => element.closest<HTMLElement>(TILE)).find(Boolean);
    setDropTarget(tile && !dragIds.includes(tile.dataset.asset!) ? tile : undefined);
    offer(dropTarget ? { label: get(t)('stack') } : undefined);
  };

  const dragFrame = () => {
    const overSidebar = !!sidebarDrop.carrying && sidebarDrop.over(pointer);
    if (overSidebar ? sidebarDrop.scroll(pointer) : autoScroll()) {
      moveGhost();
    }
    frame = requestAnimationFrame(dragFrame);
  };

  /** Animate the carried photo to a tile, into a sidebar row (where the row's icon is), or back home, and remove it. */
  const settleGhost = (into: HTMLElement | undefined, { row = false } = {}) => {
    const leaving = ghost;
    ghost = undefined;
    label = undefined;
    if (!leaving) {
      return;
    }
    leaving.classList.remove('is-following', 'is-lifted');
    leaving.querySelector('.ws-drag-label')?.remove();
    const rect = into?.isConnected ? into.getBoundingClientRect() : undefined;
    if (rect && row) {
      const size = Math.min(24, rect.height);
      place(leaving, { x: rect.left + 16, y: rect.top + (rect.height - size) / 2, w: size, h: size });
    } else if (rect) {
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
    const asset = options.assetFor(id);
    if (asset && !options.locked?.(id)) {
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
    // the page's own scrolling is heard on the document
    scrolling = scrollerOf() ?? document;
    scrolling.addEventListener('scroll', onScroll, { passive: true });
  };

  const onPointerMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    const moved = Math.hypot(pointer.x - press.x, pointer.y - press.y) > THRESHOLD;
    if ((phase === 'pressed' || phase === 'held') && moved) {
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
      case 'held':
      case 'lifted': {
        // held and released in place
        toggleSelection(startTile!.dataset.asset!);
        settleGhost(startTile);
        swallowNextClick();
        break;
      }
      case 'dragging': {
        const target = dropTarget?.dataset.asset;
        const row = sidebarDrop.row;
        const into = sidebarDrop.target;
        const carry = sidebarDrop.carrying;
        if (into && carry) {
          settleGhost(row, { row: true });
          // the folders on the way to the row stay open; the photos go there once the drop's service has loaded
          sidebarDrop.end(true);
          const selection = fromSelection;
          void import('$lib/services/sidebar-drop.service')
            .then(({ dropOn }) => dropOn(into, carry))
            .then((result) => {
              if (!result) {
                return;
              }
              if (result.clear && selection) {
                options.assetInteraction.clear();
              }
              options.onSidebarDrop?.(result);
            });
        } else if (target) {
          settleGhost(dropTarget);
          // the drop target leads, so it becomes the cover; stacks it or the carried photos head merge in. The ids
          // are taken now: finish() below empties dragIds before the service has loaded, and the drop then sent the
          // target alone ("Validation failed: assetIds: Too small: expected array to have >=2 items")
          const ids = [target, ...dragIds];
          // loaded on first use: the stack service pulls in the uploader and the album service, which the
          // timeline has no other need of (and its unit test mocks around)
          void import('$lib/services/stack.service').then(({ handleStack }) => handleStack(ids));
        } else {
          settleGhost(tileFor(grid, startTile?.dataset.asset ?? ''));
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
      settleGhost(tileFor(grid, startTile?.dataset.asset ?? ''));
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
    scrolling?.removeEventListener('scroll', onScroll);
    scrolling = undefined;
    clearTimeout(liftTimer);
    liftTimer = undefined;
    cancelAnimationFrame(frame);
    box?.remove();
    box = undefined;
    settleGhost(undefined);
    for (const tile of grid.querySelectorAll<HTMLElement>('[data-dragging]')) {
      delete tile.dataset.dragging;
    }
    setDropTarget(undefined);
    // a drag that ends here without a drop on the sidebar closes the folders it opened there
    if (sidebarDrop.carrying) {
      sidebarDrop.end();
    }
    document.body.classList.remove('ws-marquee-active', 'ws-lifted', 'ws-dragging');
    phase = 'idle';
    start = undefined;
    startTile = undefined;
    home = undefined;
    dragIds = [];
    carried = [];
    fromSelection = false;
  };

  // native image dragging would hijack the gesture
  const onDragStart = (event: DragEvent) => {
    if (options.enabled) {
      event.preventDefault();
    }
  };

  sync();
  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('dragstart', onDragStart);
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
      delete grid.dataset.wsGestures;
      grid.removeEventListener('pointerdown', onPointerDown);
      grid.removeEventListener('dragstart', onDragStart);
    },
  };
};
