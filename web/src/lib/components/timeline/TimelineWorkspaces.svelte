<script lang="ts">
  // Local Omarchy layer ("Tiled Workspace"): the timeline's place in time, set into the middle of the one bar
  // (components/omarchy/OmarchyBar.svelte, via lib/managers/bar-slot). The month in view as the bar's heading (its
  // month name opens the Months overview, its year the Years overview), and beside it a fisheye ruler of the whole
  // archive: the year in view shows its months, the rest of its decade shows as years, older and newer decades as
  // 1990s, 2000s... so fifty years fit on one line and every month is one or two clicks away. Clicking a year
  // switches to it the way SUPER+<n> switches Hyprland workspaces; clicking a decade opens it at its first year.
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineGrouping, ViewportTopMonth } from '$lib/managers/timeline-manager/types';
  import { locale } from '$lib/stores/preferences.store';
  import { Icon } from '@immich/ui';
  import { mdiTune } from '@mdi/js';
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

  // The fisheye: the decade in view opens into its years, the year in view into its months; every other decade is
  // one label, entered at its first year in timeline order
  type Rule =
    | { kind: 'decade'; key: string; decade: number; entry: number; count: number }
    | { kind: 'year'; key: string; year: number; count: number };
  const ruler = $derived.by(() => {
    if (!current) {
      return [];
    }
    const focus = Math.floor(current.year / 10) * 10;
    const out: Rule[] = [];
    for (const { year, count } of years) {
      const decade = Math.floor(year / 10) * 10;
      if (decade === focus) {
        out.push({ kind: 'year', key: `y${year}`, year, count });
        continue;
      }
      const last = out.at(-1);
      if (last?.kind === 'decade' && last.decade === decade) {
        last.count += count;
      } else {
        out.push({ kind: 'decade', key: `d${decade}`, decade, entry: year, count });
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
  // count, 2 shortens the decade's other years to '25, 3 folds them into one label like the other decades, and only
  // 4 puts the month tray away (the month name still opens the Months overview). Re-fitted when the bar or the ruler
  // changes.
  const TIGHTEST = 4;
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
  // at the tightest step the decade's other years fold into one label like the other decades, entered at the first
  // of them (presentation only: the ruler itself must not depend on the fit, or fitting would feed itself)
  const firstOther = $derived(
    ruler.find((rule) => rule.kind === 'year' && rule.year !== current?.year) as { year: number } | undefined,
  );
  const focusDecade = $derived(current ? Math.floor(current.year / 10) * 10 : 0);

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

  const goToMonth = (month: number) => {
    const target = current
      ? timelineManager.months.find((m) => m.yearMonth.year === current.year && m.yearMonth.month === month)
      : undefined;
    if (target) {
      timelineManager.scrollTo(monthTarget(target.top));
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
</script>

<svelte:window onkeydown={onKeydown} />

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
          data-other={rule.kind === 'year' && rule.year !== current.year && rule.year !== firstOther?.year
            ? ''
            : undefined}
          animate:flip={{ duration: reducedMotion || fitting ? 0 : 260, easing: cubicOut }}
        >
          {#if rule.kind === 'decade'}
            <button
              type="button"
              class="ws-rule ws-rule-decade"
              title={$t('items_count', { values: { count: rule.count } })}
              onclick={() => void switchTo(rule.entry)}
            >
              {rule.decade}s
            </button>
          {:else}
            <button
              type="button"
              class="ws-rule ws-rule-year"
              data-year={rule.year}
              aria-current={rule.year === current.year ? 'true' : undefined}
              title={$t('items_count', { values: { count: rule.count } })}
              aria-label={String(rule.year)}
              onclick={() => void switchTo(rule.year)}
            >
              {#if fit >= 3 && rule.year === firstOther?.year}{focusDecade}s{:else if fit >= 2 && rule.year !== current.year}{shortYear(
                  rule.year,
                )}{:else}{rule.year}{/if}
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

  /* tightening steps (see refit) */
  .ws-time[data-fit]:not([data-fit='0']) .ws-count {
    display: none;
  }
  .ws-time:is([data-fit='3'], [data-fit='4']) .ws-rule-cell[data-other] {
    display: none;
  }
  .ws-time[data-fit='4'] .ws-rule-months {
    display: none;
  }
  /* a phone-wide bar keeps just the heading */
  @container (max-width: 460px) {
    .ws-ruler {
      display: none;
    }
  }
</style>
