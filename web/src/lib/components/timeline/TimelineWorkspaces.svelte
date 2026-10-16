<script lang="ts">
  // Local Omarchy layer ("Tiled Workspace"): the timeline's place in time, in the middle of the one bar
  // (components/omarchy/OmarchyBar.svelte, via lib/managers/bar-slot). One calm line that never rearranges itself:
  // the month in view as the heading (its month name opens the Months overview, its year the Years overview) and
  // every year of the archive on a strip that scrolls (wheel, drag, the arrows at its ends, the keyboard). Clicking a
  // year switches to it the way SUPER+<n> switches Hyprland workspaces. The months are left to the scrubber and the
  // Months overview: a row of twelve took the room the years need in a narrower window. A narrower bar shows fewer
  // years and a shorter month name; nothing folds, moves or opens over the photos.
  import TimelineMonthHeading from '$lib/components/timeline/TimelineMonthHeading.svelte';
  import { monthInView } from '$lib/managers/timeline-heading.svelte';
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineGrouping, ViewportTopMonth } from '$lib/managers/timeline-manager/types';
  import { desktopMotion } from '$lib/utils/desktop-motion';
  import { Icon } from '@immich/ui';
  import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    timelineManager: TimelineManager;
    viewportMonth: ViewportTopMonth;
    /** the month name opens the Months overview, the year the Years overview */
    onGrouping?: (grouping: TimelineGrouping) => void;
  }

  let { timelineManager, viewportMonth, onGrouping }: Props = $props();

  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // months come in timeline order (newest first unless the timeline runs oldest first); fold them into years
  const years = $derived.by(() => {
    const out: { year: number; count: number }[] = [];
    for (const month of timelineManager.scrubberMonths) {
      const last = out.at(-1);
      if (last?.year === month.year) {
        last.count += month.assetCount;
      } else {
        out.push({ year: month.year, count: month.assetCount });
      }
    }
    return out;
  });

  // the month heading (TimelineMonthHeading) holds the width of its longest month name, so the years beside it stay put
  // as the photos scroll from May to September
  const current = $derived(monthInView(timelineManager, viewportMonth));

  const itemsLabel = (count: number) => $t('items_count', { values: { count } });

  // Where a month's top must go so it starts just below the chrome: the month's own position (logical, not the
  // scrubber's percentage scale), less whatever floats over the top of the grid (the glass bar; nothing when solid)
  const monthTarget = (top: number) => {
    const grid = document.querySelector('#asset-grid');
    if (!grid) {
      return top;
    }
    const gridTop = grid.getBoundingClientRect().top;
    const covers = [document.querySelector('#dashboard-navbar'), ...(grid.parentElement?.children ?? [])].filter(
      (element): element is Element =>
        !!element && element !== grid && getComputedStyle(element).position !== 'absolute',
    );
    const cover = Math.max(0, ...covers.map((element) => element.getBoundingClientRect().bottom - gridTop));
    return Math.max(0, top - cover);
  };

  // Switching workspaces moves the timeline the way the desktop switches its workspaces (the hook's
  // --ws-workspace-* tokens: Hyprland's workspaces animation; the owner's is slidefade 20% on its snap
  // curve): the current year slides away and fades, the new one comes in from the other side. Older
  // years arrive from the right. Only the inner timeline layer moves; the scroll container is left
  // alone. Reduced motion, or the desktop's workspace animation off, cuts straight to it. A year opens
  // at its first month in timeline order.
  let switching = false;
  const switchTo = async (year: number) => {
    const target = timelineManager.months.find((m) => m.yearMonth.year === year);
    if (!target || !current || year === current.year || switching) {
      return;
    }
    const sign = year < current.year ? 1 : -1;
    const layer = document.querySelector<HTMLElement>('#virtual-timeline');
    const { workspace } = desktopMotion();
    if (!layer || reducedMotion || workspace.duration === 0) {
      timelineManager.scrollTo(monthTarget(target.top));
      return;
    }
    const shift = workspace.shift * 100;
    const faded = workspace.fade ? 0 : 1;
    switching = true;
    try {
      await layer.animate(
        [
          { translate: '0 0', opacity: 1 },
          { translate: `${-sign * shift}% 0`, opacity: faded },
        ],
        {
          duration: workspace.duration * 0.4,
          easing: 'cubic-bezier(0.55, 0, 1, 0.45)',
          fill: 'forwards',
        },
      ).finished;
      timelineManager.scrollTo(monthTarget(target.top));
      await layer.animate(
        [
          { translate: `${sign * shift}% 0`, opacity: faded },
          { translate: '0 0', opacity: 1 },
        ],
        { duration: workspace.duration * 0.6, easing: workspace.ease },
      ).finished;
    } finally {
      for (const animation of layer.getAnimations()) {
        animation.cancel();
      }
      switching = false;
    }
  };

  // ---- the year strip: it scrolls under the wheel, a drag, its arrows and the keys; the year in view is brought to
  // its middle as the photos scroll, unless the pointer is on the strip or it was just moved by hand ----
  let track = $state<HTMLElement>();
  let atStart = $state(true);
  let atEnd = $state(true);
  let hovering = false;
  let touched = 0;
  const HANDS_OFF = 2000; // ms after a hand on the strip before it follows the photos again

  const edges = () => {
    if (track) {
      atStart = track.scrollLeft <= 1;
      atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
    }
  };

  const page = (direction: -1 | 1) => {
    touched = Date.now();
    track?.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  let centred = false;
  $effect(() => {
    const year = current?.year;
    if (!track || year === undefined) {
      return;
    }
    untrack(() => {
      if (centred && (hovering || Date.now() - touched < HANDS_OFF)) {
        return;
      }
      const item = track?.querySelector<HTMLElement>(`[data-year="${CSS.escape(String(year))}"]`);
      if (!track || !item) {
        return;
      }
      const left = item.offsetLeft - (track.clientWidth - item.offsetWidth) / 2;
      track.scrollTo({ left, behavior: centred && !reducedMotion ? 'smooth' : 'auto' });
      centred = true;
      edges();
    });
  });

  $effect(() => {
    if (!track) {
      return;
    }
    const resized = new ResizeObserver(() => edges());
    resized.observe(track);
    edges();
    return () => resized.disconnect();
  });

  // an upright wheel turns the strip sideways (the bar has nothing else to scroll)
  const sideways = (node: HTMLElement) => {
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : 0;
      if (!delta || node.scrollWidth <= node.clientWidth) {
        return;
      }
      event.preventDefault();
      touched = Date.now();
      node.scrollLeft += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? delta * 16 : delta;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return { destroy: () => node.removeEventListener('wheel', onWheel) };
  };

  // a mouse drag along the strip moves it; the click that ends a drag picks no year
  let drag: { x: number; left: number; moved: boolean } | undefined;
  const swallowClick = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  const dragMove = (event: PointerEvent) => {
    if (!drag || !track) {
      return;
    }
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 5) {
      return;
    }
    drag.moved = true;
    touched = Date.now();
    track.scrollLeft = drag.left - dx;
  };
  const dragEnd = () => {
    removeEventListener('pointermove', dragMove);
    if (drag?.moved && track) {
      const strip = track;
      strip.addEventListener('click', swallowClick, { capture: true, once: true });
      requestAnimationFrame(() => strip.removeEventListener('click', swallowClick, { capture: true }));
    }
    drag = undefined;
  };
  const dragStart = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !track) {
      return;
    }
    drag = { x: event.clientX, left: track.scrollLeft, moved: false };
    addEventListener('pointermove', dragMove);
    addEventListener('pointerup', dragEnd, { once: true });
  };

  // the years are a toolbar: one tab stop, arrow keys (and Home, End) move along it
  const roving = (event: KeyboardEvent) => {
    const group = event.currentTarget as HTMLElement;
    const items = [...group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) {
      return;
    }
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': {
        next = at - 1;
        break;
      }
      case 'ArrowRight': {
        next = at + 1;
        break;
      }
      case 'Home': {
        next = 0;
        break;
      }
      case 'End': {
        next = items.length - 1;
        break;
      }
      default: {
        return;
      }
    }
    // the timeline's own arrow keys (move the photo focus) must not fire as well
    event.preventDefault();
    event.stopPropagation();
    const target = items[Math.max(0, Math.min(items.length - 1, next))];
    for (const item of items) {
      item.tabIndex = item === target ? 0 : -1;
    }
    touched = Date.now();
    target.focus();
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  // [ and ] step to the next older / newer year, the browser's stand-in for SUPER+<n>.
  const onKeydown = (event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    // The asset viewer's editor uses [ and ] to rotate; the timeline only listens while it is in front.
    const viewerOpen = document.querySelector('#immich-asset-viewer') !== null;
    if (
      viewerOpen ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      target?.closest('input, textarea, [contenteditable]')
    ) {
      return;
    }
    if ((event.key !== '[' && event.key !== ']') || !current) {
      return;
    }
    const index = years.findIndex(({ year }) => year === current.year);
    const next = years[index + (event.key === '[' ? 1 : -1)];
    if (next) {
      event.preventDefault();
      void switchTo(next.year);
    }
  };
