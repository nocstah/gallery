<script lang="ts">
  import { thumbnailZoomManager } from '$lib/managers/thumbnail-zoom-manager.svelte';
  import AssetLayout from '$lib/components/timeline/AssetLayout.svelte';
  import type { AssetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { TimelineDay } from '$lib/managers/timeline-manager/timeline-day.svelte';
  import type { TimelineMonth } from '$lib/managers/timeline-manager/timeline-month.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { assetsSnapshot, filterIsInOrNearViewport } from '$lib/managers/timeline-manager/utils.svelte';
  import type { VirtualScrollManager } from '$lib/managers/VirtualScrollManager/VirtualScrollManager.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { uploadAssetsStore } from '$lib/stores/upload';
  import type { CommonPosition } from '$lib/utils/layout-utils';
  import { monthMarkLabel } from '$lib/utils/timeline-dates';
  import { fromTimelinePlainDate, getDateLocaleString } from '$lib/utils/timeline-util';
  import { Icon } from '@immich/ui';
  import { mdiCheckCircle, mdiCircleOutline } from '@mdi/js';
  import type { Snippet } from 'svelte';

  type Props = {
    thumbnail: Snippet<
      [
        {
          asset: TimelineAsset;
          position: CommonPosition;
          timelineDay: TimelineDay;
          groupIndex: number;
          /** Local Omarchy layer: the month mark this photo carries, on the month's first photo only */
          monthMark?: string;
        },
      ]
    >;
    customThumbnailLayout?: Snippet<[TimelineAsset]>;
    singleSelect: boolean;
    assetInteraction: AssetMultiSelectManager;
    timelineMonth: TimelineMonth;
    manager: VirtualScrollManager;
    onTimelineDaySelect: (timelineDay: TimelineDay, assets: TimelineAsset[]) => void;
  };
  let {
    thumbnail: thumbnailWithGroup,
    customThumbnailLayout,
    singleSelect,
    assetInteraction,
    timelineMonth,
    manager,
    onTimelineDaySelect,
  }: Props = $props();

  let { isUploading } = uploadAssetsStore;
  let hoveredTimelineDay = $state<string | null>(null);

  const transitionDuration = $derived(timelineMonth.timelineManager.suspendTransitions && !$isUploading ? 0 : 150);

  // Local Omarchy layer ("quiet month marks"): where this month starts, as the layout found it once (monthStart). Its
  // first photo carries the month as a mark ("SEP"; "DEC 2025" where the year changes from the month before), and a
  // hairline runs in the gap before it: along the gap above the month's first row, from where the month starts to the
  // grid's edge, and down the gap beside its first photo when the month starts mid-row. The timeline's first month
  // has neither: the bar names it. Day labels date every day themselves, so with them on the layout notes no start.
  const monthIndex = $derived(timelineMonth.timelineManager.months.indexOf(timelineMonth));
  const mark = $derived.by(() => {
    const start = timelineMonth.monthStart;
    if (!start || monthIndex <= 0) {
      return;
    }
    const previous = timelineMonth.timelineManager.months[monthIndex - 1].yearMonth;
    const { year, month } = timelineMonth.yearMonth;
    return { assetId: start.assetId, label: monthMarkLabel({ year, month }, previous.year !== year, $locale) };
  });
  const startLine = $derived.by(() => {
    const start = timelineMonth.monthStart;
    if (!start || monthIndex <= 0) {
      return;
    }
    // the hairline sits mid-gap on whole pixels; a row that opens the grid has nothing above it to part from
    const above = start.top - Math.ceil(start.rowGap / 2);
    const opensGrid = timelineMonth.top + start.top - timelineMonth.timelineManager.topSectionHeight < 1;
    if (start.start <= 0) {
      return opensGrid ? undefined : { x: 0, y: above, height: 1, top: true, side: false };
    }
    const y = opensGrid ? start.top : above;
    return {
      x: start.start - Math.ceil(start.gap / 2),
      y,
      height: start.top + start.height - y,
      top: !opensGrid,
      side: true,
    };
  });

  // Local Omarchy layer: "Mon 31" for narrow screens, where the long title truncates on one-photo days.
  const getTimelineDayShort = (timelineDay: TimelineDay): string => {
    const { month, year } = timelineDay.timelineMonth.yearMonth;
    const date = new Date(year, month - 1, timelineDay.day);
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${timelineDay.day}`;
  };

  const getTimelineDayFullDate = (timelineDay: TimelineDay): string => {
    const { month, year } = timelineDay.timelineMonth.yearMonth;
    const date = fromTimelinePlainDate({
      year,
      month,
      day: timelineDay.day,
    });
    return getDateLocaleString(date);
  };
</script>

{#if startLine}
  <div
    class={['ws-month-start', { 'transition-all': !timelineMonth.timelineManager.suspendTransitions }]}
    style:transition-delay={timelineMonth.timelineManager.suspendTransitions ? undefined : `${transitionDuration}ms`}
    style:inset-inline-start={startLine.x + 'px'}
    style:top={startLine.y + 'px'}
    style:height={startLine.height + 'px'}
    data-top={startLine.top ? '' : undefined}
    data-side={startLine.side ? '' : undefined}
    aria-hidden="true"
  ></div>
{/if}

{#each filterIsInOrNearViewport(timelineMonth.timelineDays) as timelineDay, groupIndex (timelineDay.day)}
  {@const isTimelineDaySelected = assetInteraction.selectedGroup.has(timelineDay.groupTitle)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <section
    class={[{ 'transition-all': !timelineMonth.timelineManager.suspendTransitions }]}
    style:transition-delay={timelineMonth.timelineManager.suspendTransitions ? undefined : `${transitionDuration}ms`}
    data-group
    style:position="absolute"
    style:inset-inline-start={timelineDay.start + 'px'}
    style:top={timelineDay.top + 'px'}
    onmouseenter={() => (hoveredTimelineDay = timelineDay.groupTitle)}
    onmouseleave={() => (hoveredTimelineDay = null)}
  >
    {#if thumbnailZoomManager.dayLabels}
      <!-- Day title -->
      <div
        class="ws-day flex h-6 place-items-center pt-7 pb-5 text-immich-fg max-md:pt-5 max-md:pb-3 dark:text-immich-dark-fg"
        style:width={timelineDay.width + 'px'}
      >
        {#if !singleSelect}
          <div
            class="w-0 overflow-hidden transition-all duration-200 ease-out hover:cursor-pointer"
            class:w-8={hoveredTimelineDay === timelineDay.groupTitle ||
              assetInteraction.selectedGroup.has(timelineDay.groupTitle)}
            onclick={() => onTimelineDaySelect(timelineDay, assetsSnapshot(timelineDay.getAssets()))}
            onkeydown={() => onTimelineDaySelect(timelineDay, assetsSnapshot(timelineDay.getAssets()))}
          >
            {#if isTimelineDaySelected}
              <Icon icon={mdiCheckCircle} size="24" class="text-primary" />
            {:else}
              <Icon icon={mdiCircleOutline} size="24" class="text-light-500" />
            {/if}
          </div>
        {/if}

        <span class="w-full truncate first-letter:capitalize" title={getTimelineDayFullDate(timelineDay)}>
          <span class="ws-day-long">{timelineDay.groupTitle}</span>
          <span class="ws-day-short">{getTimelineDayShort(timelineDay)}</span>
        </span>
      </div>
    {/if}

    <AssetLayout
      {manager}
      viewerAssets={timelineDay.activeViewerAssets}
      height={timelineDay.height}
      width={timelineDay.width}
      {customThumbnailLayout}
    >
      {#snippet thumbnail({ asset, position })}
        {@render thumbnailWithGroup({
          asset,
          position,
          timelineDay,
          groupIndex,
          monthMark: mark?.assetId === asset.id ? mark.label : undefined,
        })}
      {/snippet}
    </AssetLayout>
  </section>
{/each}

<style>
  section {
    contain: layout paint style;
  }

  /* Local Omarchy layer: the hairline where the month starts, in the gap between photos (no tile moves for it); the
     month box paints what overflows it, so it reaches up into the gap above the month's first row */
  .ws-month-start {
    position: absolute;
    inset-inline-end: 0;
    pointer-events: none;
  }
  .ws-month-start[data-top] {
    border-top: 1px solid var(--ws-month-line);
  }
  .ws-month-start[data-side] {
    border-inline-start: 1px solid var(--ws-month-line);
  }
</style>
