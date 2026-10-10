<script lang="ts">
  // Local Omarchy layer ("Tiled Workspace"): the month in view set large, with the archive's years as a
  // strip of workspace numbers beside it. The year under the viewport is the active workspace; clicking
  // another switches to it, the way SUPER+<n> switches Hyprland workspaces.
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

  // direction of travel for the label slide: older months slide in from the right, newer from the left
  let previousKey = 0;
  let direction = $state(1);
  $effect(() => {
    const key = current ? current.year * 12 + current.month : 0;
    direction = key < previousKey ? 1 : -1;
    previousKey = key;
  });

  let strip = $state<HTMLElement>();
  $effect(() => {
    const year = current?.year;
    const active = strip?.querySelector<HTMLElement>(`[data-year="${year}"]`);
    active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  const switchTo = (year: number) => {
    const month = timelineManager.months.find((m) => m.yearMonth.year === year);
    if (month) {
      timelineManager.scrollTo(month.top * timelineManager.maxScrollPercent);
    }
  };

  const slide = (node: Element) =>
    fly(node, { x: reducedMotion ? 0 : direction * 28, duration: reducedMotion ? 0 : 260, easing: cubicOut });
</script>

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

    <nav class="ws-strip" bind:this={strip} aria-label={$t('year')}>
      {#each years as { year, count } (year)}
        <button
          type="button"
          class="ws-data ws-pill"
          data-year={year}
          aria-current={year === current.year ? 'true' : undefined}
          title={$t('items_count', { values: { count } })}
          onclick={() => switchTo(year)}
        >
          {year}
        </button>
      {/each}
    </nav>
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
    min-width: 18ch;
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
    font-size: clamp(2rem, 1.2rem + 2.2vw, 3.25rem);
    line-height: 0.95;
    font-weight: 800;
    font-stretch: 75%;
    font-variation-settings: 'wdth' 75, 'opsz' 96;
    letter-spacing: -0.035em;
    color: var(--immich-ui-dark);
  }
  .ws-month::first-letter {
    text-transform: uppercase;
  }
  .ws-year {
    font-weight: 300;
    color: var(--immich-ui-muted);
  }
  .ws-count {
    align-self: flex-end;
    padding-bottom: 0.3em;
    font-size: 12px;
    color: var(--immich-ui-muted);
  }

  .ws-strip {
    display: flex;
    gap: calc(var(--ws-gap) * 0.4);
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 0.35rem;
    mask-image: linear-gradient(to right, transparent, black 2rem, black calc(100% - 2rem), transparent);
    padding-inline: 2rem;
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
    border-radius: calc(var(--ws-radius) + 5px);
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

  @media (max-width: 767px) {
    .ws-workspaces {
      flex-direction: column;
      align-items: stretch;
      gap: 0.4rem;
    }
    .ws-strip {
      padding-inline: 0;
      mask-image: none;
    }
  }
</style>