</script>

<svelte:window onkeydown={onKeydown} />

{#if current && years.length > 0}
  <div class="ws-time" data-testid="timeline-workspaces">
    <TimelineMonthHeading month={current} {onGrouping} />

    <span class="ws-split" aria-hidden="true"></span>

    <div class="ws-years" data-start={atStart ? '' : undefined} data-end={atEnd ? '' : undefined}>
      <button
        type="button"
        class="ws-step"
        tabindex="-1"
        aria-hidden="true"
        title={$t('previous')}
        onclick={() => page(-1)}
      >
        <Icon icon={mdiChevronLeft} size="16" />
      </button>
      <div
        class="ws-track"
        role="toolbar"
        aria-label={$t('year')}
        tabindex="-1"
        bind:this={track}
        use:sideways
        onscroll={edges}
        onkeydown={roving}
        onpointerdown={dragStart}
        onpointerenter={() => (hovering = true)}
        onpointerleave={() => (hovering = false)}
      >
        {#each years as { year, count } (year)}
          <button
            type="button"
            class="ws-cell ws-cell-year"
            data-year={year}
            data-decade={year % 10 === 0 ? '' : undefined}
            aria-current={year === current.year ? 'true' : undefined}
            title={itemsLabel(count)}
            tabindex={year === current.year ? 0 : -1}
            onclick={() => void switchTo(year)}
          >
            {year}
          </button>
        {/each}
      </div>
      <button type="button" class="ws-step" tabindex="-1" aria-hidden="true" title={$t('next')} onclick={() => page(1)}>
        <Icon icon={mdiChevronRight} size="16" />
      </button>
    </div>
  </div>
{/if}

<style>
  .ws-time {
    container-type: inline-size;
    display: flex;
    flex: 1;
    gap: 0.75rem;
    align-items: center;
    min-width: 0;
    height: 100%;
  }

  /* the years: one row of mono numerals; the one in view inverted, like the Omarchy bar's active workspace */
  .ws-track {
    display: flex;
    gap: 1px;
    align-items: center;
  }
  .ws-cell {
    flex: none;
    min-width: 1.4rem;
    height: 1.5rem;
    padding: 0 0.3rem;
    border-radius: var(--ws-radius);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.5rem;
    color: var(--immich-ui-muted);
    transition:
      background-color 120ms,
      color 120ms;
  }
  .ws-cell:not(:disabled):hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-cell[aria-current='true'],
  .ws-cell[aria-current='true']:hover {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-cell:focus-visible,
  .ws-step:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  /* each decade's first year in ink, so the strip reads in tens at a glance */
  .ws-cell-year[data-decade]:not([aria-current='true']) {
    color: color-mix(in oklab, var(--immich-ui-dark) 82%, var(--immich-ui-muted));
  }

  /* a hairline from the bar's top edge to its bottom between where you are and where you can go */
  .ws-split {
    flex: none;
    align-self: stretch;
    width: 1px;
    background: var(--ws-hairline);
  }

  /* the strip: scrolls sideways; its arrows lie over its faded edges, and both show only where there is more to see,
     so the years never shift when one appears */
  .ws-years {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    min-width: 4rem;
  }
  .ws-track {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    user-select: none;
    --fade: 1.25rem;
    mask-image: linear-gradient(to right, transparent, black var(--fade), black calc(100% - var(--fade)), transparent);
  }
  .ws-track::-webkit-scrollbar {
    display: none;
  }
  .ws-years[data-start] .ws-track {
    mask-image: linear-gradient(to right, black calc(100% - var(--fade)), transparent);
  }
  .ws-years[data-end] .ws-track {
    mask-image: linear-gradient(to right, transparent, black var(--fade));
  }
  .ws-years[data-start][data-end] .ws-track {
    mask-image: none;
  }
  .ws-step {
    position: absolute;
    top: 50%;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 1.25rem;
    height: 1.5rem;
    translate: 0 -50%;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
  }
  .ws-step:first-child {
    left: 0;
  }
  .ws-step:last-child {
    right: 0;
  }
  .ws-step:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-years[data-start] .ws-step:first-child,
  .ws-years[data-end] .ws-step:last-child {
    visibility: hidden;
  }

  /* narrower bars keep the same line: a short month name first (TimelineMonthHeading), and only where not even a year
     fits beside it the heading alone (a phone) */
  @container (max-width: 190px) {
    .ws-split,
    .ws-years {
      display: none;
    }
  }
</style>
