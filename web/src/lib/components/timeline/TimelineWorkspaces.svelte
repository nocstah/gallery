<script lang="ts">
  // Local Omarchy layer ("Tiled Workspace"): the month in view set large, with the archive's years as a
  // strip of workspace numbers beside it. The year under the viewport is the active workspace; clicking
  // another switches to it, the way SUPER+<n> switches Hyprland workspaces.
  import { thumbnailZoomManager, ZOOM_MAX, ZOOM_MIN } from '$lib/managers/thumbnail-zoom-manager.svelte';
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { ViewportTopMonth } from '$lib/managers/timeline-manager/types';
  import { locale } from '$lib/stores/preferences.store';
  import { t } from 'svelte-i18n';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';

  interface Props {
    timelineManager: TimelineManager;
    viewportMonth: ViewportTopMonth;
  }

  let { timelineManager, viewportMonth }: Props = $props();

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // months are newest first; fold them into years, keeping each year's newest month as its entry point
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

  const current = $derived.by(() => {
    if (viewportMonth && typeof viewportMonth === 'object') {
      return viewportMonth;
    }
    const first = timelineManager.scrubberMonths[0];
    if (viewportMonth === 'lead-out') {
      const last = timelineManager.scrubberMonths.at(-1);
      return last ? { year: last.year, month: last.month } : undefined;
    }
    return first ? { year: first.year, month: first.month } : undefined;
  });

  const monthCount = $derived(
    current
      ? (timelineManager.scrubberMonths.find((m) => m.year === current.year && m.month === current.month)
          ?.assetCount ?? 0)
      : 0,
  );

  const monthName = $derived(
    current
      ? new Intl.DateTimeFormat($locale, { month: 'long' }).format(new Date(current.year, current.month - 1, 1))
      : '',
  );

  // Direction of travel: older months arrive from the right, newer from the left, like moving to a
  // higher or lower workspace. Read at transition time so it never lags a switch behind.
  let lastKey = 0;
  const travel = () => {
    const key = current ? current.year * 12 + current.month : 0;
    const direction = key < lastKey ? 1 : -1;
    lastKey = key;
    return direction;
  };

  let strip = $state<HTMLElement>();
  $effect(() => {
    const year = current?.year;
    const active = strip?.querySelector<HTMLElement>(`[data-year="${year}"]`);
    active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  // Switching workspaces slides the current year out across the width and the new one in from the
  // other side, like Hyprland's workspace slide: older years arrive from the right. Only the inner
  // timeline layer moves; the scroll container is left alone. Reduced motion cuts straight to it.
  // Where a month's top must go so it starts just below the chrome: the month's own position (logical, not the
  // scrubber's percentage scale), less what the glass header covers at the top of the grid (nothing when solid)
  const monthTarget = (top: number) => {
    const grid = document.querySelector('#asset-grid');
    const rows = [...(grid?.parentElement?.children ?? [])].filter(
      (child) => child !== grid && getComputedStyle(child).position !== 'absolute',
    );
    const cover = grid && rows.length > 0 ? rows.at(-1)!.getBoundingClientRect().bottom - grid.getBoundingClientRect().top : 0;
    return Math.max(0, top - Math.max(0, cover));
  };

  let switching = false;
  const switchTo = async (year: number) => {
    const month = timelineManager.months.find((m) => m.yearMonth.year === year);
    if (!month || !current || year === current.year || switching) {
      return;
    }
    const sign = year < current.year ? 1 : -1;
    const layer = document.querySelector<HTMLElement>('#virtual-timeline');
    if (!layer || reducedMotion) {
      timelineManager.scrollTo(monthTarget(month.top));
      return;
    }
    switching = true;
    try {
      await layer.animate([{ translate: '0 0' }, { translate: `${-sign * 100}% 0` }], {
        duration: 170,
        easing: 'cubic-bezier(0.55, 0, 1, 0.45)',
        fill: 'forwards',
      }).finished;
      timelineManager.scrollTo(monthTarget(month.top));
      await layer.animate([{ translate: `${sign * 100}% 0` }, { translate: '0 0' }], {
        duration: 240,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }).finished;
    } finally {
      layer.getAnimations().forEach((animation) => animation.cancel());
      switching = false;
    }
  };

  // [ and ] step to the next older / newer year, the browser's stand-in for SUPER+<n>.
  const onKeydown = (event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    // The asset viewer's editor uses [ and ] to rotate; the timeline only listens while it is in front.
    const viewerOpen = document.querySelector('#immich-asset-viewer') !== null;
    if (viewerOpen || event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, [contenteditable]')) {
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

  // Under the years, the months of the year in view as numbers 1-12: the ones with photos jump straight there, the
  // one in view is marked, empty ones stay in place but quiet so the row keeps its shape
  const monthsOfYear = $derived.by(() => {
    if (!current) {
      return [];
    }
    const counts = new Map(
      timelineManager.scrubberMonths.filter((m) => m.year === current.year).map((m) => [m.month, m.assetCount]),
    );
    return Array.from({ length: 12 }, (_, index) => ({ month: index + 1, count: counts.get(index + 1) ?? 0 }));
  });
  const monthLabel = (month: number) =>
    current ? new Intl.DateTimeFormat($locale, { month: 'long' }).format(new Date(current.year, month - 1, 1)) : '';

  const goToMonth = (month: number) => {
    const target = current
      ? timelineManager.months.find((m) => m.yearMonth.year === current.year && m.yearMonth.month === month)
      : undefined;
    if (target) {
      timelineManager.scrollTo(monthTarget(target.top));
    }
  };

  const slide = (node: Element) =>
    fly(node, { x: reducedMotion ? 0 : travel() * 40, duration: reducedMotion ? 0 : 260, easing: cubicOut });
</script>

<svelte:window onkeydown={onKeydown} />

{#if current && years.length > 0}
  <div class="ws-workspaces" data-testid="timeline-workspaces">
    <div class="ws-now" aria-live="polite">
      {#key `${current.year}-${current.month}`}
        <div class="ws-now-label" in:slide>
          <span class="ws-month">{monthName}</span>
          <span class="ws-year">{current.year}</span>
          <span class="ws-data ws-count">{$t('items_count', { values: { count: monthCount } })}</span>
        </div>
      {/key}
    </div>

    <div class="ws-calendar">
      <nav class="ws-strip" bind:this={strip} aria-label={$t('year')}>
        {#each years as { year, count } (year)}
          <button
            type="button"
            class="ws-data ws-pill"
            data-year={year}
            aria-current={year === current.year ? 'true' : undefined}
            title={$t('items_count', { values: { count } })}
            onclick={() => void switchTo(year)}
          >
            {year}
          </button>
        {/each}
      </nav>
      <nav class="ws-months" aria-label={$t('month')}>
        {#each monthsOfYear as { month, count } (month)}
          <button
            type="button"
            class="ws-data ws-month-pill"
            aria-current={month === current.month ? 'true' : undefined}
            aria-label={`${monthLabel(month)} ${current.year}`}
            title={count > 0 ? `${monthLabel(month)} · ${$t('items_count', { values: { count } })}` : monthLabel(month)}
            disabled={count === 0}
            onclick={() => goToMonth(month)}
          >
            {month}
          </button>
        {/each}
      </nav>
    </div>

    <div class="ws-tools">
      <button
        type="button"
        class="ws-tool"
        aria-pressed={thumbnailZoomManager.dayLabels}
        aria-label={$t('day_labels')}
        title={$t('day_labels')}
        onclick={() => (thumbnailZoomManager.dayLabels = !thumbnailZoomManager.dayLabels)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="2" width="5" height="2.5" rx="0.7" class="ws-fill" />
          <rect x="2" y="6" width="12" height="8" rx="1" />
        </svg>
      </button>
      <button
        type="button"
        class="ws-tool"
        aria-pressed={thumbnailZoomManager.expandStacks}
        aria-label={$t('expand_stacks')}
        title={$t('expand_stacks')}
        onclick={() => (thumbnailZoomManager.expandStacks = !thumbnailZoomManager.expandStacks)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="4.5" y="1.8" width="9.7" height="9.7" rx="1.2" />
          <rect x="1.8" y="4.5" width="9.7" height="9.7" rx="1.2" class="ws-fill" />
        </svg>
      </button>
      <button
        type="button"
        class="ws-tool"
        aria-pressed={thumbnailZoomManager.compact}
        aria-label={$t('compact_view')}
        title={$t('compact_view')}
        onclick={() => (thumbnailZoomManager.compact = !thumbnailZoomManager.compact)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="2" width="5.5" height="5.5" class="ws-fill" />
          <rect x="8.5" y="2" width="5.5" height="5.5" class="ws-fill" />
          <rect x="2" y="8.5" width="5.5" height="5.5" class="ws-fill" />
          <rect x="8.5" y="8.5" width="5.5" height="5.5" class="ws-fill" />
        </svg>
      </button>
    </div>

    <label class="ws-zoom" title={$t('thumbnail_size')}>
      <span class="sr-only">{$t('thumbnail_size')}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true" class="ws-zoom-icon ws-zoom-small"><rect x="5" y="5" width="6" height="6" rx="1" /></svg>
      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step="0.01"
        bind:value={thumbnailZoomManager.scale}
      />
      <svg viewBox="0 0 16 16" aria-hidden="true" class="ws-zoom-icon"><rect x="2" y="2" width="12" height="12" rx="1.5" /></svg>
    </label>
  </div>
{/if}

<style>
  .ws-workspaces {
    display: flex;
    align-items: flex-end;
    gap: calc(var(--ws-gap) * 2.4);
    min-width: 0;
    padding: calc(var(--ws-gap) * 0.6) 0 calc(var(--ws-gap) * 0.8);
  }
  .ws-now {
    position: relative;
    flex: none;
    display: grid;
    min-width: 12ch;
    overflow: hidden;
  }
  .ws-now-label {
    grid-area: 1 / 1;
    display: flex;
    align-items: baseline;
    gap: 0.45em;
    white-space: nowrap;
  }
  .ws-month,
  .ws-year {
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 0.9rem + 4.6vw, 6rem);
    line-height: 0.85;
    font-weight: 800;
    font-stretch: 75%;
    font-variation-settings: 'wdth' 75, 'opsz' 96;
    letter-spacing: -0.035em;
    color: var(--immich-ui-dark);
  }
  .ws-month::first-letter {
    text-transform: uppercase;
  }
  .ws-month {
    font-weight: 500;
    font-variation-settings: 'wdth' 75, 'opsz' 96;
  }
  .ws-count {
    align-self: flex-end;
    padding-bottom: 0.3em;
    font-size: 12px;
    color: var(--immich-ui-muted);
  }

  .ws-calendar {
    display: grid;
    flex: 0 1 auto;
    gap: 0.2rem;
    min-width: 0;
  }
  .ws-months {
    display: flex;
    gap: 2px;
    padding-inline: 2rem 3rem;
  }
  .ws-month-pill {
    flex: none;
    min-width: 2.1rem;
    padding: 0.2rem 0.35rem;
    border-radius: var(--ws-radius);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
    transition:
      background-color 120ms,
      color 120ms;
  }
  .ws-month-pill:not(:disabled):hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
  }
  .ws-month-pill:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .ws-month-pill[aria-current='true'] {
    color: var(--immich-ui-dark);
    box-shadow: inset 0 -2px 0 var(--ws-accent);
  }
  .ws-month-pill:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
  }
  .ws-strip {
    display: flex;
    gap: calc(var(--ws-gap) * 0.4);
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 0.35rem;
    mask-image: linear-gradient(to right, transparent, black 2rem, black calc(100% - 2rem), transparent);
    padding-inline: 2rem 3rem;
  }
  .ws-strip::-webkit-scrollbar {
    display: none;
  }
  .ws-pill {
    flex: none;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding: 0.3rem 0.55rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
    transition:
      background-color 120ms,
      color 120ms;
  }
  .ws-pill:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
  }
  .ws-pill[aria-current='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-pill:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }


  .ws-tools {
    flex: none;
    display: flex;
    gap: 2px;
    margin-inline-start: auto;
    margin-bottom: 0.3rem;
    padding: 2px;
    border: 1px solid var(--ws-hairline);
    border-radius: calc(var(--ws-radius) + 7px);
  }
  .ws-tool {
    display: grid;
    place-items: center;
    width: 28px;
    height: 26px;
    border-radius: calc(var(--ws-radius) + 5px);
    color: var(--immich-ui-muted);
    transition:
      background-color 120ms,
      color 120ms;
  }
  .ws-tool svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
  }
  .ws-tool .ws-fill {
    fill: currentColor;
    stroke: none;
  }
  .ws-tool:hover {
    color: var(--immich-ui-dark);
  }
  .ws-tool[aria-pressed='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-tool:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-zoom {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding-bottom: 0.45rem;
    color: var(--immich-ui-muted);
  }
  .ws-zoom-icon {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
  }
  .ws-zoom-small {
    width: 11px;
    height: 11px;
  }
  .ws-zoom input {
    width: 7rem;
    accent-color: var(--immich-ui-dark);
    cursor: pointer;
  }
  .ws-zoom input:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 4px;
  }

  @media (max-width: 767px) {
    .ws-zoom {
      display: none;
    }
    .ws-workspaces {
      flex-direction: column;
      align-items: stretch;
      gap: 0.4rem;
    }
    .ws-strip,
    .ws-months {
      padding-inline: 0;
      mask-image: none;
    }
  }
</style>
