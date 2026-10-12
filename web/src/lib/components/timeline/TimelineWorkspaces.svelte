<script lang="ts">
  // Local Omarchy layer ("Tiled Workspace"): the timeline's place in time, set into the middle of the one bar
  // (components/omarchy/OmarchyBar.svelte, via lib/managers/bar-slot). The month in view as the bar's heading (its
  // month name opens the Months overview, its year the Years overview), and beside it a fisheye ruler of the whole
  // archive: every decade is one label (1990s, 2000s...), the decade in view also lays out its years after its label
  // and the year in view its months, so fifty years fit on one line. Clicking a year switches to it the way
  // SUPER+<n> switches Hyprland workspaces; clicking a decade opens its map, every month of its years as a square
  // shaded by how many photos it holds, so any month of the archive is two clicks away.
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineGrouping, ViewportTopMonth } from '$lib/managers/timeline-manager/types';
  import { locale } from '$lib/stores/preferences.store';
  import { Icon } from '@immich/ui';
  import { mdiChevronLeft, mdiChevronRight, mdiTune } from '@mdi/js';
  import { tick, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';

  interface Props {
    timelineManager: TimelineManager;
    viewportMonth: ViewportTopMonth;
    /** the page's filter panel, when it is folded away (its reopen button lives here, at the end of the ruler) */
    onFilters?: () => void;
    filterActive?: boolean;
    /** the month name opens the Months overview, the year the Years overview */
    onGrouping?: (grouping: TimelineGrouping) => void;
  }

  let { timelineManager, viewportMonth, onFilters, filterActive = false, onGrouping }: Props = $props();

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  const monthLabel = (year: number, month: number, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat($locale, { month: style }).format(new Date(year, month - 1, 1));
  const monthName = $derived(current ? monthLabel(current.year, current.month) : '');

  // The fisheye: every decade is a label (which opens its map), and the decade in view opens into its years after
  // it, the year in view into its months
  const decadeOf = (year: number) => Math.floor(year / 10) * 10;
  type Decade = { kind: 'decade'; key: string; decade: number; count: number };
  type Rule = Decade | { kind: 'year'; key: string; year: number; count: number };
  const ruler = $derived.by(() => {
    if (!current) {
      return [];
    }
    const focus = decadeOf(current.year);
    const out: Rule[] = [];
    let label: Decade | undefined;
    for (const { year, count } of years) {
      const decade = decadeOf(year);
      if (label?.decade !== decade) {
        label = { kind: 'decade', key: `d${decade}`, decade, count: 0 };
        out.push(label);
      }
      label.count += count;
      if (decade === focus) {
        out.push({ kind: 'year', key: `y${year}`, year, count });
      }
    }
    return out;
  });

  const monthsOfYear = $derived.by(() => {
    if (!current) {
      return [];
    }
    const counts = new Map(
      timelineManager.scrubberMonths.filter((m) => m.year === current.year).map((m) => [m.month, m.assetCount]),
    );
    return Array.from({ length: 12 }, (_, index) => ({ month: index + 1, count: counts.get(index + 1) ?? 0 }));
  });

  // Direction of travel: older months arrive from the right, newer from the left, like moving to a
  // higher or lower workspace. Read at transition time so it never lags a switch behind.
  let lastKey = 0;
  const travel = () => {
    const key = current ? current.year * 12 + current.month : 0;
    const direction = key < lastKey ? 1 : -1;
    lastKey = key;
    return direction;
  };
  const slide = (node: Element) =>
    fly(node, { x: reducedMotion ? 0 : travel() * 24, duration: reducedMotion ? 0 : 240, easing: cubicOut });

  // The whole ruler always fits the bar: when it is too wide it tightens a step at a time until it does. 1 drops the
  // count, 2 shortens the decade's other years to '25, 3 folds them away (their decade's label, whose map holds them,
  // stands in for them), 4 puts the other decades away (the decade map steps to them with its arrows), and only 5
  // puts the month tray away (the month name still opens the Months overview, the decade's map still reaches every
  // month). Re-fitted when the bar or the ruler changes.
  const TIGHTEST = 5;
  let fit = $state(0);
  // plain, not state: the effect below must not re-run because a fit is in progress (it would loop forever)
  let fitting = false;
  let rulerBox = $state<HTMLElement>();
  let timeBox = $state<HTMLElement>();
  const refit = async () => {
    if (!rulerBox || fitting) {
      return;
    }
    fitting = true;
    try {
      fit = 0;
      await tick();
      while (fit < TIGHTEST && rulerBox && rulerBox.scrollWidth > rulerBox.clientWidth + 1) {
        fit++;
        await tick();
      }
    } finally {
      fitting = false;
    }
  };
  $effect(() => {
    void current?.year;
    void ruler.length;
    if (!timeBox) {
      return;
    }
    const observer = new ResizeObserver(() => void untrack(refit));
    observer.observe(timeBox);
    void untrack(refit);
    return () => observer.disconnect();
  });
  const shortYear = (year: number) => `’${String(year).slice(2)}`;
  // cells jump into place while the ruler is being fitted, and glide when the year changes
  const flipDuration = () => (reducedMotion || fitting ? 0 : 260);

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

  // Switching workspaces slides the current year out across the width and the new one in from the
  // other side, like Hyprland's workspace slide: older years arrive from the right. Only the inner
  // timeline layer moves; the scroll container is left alone. Reduced motion cuts straight to it.
  // A year opens at its first month in timeline order, or at the month asked for; within the year in view there is
  // nothing to slide, it goes straight to the month.
  let switching = false;
  const switchTo = async (year: number, month?: number) => {
    const target = timelineManager.months.find(
      (m) => m.yearMonth.year === year && (month === undefined || m.yearMonth.month === month),
    );
    if (!target || !current || switching) {
      return;
    }
    if (year === current.year) {
      if (month !== undefined) {
        timelineManager.scrollTo(monthTarget(target.top));
      }
      return;
    }
    const sign = year < current.year ? 1 : -1;
    const layer = document.querySelector<HTMLElement>('#virtual-timeline');
    if (!layer || reducedMotion) {
      timelineManager.scrollTo(monthTarget(target.top));
      return;
    }
    switching = true;
    try {
      await layer.animate([{ translate: '0 0' }, { translate: `${-sign * 100}% 0` }], {
        duration: 170,
        easing: 'cubic-bezier(0.55, 0, 1, 0.45)',
        fill: 'forwards',
      }).finished;
      timelineManager.scrollTo(monthTarget(target.top));
      await layer.animate([{ translate: `${sign * 100}% 0` }, { translate: '0 0' }], {
        duration: 240,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }).finished;
    } finally {
      layer.getAnimations().forEach((animation) => animation.cancel());
      switching = false;
    }
  };

  const goToMonth = (month: number) => {
    if (current) {
      void switchTo(current.year, month);
    }
  };

  // A decade's map: a sheet hanging from its label with the decade's years (timeline order) by their twelve months,
  // each month a square shaded in four steps by how full it is among the decade's months (quartiles). A square jumps
  // to its month, a year to the year. Arrow keys walk the squares; the line on top reads the decade, or the month
  // under the pointer or the keys.
  const mapId = 'ws-decade-map';
  let mapFor = $state<number>();
  let mapAt = $state({ x: 0, y: 0 });
  let mapBox = $state<HTMLElement>();
  let mapOpener: HTMLElement | undefined;
  // the square that holds the map's one tab stop, and the one the readout describes (`year-month`, 0 for the year)
  let mapStop = $state<string>();
  let mapPeek = $state<string>();

  const itemsLabel = (count: number) => $t('items_count', { values: { count } });
  const initials = $derived(
    Array.from({ length: 12 }, (_, index) =>
      new Intl.DateTimeFormat($locale, { month: 'narrow' }).format(new Date(2000, index, 1)),
    ),
  );

  const decadeMap = $derived.by(() => {
    if (mapFor === undefined) {
      return;
    }
    const rows: { year: number; count: number; months: number[] }[] = [];
    for (const { year, month, assetCount } of timelineManager.scrubberMonths) {
      if (decadeOf(year) !== mapFor) {
        continue;
      }
      let row = rows.at(-1);
      if (row?.year !== year) {
        row = { year, count: 0, months: Array.from({ length: 12 }, () => 0) };
        rows.push(row);
      }
      row.count += assetCount;
      row.months[month - 1] += assetCount;
    }
    // shaded by quartile among the decade's months that hold anything: one outsized month (a holiday, an import)
    // would flatten any scale measured against the fullest
    const busy = rows.flatMap((row) => row.months.filter((count) => count > 0)).sort((a, b) => a - b);
    const cuts = [0.25, 0.5, 0.75].map((share) => busy[Math.floor(share * (busy.length - 1))] ?? 0);
    const level = (count: number) => (count === 0 ? 0 : 1 + cuts.filter((cut) => count > cut).length);
    return {
      decade: mapFor,
      count: rows.reduce((sum, row) => sum + row.count, 0),
      rows: rows.map((row) => ({
        ...row,
        months: row.months.map((count, index) => ({ month: index + 1, count, level: level(count) })),
      })),
    };
  });
  const firstStop = $derived(decadeMap?.rows[0] ? `${decadeMap.rows[0].year}-0` : undefined);

  const peekText = $derived.by(() => {
    if (!decadeMap) {
      return '';
    }
    const [year, month] = (mapPeek ?? '').split('-').map(Number);
    const row = decadeMap.rows.find((candidate) => candidate.year === year);
    if (!row) {
      return `${decadeMap.decade}s · ${itemsLabel(decadeMap.count)}`;
    }
    return month
      ? `${monthLabel(year, month)} ${year} · ${itemsLabel(row.months[month - 1].count)}`
      : `${year} · ${itemsLabel(row.count)}`;
  });

  const closeMap = (refocus = false) => {
    mapFor = undefined;
    mapPeek = undefined;
    if (refocus && mapOpener?.isConnected) {
      mapOpener.focus();
    }
  };

  const openMap = async (decade: number, opener: HTMLElement) => {
    if (mapFor === decade) {
      closeMap();
      return;
    }
    if (!timeBox) {
      return;
    }
    const frame = timeBox.getBoundingClientRect();
    const anchor = opener.getBoundingClientRect();
    mapOpener = opener;
    mapPeek = undefined;
    mapStop = current && decadeOf(current.year) === decade ? `${current.year}-${current.month}` : undefined;
    mapAt = { x: anchor.left - frame.left, y: anchor.bottom - frame.top + 8 };
    mapFor = decade;
    await tick();
    if (!mapBox) {
      return;
    }
    // hangs from its label, kept 8px inside the window
    const width = mapBox.offsetWidth;
    mapAt.x = Math.max(8 - frame.left, Math.min(mapAt.x, window.innerWidth - 8 - width - frame.left));
    mapBox.querySelector<HTMLElement>('[data-cell][tabindex="0"]')?.focus();
  };

  // the map's arrows (and PageUp / PageDown) step to the decade beside it in the ruler, so every decade stays a click
  // away once the ruler has put the other decades away
  const decades = $derived([...new Set(years.map(({ year }) => decadeOf(year)))]);
  const besideMap = (direction: -1 | 1) =>
    mapFor === undefined ? undefined : decades[decades.indexOf(mapFor) + direction];
  const stepMap = async (direction: -1 | 1, focusGrid = false) => {
    const next = besideMap(direction);
    if (next === undefined) {
      return;
    }
    mapFor = next;
    mapPeek = undefined;
    mapStop = current && decadeOf(current.year) === next ? `${current.year}-${current.month}` : undefined;
    if (focusGrid) {
      await tick();
      mapBox?.querySelector<HTMLElement>('[data-cell][tabindex="0"]')?.focus();
    }
  };

  const pick = (year: number, month?: number) => {
    closeMap(true);
    void switchTo(year, month);
  };

  // the cells run row by row, the year first (column 0), then January to December (1-12)
  const onMapKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMap(true);
      return;
    }
    const from = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-cell]') : null;
    if (!from || !mapBox) {
      return;
    }
    const cells = [...mapBox.querySelectorAll<HTMLElement>('[data-cell]:not(:disabled)')];
    const rowOf = (cell: HTMLElement) => Number(cell.dataset.row);
    const colOf = (cell: HTMLElement) => Number(cell.dataset.col);
    const row = rowOf(from);
    const col = colOf(from);
    const nearestIn = (target: number) =>
      cells
        .filter((cell) => rowOf(cell) === target)
        .reduce<HTMLElement | undefined>(
          (best, cell) => (!best || Math.abs(colOf(cell) - col) < Math.abs(colOf(best) - col) ? cell : best),
          undefined,
        );
    let next: HTMLElement | undefined;
    switch (event.key) {
      case 'ArrowLeft': {
        next = cells.findLast((cell) => rowOf(cell) === row && colOf(cell) < col);
        break;
      }
      case 'ArrowRight': {
        next = cells.find((cell) => rowOf(cell) === row && colOf(cell) > col);
        break;
      }
      case 'ArrowUp': {
        next = nearestIn(row - 1);
        break;
      }
      case 'ArrowDown': {
        next = nearestIn(row + 1);
        break;
      }
      case 'Home': {
        next = cells.find((cell) => rowOf(cell) === row);
        break;
      }
      case 'End': {
        next = cells.findLast((cell) => rowOf(cell) === row);
        break;
      }
      case 'PageUp':
      case 'PageDown': {
        event.preventDefault();
        event.stopPropagation();
        void stepMap(event.key === 'PageUp' ? -1 : 1, true);
        return;
      }
      default: {
        return;
      }
    }
    // the timeline's own arrow keys (focus the next photo) must not fire as well
    event.preventDefault();
    event.stopPropagation();
    if (next) {
      next.focus();
      mapPeek = next.dataset.key;
    }
  };

  const onMapFocusIn = (event: FocusEvent) => {
    const cell = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-cell]') : null;
    if (cell?.dataset.key) {
      mapStop = cell.dataset.key;
    }
  };

  // Tab out of the map closes it (back to its label keeps it, the label toggles it)
  const onMapFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && !mapBox?.contains(next) && !mapOpener?.contains(next)) {
      closeMap();
    }
  };

  const onMapHover = (event: PointerEvent) => {
    const cell = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-cell]') : null;
    if (cell?.dataset.key) {
      mapPeek = cell.dataset.key;
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (mapFor !== undefined && !mapBox?.contains(target) && !mapOpener?.contains(target)) {
      closeMap();
    }
  };

  // the map belongs to the bar where it was opened: any scroll of the page (the bar may slide away) closes it
  $effect(() => {
    if (mapFor === undefined) {
      return;
    }
    const onScroll = (event: Event) => {
      const target = event.target as Node;
      if (!mapBox?.contains(target) && !rulerBox?.contains(target)) {
        closeMap();
      }
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  });

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
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onPointerDown} />

