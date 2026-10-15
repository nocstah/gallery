<script lang="ts">
  import { isDefined } from '$lib';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { AssetAction } from '$lib/constants';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import type { TimelineDay } from '$lib/managers/timeline-manager/timeline-day.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import GeolocationPointPickerModal from '$lib/modals/GeolocationPointPickerModal.svelte';
  import GeolocationUpdateConfirmModal from '$lib/modals/GeolocationUpdateConfirmModal.svelte';
  import { keyboardManager } from '$lib/stores/keyboard-manager.svelte';
  import type { LatLng } from '$lib/types';
  import { setQueryValue } from '$lib/utils/navigation';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { beforeChange, placesDone } from '$lib/utils/undoable';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetVisibility, getAssetInfo, updateAssets } from '@immich/sdk';
  import { Button, Icon, modalManager } from '@immich/ui';
  import { mdiMapMarkerMultipleOutline, mdiMapMarkerOutline, mdiSelectRemove } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import LoadingSpinner from '$lib/components/shared-components/LoadingSpinner.svelte';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  let isLoading = $state(false);
  let point = $state<LatLng>();
  let locationUpdated = $state(false);

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const options = {
    visibility: AssetVisibility.Timeline,
    withStacked: true,
    withPartners: true,
    withCoordinates: true,
  };

  const isOwnAsset = (asset: TimelineAsset) => asset.ownerId === authManager.user.id;
  // Local Omarchy layer: the page's note waits until there are photos to point at
  const isEmpty = $derived(!!timelineManager?.isInitialized && timelineManager.assetCount === 0);
  const coordinates = $derived(point ? `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}` : '');

  const handleUpdate = async () => {
    if (!point) {
      return;
    }

    const confirmed = await modalManager.show(GeolocationUpdateConfirmModal, {
      point,
      assetCount: assetMultiSelectManager.assets.length,
    });

    if (!confirmed) {
      return;
    }

    const ids = assetMultiSelectManager.assets.filter((asset) => isOwnAsset(asset)).map((asset) => asset.id);
    // Local Omarchy layer: each photo's place as it was, so the change can be undone (utils/undoable)
    const before = await beforeChange(ids);
    await updateAssets({
      assetBulkUpdateDto: {
        ids,
        latitude: point.lat,
        longitude: point.lng,
      },
    });
    placesDone(ids, before);

    const updatedAssets = await Promise.all(
      assetMultiSelectManager.assets.map(async (asset) => {
        const updatedAsset = await getAssetInfo({ ...authManager.params, id: asset.id });
        return toTimelineAsset(updatedAsset);
      }),
    );

    timelineManager.upsertAssets(updatedAssets);

    assetMultiSelectManager.clear();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      event.preventDefault();
    }
    if (event.key === 'Escape' && assetMultiSelectManager.selectionActive) {
      assetMultiSelectManager.clear();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      event.preventDefault();
    }
  };

  const handlePickPoint = async () => {
    const selected = await modalManager.show(GeolocationPointPickerModal, { point });
    if (!selected) {
      return;
    }

    point = selected;
  };
  const handleEscape = () => {
    if (!assetMultiSelectManager.selectionActive) {
      return;
    }

    assetMultiSelectManager.clear();
    return;
  };

  type AssetPoint = { latitude: number; longitude: number };

  const hasGps = (asset: TimelineAsset | AssetPoint): asset is AssetPoint =>
    isDefined(asset.latitude) && isDefined(asset.longitude);

  const handleThumbnailClick = (
    asset: TimelineAsset,
    timelineManager: TimelineManager,
    timelineDay: TimelineDay,
    onClick: (
      timelineManager: TimelineManager,
      assets: TimelineAsset[],
      groupTitle: string,
      asset: TimelineAsset,
    ) => void,
  ) => {
    if (keyboardManager.shift) {
      onClick(timelineManager, timelineDay.getAssets(), timelineDay.groupTitle, asset);
    } else if (hasGps(asset)) {
      locationUpdated = true;
      setTimeout(() => {
        locationUpdated = false;
      }, 1500);
      point = { lat: asset.latitude, lng: asset.longitude };
      void setQueryValue('at', asset.id);
    } else if (isOwnAsset(asset)) {
      onClick(timelineManager, timelineDay.getAssets(), timelineDay.groupTitle, asset);
    }
  };
</script>

<svelte:document onkeydown={onKeyDown} onkeyup={onKeyUp} />

