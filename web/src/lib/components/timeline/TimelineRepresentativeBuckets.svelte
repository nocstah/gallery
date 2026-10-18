<script lang="ts">
  import TimelineBucketCard from '$lib/components/timeline/TimelineBucketCard.svelte';
  import type { TimelineGrouping } from '$lib/managers/timeline-manager/types';
  import { revealDelta, rowNeighbour } from '$lib/utils/grid-rows';
  import { periodDensity, periodSlot, type PeriodGrid, type PeriodRow } from '$lib/utils/period-grid';
  import type { ActivatableTimelineBucket } from '$lib/utils/timeline-zoom-navigation';
  import type { Snippet } from 'svelte';
  import { on } from 'svelte/events';
  import { t } from 'svelte-i18n';

  const OVERSCAN_PX = 900;

  export type RepresentativeTimelineBucket = ActivatableTimelineBucket & {
    viewId: string;
    timeBucket: string;
    top: number;
    height: number;
    isLoaded: boolean;
    count: number;
    representativeAssetId: string | null;
    representativeThumbhash: string | null;
    representativeRatio: number | null;
    /** Local Omarchy layer: in the Years and Months grid, the tile's left edge and width (null for a banner) */
    left?: number | null;
    size?: number | null;
  };

  interface VisibleWindow {
    top: number;
    bottom: number;
  }

  interface Props {
    grouping: TimelineGrouping;
    buckets: RepresentativeTimelineBucket[];
    visibleWindow: VisibleWindow;
    locale?: string;
    disabled?: boolean;
    renderOffset?: number;
    onTimelineBucketActivate?: (bucket: ActivatableTimelineBucket) => void;
    onRequestCovers?: (timeBuckets: string[]) => void;
    /** Local Omarchy layer: a page's own action on a period's card, beside it (Photos: a year in Room) */
    bucketAction?: Snippet<[RepresentativeTimelineBucket]>;
    /** Local Omarchy layer: the Years and Months overviews as the archive's shape (utils/period-grid): a row per decade
     * or year, the periods at their places in it, the gaps and the rows' names */
    grid?: PeriodGrid;
    /** the height of what stands above the periods (the timeline's top section), which the grid sits under */
    topOffset?: number;
  }

  let {
    grouping,
    buckets,
    visibleWindow,
    locale = 'en-US',
    disabled = false,
    renderOffset = 0,
    onTimelineBucketActivate,
    onRequestCovers,
    bucketAction,
    grid,
    topOffset = 0,
  }: Props = $props();

  const intersectsVisibleWindow = (bucket: RepresentativeTimelineBucket, window: VisibleWindow) =>
    bucket.top + bucket.height >= window.top - OVERSCAN_PX && bucket.top <= window.bottom + OVERSCAN_PX;

  let visibleBuckets = $derived(grid ? [] : buckets.filter((bucket) => intersectsVisibleWindow(bucket, visibleWindow)));

  // Local Omarchy layer: the grid's rows in view, each drawn in reading order (its name, then its periods along it), so
  // Tab and a screen reader go the way the eye does
  const bySlot = $derived.by(() => {
    const kind = grid?.kind;
    return new Map(kind ? buckets.map((bucket) => [periodSlot(kind, bucket.date), bucket]) : []);
  });
  const visibleRows = $derived(
    grid
      ? grid.rows.filter(
          (row) =>
            row.top + topOffset + row.height >= visibleWindow.top - OVERSCAN_PX &&
            row.top + topOffset <= visibleWindow.bottom + OVERSCAN_PX,
        )
      : [],
  );

  let visibleBucketKeys = $derived.by(() => {
    if (!grid) {
      return visibleBuckets.map((b) => b.timeBucket);
    }
    const keys: string[] = [];
    for (const row of visibleRows) {
      for (const cell of row.kind === 'period' ? row.cells : []) {
        const bucket = cell.tile ? bySlot.get(cell.slot) : undefined;
        if (bucket) {
          keys.push(bucket.timeBucket);
        }
      }
    }
    return keys;
  });

  $effect(() => {
    if (grouping !== 'day' && visibleBucketKeys.length > 0) {
      onRequestCovers?.(visibleBucketKeys);
    }
  });

  const activate = (bucket: ActivatableTimelineBucket) => {
    if (disabled) {
      return;
    }

    onTimelineBucketActivate?.(bucket);
  };

  // the names: a decade in the reader's words ("1980s", "1980er", "années 1980"), a year as itself, a run without
  // photos as its span, a gap by its year or its month
  const monthName = (slot: number) =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, slot % 12, 1)));
  const rowName = (kind: PeriodGrid['kind'], unit: number) =>
    kind === 'year' ? $t('timeline_overview_decade', { values: { decade: String(unit * 10) } }) : String(unit);
  const runName = (kind: PeriodGrid['kind'], { first, last }: Extract<PeriodRow, { kind: 'empty' }>) => {
    const [from, to] = kind === 'year' ? [first * 10, last * 10 + 9] : [first, last];
    return from === to ? String(from) : `${from}–${to}`;
  };
  const gapName = (kind: PeriodGrid['kind'], slot: number) => (kind === 'year' ? String(slot) : monthName(slot));

  // the arrows move between the periods as they are drawn, as they do between photos: ← and → along the reading
  // order, ↑ and ↓ to the row above or below (the period nearest by its centre, so a column of the decade grid is one
  // year of every decade), Home and End to the first and the last; the one reached comes wholly into view
  const CARD = '.ws-period-tile [data-testid="timeline-bucket-card"]';
  const arrowKeys = (node: HTMLElement) => on(node, 'keydown', (event) => onGridKeydown(event, node));
  const onGridKeydown = (event: KeyboardEvent, node: HTMLElement) => {
    const from = document.activeElement;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !(from instanceof HTMLElement)) {
      return;
    }
    if (!from.matches(CARD)) {
      return;
    }
    const cards = [...node.querySelectorAll<HTMLElement>(CARD)];
    const index = cards.indexOf(from);
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowLeft': {
        next = index - 1;
        break;
      }
      case 'ArrowRight': {
        next = index + 1;
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        const boxes = cards.map((card) => card.getBoundingClientRect());
        next = rowNeighbour(boxes, from.getBoundingClientRect(), event.key === 'ArrowUp' ? 'up' : 'down');
        break;
      }
      case 'Home': {
        next = 0;
        break;
      }
      case 'End': {
        next = cards.length - 1;
        break;
      }
      default: {
        return;
      }
    }
    // the timeline's own arrows (a photo's focus) and the scrolling of the page stay out of it
    event.preventDefault();
    event.stopPropagation();
    const target = next === undefined ? undefined : cards[next];
    if (!target) {
      return;
    }
    target.focus({ preventScroll: true });
    const scroller = target.closest<HTMLElement>('#asset-grid');
    if (scroller) {
      const delta = revealDelta(target.getBoundingClientRect(), scroller.getBoundingClientRect());
      if (delta !== 0) {
        scroller.scrollBy({ top: delta });
      }
    }
  };

  const at = (box: { left: number; top: number; width?: number; height: number }) =>
    `position: absolute; left: ${box.left}px; ${box.width === undefined ? 'right: 0;' : `width: ${box.width}px;`} height: ${box.height}px; transform: translateY(${box.top + topOffset + renderOffset}px);`;
