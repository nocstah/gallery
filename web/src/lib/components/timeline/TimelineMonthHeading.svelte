<script lang="ts">
  // Local Omarchy layer: the month in view as the one bar's heading, in the bar heading face, the month at 500 against
  // the year at 750. Photos sets it before its year strip (TimelineWorkspaces); a page with a title row sets it beside
  // its title (layouts/UserPageLayout, from managers/timeline-heading), muted there, the page's name being the heading.
  // It keeps the width of its longest month name (all twelve laid invisibly in its cell), so nothing beside it moves as
  // the months change; a new month comes in from the side it lies on. The month name opens the Months overview, the
  // year the Years overview.
  import type { TimelineGrouping } from '$lib/managers/timeline-manager/types';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import type { TimelineYearMonth } from '$lib/utils/timeline-util';
  import { t } from 'svelte-i18n';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';

  interface Props {
    month: TimelineYearMonth;
    onGrouping?: (grouping: TimelineGrouping) => void;
    /** the short month name ("Oct") whatever the room (a narrow bar under Photos' strip switches by itself) */
    short?: boolean;
    /** muted, beside a page's own title */
    quiet?: boolean;
  }

  let { month: current, onGrouping, short = false, quiet = false }: Props = $props();

  const monthLabel = (year: number, month: number, style: 'long' | 'short' = 'long') =>
    new Intl.DateTimeFormat($locale, { month: style }).format(new Date(year, month - 1, 1));

  // the words are buttons named by what they do ("October 2026, show all months"; a tooltip alone had said so), and the
  // heading is named by its date alone, so it does not read out its buttons' actions
  const date = $derived(
    new Intl.DateTimeFormat($locale, { month: 'long', year: 'numeric' }).format(
      new Date(current.year, current.month - 1, 1),
    ),
  );
  const monthsAction = $derived($t('timeline_heading_show_months', { values: { date } }));
  const yearsAction = $derived($t('timeline_heading_show_years', { values: { year: current.year } }));

  const ghosts = $derived(
    Array.from({ length: 12 }, (_, index) => ({
      long: monthLabel(2000, index + 1),
      short: monthLabel(2000, index + 1, 'short'),
    })),
  );

  // Direction of travel: older months arrive from the right, newer from the left, like moving to a
  // higher or lower workspace. Read at transition time so it never lags a switch behind.
  let lastKey = 0;
  const travel = () => {
    const key = current.year * 12 + current.month;
    const direction = key < lastKey ? 1 : -1;
    lastKey = key;
    return direction;
  };
  const slide = (node: Element) => {
    const reduced = mediaQueryManager.reducedMotion;
    return fly(node, { x: reduced ? 0 : travel() * 16, duration: reduced ? 0 : 220, easing: cubicOut });
  };
</script>

<!-- Photos' heading is the month in view, so it is that page's h1; beside a page's own title (quiet) it is a note. It is
     no live region: it follows the scroll, and read out it named every month the photos passed -->
<svelte:element
  this={quiet ? 'div' : 'h1'}
  class="ws-now"
  data-short={short ? '' : undefined}
  data-quiet={quiet ? '' : undefined}
  data-testid="timeline-month-heading"
  aria-label={quiet ? undefined : date}
>
  {#each ghosts as ghost (ghost.long)}
    <span class="ws-now-label ws-ghost" aria-hidden="true">
      <span class="ws-now-link ws-month"
        ><span class="ws-long">{ghost.long}</span><span class="ws-short">{ghost.short}</span></span
      >
      <span class="ws-now-link ws-year">{current.year}</span>
    </span>
  {/each}
  {#key `${current.year}-${current.month}`}
    <div class="ws-now-label" in:slide>
      <button
        type="button"
        class="ws-month ws-now-link"
        aria-label={monthsAction}
        title={monthsAction}
        disabled={!onGrouping}
        onclick={() => onGrouping?.('month')}
        ><span class="ws-long">{monthLabel(current.year, current.month)}</span><span class="ws-short"
          >{monthLabel(current.year, current.month, 'short')}</span
        ></button
      >
      <button
        type="button"
        class="ws-year ws-now-link"
        aria-label={yearsAction}
        title={yearsAction}
        disabled={!onGrouping}
        onclick={() => onGrouping?.('year')}>{current.year}</button
      >
    </div>
  {/key}
</svelte:element>

<style>
  /* the cell clips a new month sliding in, half a rem out from the words, so their focus rings show whole (the clip had
     cut them at the words' edge); the margin gives the room back, so nothing beside it moves */
  .ws-now {
    display: grid;
    flex: none;
    overflow: hidden;
    padding: 0.5rem;
    margin: -0.5rem;
  }
  .ws-now > * {
    grid-area: 1 / 1;
  }
  .ws-ghost {
    visibility: hidden;
    pointer-events: none;
  }
  .ws-now-label {
    display: flex;
    gap: 0.28em;
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
      'opsz' 32;
    line-height: 1;
    letter-spacing: -0.015em;
    color: var(--immich-ui-dark);
    transition: color 120ms;
  }
  .ws-now[data-quiet] .ws-now-link {
    color: var(--immich-ui-muted);
  }
  /* 24px tall targets around words set 20px high: the padding is the press's, the margin keeps the line where it was */
  button.ws-now-link {
    padding: 0.125rem;
    margin: -0.125rem;
    border-radius: var(--ws-radius);
    cursor: pointer;
  }
  .ws-month {
    font-weight: 500;
  }
  .ws-month::first-letter {
    text-transform: uppercase;
  }
  .ws-year {
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }
  .ws-short {
    display: none;
  }
  .ws-now[data-short] .ws-long {
    display: none;
  }
  .ws-now[data-short] .ws-short {
    display: inline;
  }
  .ws-now button.ws-now-link:not(:disabled):hover {
    color: var(--ws-accent);
  }
  button.ws-now-link:disabled {
    cursor: default;
  }
  .ws-now-link:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }

  /* under Photos' strip (TimelineWorkspaces' .ws-time is the container) a narrower bar keeps the same line with the
     short month name */
  @container (max-width: 380px) {
    .ws-long {
      display: none;
    }
    .ws-short {
      display: inline;
    }
  }
</style>