{#if current && years.length > 0}
  <div class="ws-time" data-testid="timeline-workspaces" data-fit={fit} bind:this={timeBox}>
    <div class="ws-now" aria-live="polite">
      {#key `${current.year}-${current.month}`}
        <div class="ws-now-label" in:slide>
          <button
            type="button"
            class="ws-month ws-now-link"
            title={$t('timeline_grouping_months')}
            disabled={!onGrouping}
            onclick={() => onGrouping?.('month')}>{monthName}</button
          >
          <button
            type="button"
            class="ws-year ws-now-link"
            title={$t('timeline_grouping_years')}
            disabled={!onGrouping}
            onclick={() => onGrouping?.('year')}>{current.year}</button
          >
          <span class="ws-count">{$t('items_count', { values: { count: monthCount } })}</span>
        </div>
      {/key}
    </div>

    <nav class="ws-ruler" bind:this={rulerBox} aria-label={$t('year')}>
      {#each ruler as rule (rule.key)}
        <span
          class="ws-rule-cell"
          data-other={rule.kind === 'year' && rule.year !== current.year ? '' : undefined}
          data-far={rule.kind === 'decade' && rule.decade !== decadeOf(current.year) ? '' : undefined}
          animate:flip={{ duration: flipDuration(), easing: cubicOut }}
        >
          {#if rule.kind === 'decade'}
            <button
              type="button"
              class="ws-rule ws-rule-decade"
              title={itemsLabel(rule.count)}
              aria-haspopup="dialog"
              aria-expanded={mapFor === rule.decade}
              aria-controls={mapFor === rule.decade ? mapId : undefined}
              onclick={(event) => void openMap(rule.decade, event.currentTarget)}
            >
              {rule.decade}s
            </button>
          {:else}
            <button
              type="button"
              class="ws-rule ws-rule-year"
              data-year={rule.year}
              aria-current={rule.year === current.year ? 'true' : undefined}
              title={itemsLabel(rule.count)}
              aria-label={String(rule.year)}
              onclick={() => void switchTo(rule.year)}
            >
              {fit >= 2 && rule.year !== current.year ? shortYear(rule.year) : rule.year}
            </button>
            {#if rule.year === current.year}
              <span class="ws-rule-months" role="group" aria-label={$t('month')} in:fade={{ duration: 160 }}>
                {#each monthsOfYear as { month, count } (month)}
                  <button
                    type="button"
                    class="ws-rule ws-rule-month"
                    aria-current={month === current.month ? 'true' : undefined}
                    aria-label={`${monthLabel(current.year, month)} ${current.year}`}
                    title={count > 0
                      ? `${monthLabel(current.year, month)} · ${$t('items_count', { values: { count } })}`
                      : monthLabel(current.year, month)}
                    disabled={count === 0}
                    onclick={() => goToMonth(month)}
                  >
                    {month}
                  </button>
                {/each}
              </span>
            {/if}
          {/if}
        </span>
      {/each}
    </nav>

    {#if decadeMap}
      <div
        id={mapId}
        class="ws-map"
        role="dialog"
        tabindex="-1"
        aria-label="{decadeMap.decade}s"
        style:left="{mapAt.x}px"
        style:top="{mapAt.y}px"
        bind:this={mapBox}
        onkeydown={onMapKeydown}
        onfocusin={onMapFocusIn}
        onfocusout={onMapFocusOut}
      >
        <div class="ws-map-head">
          <button
            type="button"
            class="ws-map-step"
            aria-label={besideMap(-1) === undefined ? undefined : `${besideMap(-1)}s`}
            title={besideMap(-1) === undefined ? undefined : `${besideMap(-1)}s`}
            disabled={besideMap(-1) === undefined}
            onclick={() => void stepMap(-1)}
          >
            <Icon icon={mdiChevronLeft} size="16" />
          </button>
          <p class="ws-map-peek">{peekText}</p>
          <button
            type="button"
            class="ws-map-step"
            aria-label={besideMap(1) === undefined ? undefined : `${besideMap(1)}s`}
            title={besideMap(1) === undefined ? undefined : `${besideMap(1)}s`}
            disabled={besideMap(1) === undefined}
            onclick={() => void stepMap(1)}
          >
            <Icon icon={mdiChevronRight} size="16" />
          </button>
        </div>
        <div class="ws-map-grid" role="presentation" onpointerover={onMapHover} onpointerleave={() => (mapPeek = undefined)}>
          <span></span>
          {#each initials as initial, index (index)}
            <span class="ws-map-initial" aria-hidden="true">{initial}</span>
          {/each}
          {#each decadeMap.rows as row, rowIndex (row.year)}
            <button
              type="button"
              class="ws-map-year"
              data-cell
              data-key="{row.year}-0"
              data-row={rowIndex}
              data-col="0"
              tabindex={`${row.year}-0` === (mapStop ?? firstStop) ? 0 : -1}
              aria-current={row.year === current.year ? 'true' : undefined}
              aria-label="{row.year} · {itemsLabel(row.count)}"
              onclick={() => pick(row.year)}
            >
              {row.year}
            </button>
            {#each row.months as { month, count, level } (month)}
              <button
                type="button"
                class="ws-map-month"
                data-cell
                data-key="{row.year}-{month}"
                data-row={rowIndex}
                data-col={month}
                data-level={level}
                tabindex={`${row.year}-${month}` === (mapStop ?? firstStop) ? 0 : -1}
                aria-current={row.year === current.year && month === current.month ? 'true' : undefined}
                aria-label="{monthLabel(row.year, month)} {row.year} · {itemsLabel(count)}"
                disabled={count === 0}
                onclick={() => pick(row.year, month)}
              ></button>
            {/each}
          {/each}
        </div>
      </div>
    {/if}

    {#if onFilters}
      <button
        type="button"
        class="ws-bar-icon"
        aria-label={$t('filters')}
        title={$t('filters')}
        data-testid="filter-toggle-btn"
        onclick={onFilters}
      >
        <Icon icon={mdiTune} size="20" />
        {#if filterActive}<span class="ws-bar-dot" aria-hidden="true"></span>{/if}
      </button>
    {/if}
  </div>
{/if}

<style>
  .ws-time {
    container-type: inline-size;
    position: relative;
    display: flex;
    flex: 1;
    gap: 1.25rem;
    align-items: center;
    min-width: 0;
    height: 100%;
  }

  /* the heading: the month in view in the display face, condensed, the month at 500 against the year at 800 */
  .ws-now {
    display: grid;
    flex: none;
    overflow: hidden;
  }
  .ws-now-label {
    grid-area: 1 / 1;
    display: flex;
    gap: 0.3em;
    align-items: baseline;
    white-space: nowrap;
  }
  .ws-now-link {
    padding: 0;
    background: none;
    font-family: var(--font-display);
    font-size: var(--ws-text-bar);
    font-stretch: 75%;
    font-variation-settings:
      'wdth' 75,
      'opsz' 48;
    line-height: 1;
    letter-spacing: -0.025em;
    color: var(--immich-ui-dark);
    cursor: pointer;
    transition: color 120ms;
  }
  .ws-month {
    font-weight: 500;
  }
  .ws-month::first-letter {
    text-transform: uppercase;
  }
  .ws-year {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .ws-now-link:not(:disabled):hover {
    color: var(--ws-accent);
  }
  .ws-now-link:disabled {
    cursor: default;
  }
  .ws-now-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-count {
    padding-inline-start: 0.25rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }

  /* the ruler: one line of mono numerals; the year in view marked by the accent, its months in a quiet tray */
  .ws-ruler {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    padding-inline: 0.75rem;
    mask-image: linear-gradient(to right, transparent, black 0.75rem, black calc(100% - 0.75rem), transparent);
  }
  .ws-ruler::-webkit-scrollbar {
    display: none;
  }
  .ws-rule-cell {
    display: flex;
    flex: none;
    align-items: center;
  }
  .ws-rule {
    flex: none;
    padding: 0.3rem 0.35rem;
    border-radius: var(--ws-radius);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
    transition:
      background-color 120ms,
      color 120ms;
  }
  .ws-rule:not(:disabled):hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-rule:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-rule-decade {
    margin-inline: 0.15rem;
    color: color-mix(in oklab, var(--immich-ui-muted) 85%, transparent);
  }
  .ws-rule[aria-current='true'] {
    color: var(--immich-ui-dark);
    font-weight: 700;
    box-shadow: inset 0 -2px 0 var(--ws-accent);
  }
  .ws-rule-months {
    display: flex;
    gap: 1px;
    margin-inline: 0.15rem 0.5rem;
    padding: 2px;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .ws-rule-month {
    min-width: 1.35rem;
    padding: 0.2rem 0.25rem;
    font-size: var(--ws-text-micro);
    font-weight: 600;
  }
  .ws-rule-month:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* a decade's map: a sheet hanging from its label, one frame, the theme's corners, the readout's rule edge to edge */
  .ws-map {
    --cell: 1rem;
    position: absolute;
    z-index: 60;
    display: grid;
    gap: 10px;
    padding: 0 12px 12px;
    border: 1px solid color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
    border-radius: var(--ws-radius);
    background: var(--immich-ui-light);
    box-shadow:
      0 4px 12px -4px rgb(0 0 0 / 0.25),
      0 24px 48px -12px rgb(0 0 0 / 0.45);
    transition:
      opacity 140ms,
      translate 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @starting-style {
    .ws-map {
      opacity: 0;
      translate: 0 -4px;
    }
  }
  @media (pointer: coarse) {
    .ws-map {
      --cell: 1.375rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-map {
      transition: none;
    }
  }
  .ws-map-head {
    display: flex;
    gap: 2px;
    align-items: center;
    margin-inline: -12px;
    padding: 4px;
    border-bottom: 1px solid var(--ws-hairline);
  }
  .ws-map-step {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--ws-radius);
    color: var(--immich-ui-muted);
  }
  .ws-map-step:not(:disabled):hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-map-step:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .ws-map-step:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-map-peek {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--immich-ui-dark);
  }
  .ws-map-grid {
    display: grid;
    grid-template-columns: auto repeat(12, var(--cell));
    gap: 3px;
    align-items: center;
  }
  .ws-map-initial {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-micro);
    text-align: center;
    color: var(--immich-ui-muted);
  }
  .ws-map-year {
    margin-inline-end: 6px;
    padding: 0.1rem 0.3rem;
    border-radius: var(--ws-radius);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: start;
    color: var(--immich-ui-muted);
  }
  .ws-map-year:hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  .ws-map-year[aria-current='true'] {
    font-weight: 700;
    color: var(--immich-ui-dark);
  }
  /* a month: a square in the accent, four steps from faint to full; an empty month is only its outline */
  .ws-map-month {
    width: var(--cell);
    height: var(--cell);
    padding: 0;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--ws-accent) var(--heat, 0%), transparent);
  }
  .ws-map-month[data-level='0'] {
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--immich-ui-dark) 12%, transparent);
  }
  .ws-map-month[data-level='1'] {
    --heat: 30%;
  }
  .ws-map-month[data-level='2'] {
    --heat: 52%;
  }
  .ws-map-month[data-level='3'] {
    --heat: 76%;
  }
  .ws-map-month[data-level='4'] {
    --heat: 100%;
  }
  .ws-map-month:not(:disabled):hover {
    outline: 1px solid color-mix(in oklab, var(--immich-ui-dark) 70%, transparent);
    outline-offset: 1px;
  }
  .ws-map-month[aria-current='true'] {
    outline: 2px solid var(--immich-ui-dark);
    outline-offset: 1px;
  }
  .ws-map-month:disabled {
    cursor: default;
  }
  .ws-map-year:focus-visible,
  .ws-map-month:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
  }

  /* tightening steps (see refit) */
  .ws-time[data-fit]:not([data-fit='0']) .ws-count {
    display: none;
  }
  .ws-time:is([data-fit='3'], [data-fit='4'], [data-fit='5']) .ws-rule-cell[data-other] {
    display: none;
  }
  .ws-time:is([data-fit='4'], [data-fit='5']) .ws-rule-cell[data-far] {
    display: none;
  }
  .ws-time[data-fit='5'] .ws-rule-months {
    display: none;
  }
  /* a phone-wide bar keeps just the heading */
  @container (max-width: 460px) {
    .ws-ruler {
      display: none;
    }
  }
</style>