</script>

{#if grouping !== 'day'}
  <div
    data-testid="timeline-representative-buckets"
    data-grouping={grouping}
    class={{ 'ws-period-grid': !!grid }}
    data-names={grid ? (grid.labelWidth > 0 ? 'beside' : 'above') : undefined}
    {@attach arrowKeys}
  >
    {#if grid}
      {@const kind = grid.kind}
      {#each visibleRows as row (row.kind === 'period' ? `row-${row.unit}` : `run-${row.first}`)}
        {#if row.kind === 'empty'}
          <!-- a run of decades or years without photos: one slim line naming it -->
          <div class="ws-period-run" style={at({ left: 0, top: row.top, height: row.height })}>
            <span class="ws-period-run-name" style:width={grid.labelWidth > 0 ? `${grid.labelWidth}px` : undefined}
              >{runName(kind, row)}<span class="sr-only">, {$t('timeline_overview_no_photos')}</span></span
            >
          </div>
        {:else}
          <h2 class="ws-period-name" style={at(row.label)}>{rowName(kind, row.unit)}</h2>
          {#each row.cells as cell (cell.slot)}
            {@const bucket = cell.tile ? bySlot.get(cell.slot) : undefined}
            {#if bucket}
              <div style={at(cell)} data-testid={`timeline-bucket-shell-${bucket.timeBucket}`} class="ws-period-tile">
                <TimelineBucketCard
                  {bucket}
                  {locale}
                  loading={!bucket.isLoaded}
                  {disabled}
                  onActivate={activate}
                  density={periodDensity(bucket.count, grid.busiest)}
                  short={kind === 'month'}
                />
                {@render bucketAction?.(bucket)}
              </div>
            {:else}
              <!-- a period without photos inside the archive's span: a quiet gap at its place -->
              <div class="ws-period-gap" style={at(cell)} aria-hidden="true">
                <span>{gapName(kind, cell.slot)}</span>
              </div>
            {/if}
          {/each}
        {/if}
      {/each}
    {:else}
      {#each visibleBuckets as bucket (bucket.viewId)}
        <div
          style={`position: absolute; height: ${bucket.height}px; width: 100%; transform: translateY(${bucket.top + renderOffset}px);`}
          data-testid={`timeline-bucket-shell-${bucket.timeBucket}`}
        >
          <div class="relative mx-auto h-full max-w-5xl px-4" data-testid="timeline-bucket-frame">
            <TimelineBucketCard {bucket} {locale} loading={!bucket.isLoaded} {disabled} onActivate={activate} />
            {@render bucketAction?.(bucket)}
          </div>
        </div>
      {/each}
    {/if}
  </div>
{/if}