<UserPageLayout title={data.meta.title} scrollbar={true}>
  <!-- Local Omarchy layer: the bar holds what the page does, in the bar's rhythm: the location to give, a field in data
       type that opens the map (Choose on map until one is picked; it inverts for a moment when a click on a photo
       picks one), Unselect all while photos are selected, and Apply, ink, once there are photos and a place. How it
       works moved under the bar, so nothing crowds the title -->
  {#snippet buttons()}
    <button
      type="button"
      class="ws-geo-point"
      class:ws-geo-point-set={locationUpdated}
      onclick={handlePickPoint}
      title={$t('location_picker_choose_on_map')}
      aria-label={point ? `${$t('selected_gps_coordinates')}: ${coordinates}` : $t('location_picker_choose_on_map')}
    >
      <Icon icon={mdiMapMarkerOutline} size="16" />
      {#if point}
        <span class="ws-geo-coordinates">{coordinates}</span>
      {:else}
        <span class="ws-action-label">{$t('location_picker_choose_on_map')}</span>
      {/if}
    </button>
    {#if assetMultiSelectManager.selectionActive}
      <Button
        leadingIcon={mdiSelectRemove}
        size="small"
        color="secondary"
        variant="ghost"
        onclick={() => assetMultiSelectManager.clear()}
        title={$t('unselect_all')}
      >
        <span class="ws-action-label">{$t('unselect_all')}</span>
      </Button>
    {/if}
    <Button
      leadingIcon={mdiMapMarkerMultipleOutline}
      size="small"
      color="primary"
      disabled={assetMultiSelectManager.assets.length === 0 || !point}
      onclick={() => handleUpdate()}
      title={$t('apply_count', { values: { count: assetMultiSelectManager.assets.length } })}
    >
      <span class="ws-action-label">
        {$t('apply_count', { values: { count: assetMultiSelectManager.assets.length } })}
      </span>
    </Button>
  {/snippet}

  {#if isLoading}
    <div class="flex size-full items-center justify-center">
      <LoadingSpinner size="giant" />
    </div>
  {/if}

  <Timeline
    isSelectionMode={true}
    enableRouting={true}
    bind:timelineManager
    {options}
    assetInteraction={assetMultiSelectManager}
    removeAction={AssetAction.ARCHIVE}
    onEscape={handleEscape}
    withStacked
    onThumbnailClick={handleThumbnailClick}
  >
    {#if !isEmpty}
      <p class="ws-geo-note">{$t('geolocation_instruction_location')}</p>
    {/if}
    <!-- Local Omarchy layer: a photo with a place shows it on hover, as on Photos; one without is marked on the photo,
         a strong-glass chip with white text (upstream's green and red chips on every tile) -->
    {#snippet customThumbnailLayout(asset: TimelineAsset)}
      {#if !isOwnAsset(asset)}
        <div class="pointer-events-none absolute inset-0 rounded-sm bg-black/40"></div>
      {/if}
      {#if !hasGps(asset)}
        <span class="ws-geo-chip">{$t('gps_missing')}</span>
      {/if}
    {/snippet}
    {#snippet empty()}
      <div class="ws-page-column">
        <div class="ws-empty">
          <h2 class="ws-empty-title">{$t('timeline_empty_title')}</h2>
          <p class="ws-empty-body">{$t('timeline_empty_subtitle')}</p>
          <div class="ws-empty-actions">
            <button type="button" class="ws-empty-action" onclick={() => openFileUploadDialog()}>{$t('upload')}</button>
          </div>
        </div>
      </div>
    {/snippet}
  </Timeline>
</UserPageLayout>

<style>
  /* the location to give: a field on the ground (a hairline inside the theme's corner) holding the coordinates in data
     type; picking one from a photo inverts it for a moment */
  .ws-geo-point {
    display: inline-flex;
    align-items: center;
    border-radius: var(--ws-radius);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    white-space: nowrap;
    transition:
      background-color 200ms,
      color 200ms;
  }
  .ws-geo-point:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
  }
  .ws-geo-point:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ws-geo-point-set,
  .ws-geo-point-set:hover {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
  }
  .ws-geo-coordinates {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
  }
  /* how the page works, one muted line on the gutter above the photos (it scrolls away with them) */
  .ws-geo-note {
    max-width: 80ch;
    padding: calc(var(--ws-gap) * 0.6) 0 calc(var(--ws-gap) * 1.2);
    font-size: var(--ws-text-ui);
    line-height: 1.5;
    color: var(--immich-ui-muted);
  }
  /* "No GPS" on the photo: strong glass, white caption type; tight enough to fit a phone's narrow tiles */
  .ws-geo-chip {
    position: absolute;
    inset-inline-end: 0.3rem;
    bottom: 0.3rem;
    z-index: 3;
    max-width: calc(100% - 0.6rem);
    overflow: hidden;
    padding: 0.15rem 0.4rem;
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    color: #fff;
    font-size: var(--ws-text-micro);
    font-weight: 600;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .ws-geo-point {
      transition: none;
    }
  }
</style>
