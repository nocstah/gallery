<script lang="ts">
  // Local Omarchy layer: where the archive begins (DESIGN.md, Ink). Under the oldest photo of a timeline a page browses
  // unfiltered (Photos', an album's, a person's, a Space's), room of its own, the first stroke (一, drawn, not a
  // character) and one quiet line: "It all begins here" and that photo's day. It shows once the timeline's last month
  // is loaded, only where the timeline runs newest first by the day the photos were taken, and the leadout takes its
  // height, so the scroll ends under it.
  import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { AssetOrder, AssetOrderBy } from '@immich/sdk';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    manager: TimelineManager;
  };

  const { manager }: Props = $props();

  // the leadout's own height when nothing stands in it (TimelineManager.bottomSectionHeight)
  const LEADOUT_PX = 60;

  const oldest = $derived.by(() => {
    const last = manager.months.at(-1);
    if (
      !last?.isLoaded ||
      manager.getAssetOrder() !== AssetOrder.Desc ||
      manager.getOrderBy() !== AssetOrderBy.TakenAt
    ) {
      return;
    }
    // newest first, so the last day of the last month holds the oldest photo, last in its day
    return last.lastTimelineDay?.getAssets().at(-1)?.localDateTime;
  });

  const pad = (value: number) => String(value).padStart(2, '0');
  const iso = $derived(oldest ? `${oldest.year}-${pad(oldest.month)}-${pad(oldest.day)}` : '');
  // the photo's own day, as its clock had it: a plain date, written in the reader's language
  const label = $derived(
    oldest
      ? new Intl.DateTimeFormat($locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
          Date.UTC(oldest.year, oldest.month - 1, oldest.day),
        )
      : '',
  );

  let height = $state(0);
  $effect(() => {
    manager.bottomSectionHeight = oldest ? Math.max(LEADOUT_PX, height) : LEADOUT_PX;
  });
  onDestroy(() => {
    manager.bottomSectionHeight = LEADOUT_PX;
  });
</script>

{#if oldest}
  <div class="ws-beginning" bind:clientHeight={height} data-testid="timeline-beginning">
    <span class="ws-beginning-stroke" aria-hidden="true"></span>
    <p class="ws-beginning-line">
      <span>{$t('timeline_beginning')}</span>
      <time class="ws-beginning-date" datetime={iso}>{label}</time>
    </p>
  </div>
{/if}

<style>
  /* room above it, a breath after the last row, and room under it so the scroll ends on it (a phone's floating Years ·
     Months · All stands clear of it) */
  .ws-beginning {
    padding: 3rem 0 4rem;
  }
  @media (max-width: 767px) {
    .ws-beginning {
      padding-bottom: 6.5rem;
    }
  }
  /* the first stroke, in the ink at 60%: a mark, so no reader hears it */
  .ws-beginning-stroke {
    display: block;
    width: 3.5rem;
    aspect-ratio: 6;
    background-color: color-mix(in oklab, var(--immich-ui-dark) 60%, transparent);
    -webkit-mask: var(--ws-ink-ichi) center / contain no-repeat;
    mask: var(--ws-ink-ichi) center / contain no-repeat;
  }
  .ws-beginning-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.6rem;
    margin-top: 0.85rem;
    font-size: var(--ws-text-meta);
    line-height: 1.45;
    color: var(--immich-ui-muted);
  }
  .ws-beginning-date {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-dark);
  }
</style>
