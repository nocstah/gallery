<script lang="ts">
  // Local Omarchy layer: the bar's quiet way into the Years and Months overviews, "Years · Months" in data type (the
  // owner's choice, 2026-10-18: on the AORUS the heading's month and year words had been the only way in, a tooltip
  // saying where they led). Photos sets it before its year strip (TimelineWorkspaces) and, while an overview shows, at
  // the end of the overview's title row, where the overview showing inverts as the strip's year in view does and All
  // leads back to the photos, as the Years / Months / All control does on every other page. A phone keeps that control
  // floating over the photos (Timeline), so this waits for a wider screen.
  import type { TimelineGrouping } from '$lib/managers/timeline-manager/types';
  import { t } from 'svelte-i18n';

  interface Props {
    grouping: TimelineGrouping;
    /** unset while the overviews wait (a selection is active) */
    onGrouping?: (grouping: TimelineGrouping) => void;
    /** at the end of a title row, behind a hairline as tall as the text (the overviews' bar) */
    trailing?: boolean;
  }

  let { grouping, onGrouping, trailing = false }: Props = $props();

  // All only while an overview shows: on the photos it would name where you are, which the heading already says
  const modes = $derived<{ grouping: TimelineGrouping; label: string }[]>([
    { grouping: 'year', label: $t('timeline_grouping_years') },
    { grouping: 'month', label: $t('timeline_grouping_months') },
    ...(grouping === 'day' ? [] : [{ grouping: 'day' as const, label: $t('timeline_grouping_all') }]),
  ]);
</script>

<div
  class="ws-overviews"
  role="group"
  aria-label={$t('timeline_grouping_selector')}
  data-trailing={trailing ? '' : undefined}
  data-testid="timeline-overview-switch"
>
  {#each modes as mode, index (mode.grouping)}
    {#if index > 0}<span class="ws-overviews-dot" aria-hidden="true">·</span>{/if}
    <button
      type="button"
      aria-pressed={mode.grouping === grouping}
      disabled={!onGrouping}
      data-testid="timeline-overview-{mode.grouping}"
      onclick={() => mode.grouping !== grouping && onGrouping?.(mode.grouping)}>{mode.label}</button
    >
  {/each}
</div>

<style>
  .ws-overviews {
    display: flex;
    flex: none;
    gap: 0.125rem;
    align-items: center;
  }
  /* at the end of a title row (an overview's bar): behind a hairline as tall as the text, as a page's month in view is */
  .ws-overviews[data-trailing] {
    align-self: center;
    padding-inline-start: 0.75rem;
    margin-inline-start: 0.15rem;
    border-inline-start: 1px solid var(--ws-hairline);
  }
  /* the strip's own cell: mono numerals' size and height, so the words sit on the years' line; 24px tall targets */
  .ws-overviews button {
    height: 1.5rem;
    padding: 0 0.375rem;
    border-radius: var(--ws-radius);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    line-height: 1.5rem;
    white-space: nowrap;
    color: var(--immich-ui-muted);
    cursor: pointer;
    transition:
      background-color 120ms,
      color 120ms;
  }
  .ws-overviews button:not(:disabled, [aria-pressed='true']):hover {
    color: var(--immich-ui-dark);
    background: color-mix(in oklab, var(--immich-ui-dark) 8%, transparent);
  }
  /* the overview showing, inverted like the year in view */
  .ws-overviews button[aria-pressed='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    cursor: default;
  }
  .ws-overviews button:disabled {
    cursor: default;
  }
  /* inside the word's cell, as on the strip's years: a title row clips what stands outside it */
  .ws-overviews button:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: -2px;
  }
  .ws-overviews-dot {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    color: var(--immich-ui-muted);
    user-select: none;
  }
  /* a phone keeps the floating Years / Months / All (Timeline's, md:hidden from 768px) */
  @media (max-width: 767px) {
    .ws-overviews {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-overviews button {
      transition: none;
    }
  }
</style>
