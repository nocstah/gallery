<script lang="ts">
  // Local Omarchy layer: the AI inbox's batches. One row per batch of suggestions (a scan's worth of burst covers,
  // the Mac's names, an album folder), with a strip of the photos it touches; opening a row reviews the batch.
  import { curator, type InboxGroup } from '$lib/utils/curator';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    onRunScan: () => void;
    onCalibrate: () => void;
  }

  let { onRunScan, onCalibrate }: Props = $props();

  let groups = $state<InboxGroup[]>();

  onMount(async () => {
    groups = await curator.inbox();
  });

  const thumbnail = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
  // one photo can open several batches' strips, and a strip may repeat it
  const unique = (ids: string[] | null) => [...new Set(ids ?? [])];
</script>

{#if groups && groups.length === 0}
  <div class="ws-empty">
    <h2 class="ws-empty-title">{$t('ai_inbox_empty_title')}</h2>
    <p class="ws-empty-body">{$t('ai_inbox_empty_body')}</p>
    <div class="ws-empty-actions">
      <button type="button" class="ws-empty-action" onclick={onRunScan}>{$t('ai_inbox_run_scan')}</button>
      <button type="button" class="ws-empty-link" onclick={onCalibrate}>{$t('ai_inbox_tab_calibrate')}</button>
    </div>
  </div>
{:else if groups}
  <ul class="ws-inbox-rows">
    {#each groups as group (group.key)}
      <li>
        <a class="ws-inbox-row overview-row" href="?group={encodeURIComponent(group.key)}">
          <div class="overview-text">
            <span class="ws-inbox-row-title">{group.title}</span>
            <span class="ws-inbox-meta">{$t('ai_inbox_waiting', { values: { count: group.pending } })}</span>
            {#if group.description}
              <p class="ws-inbox-row-body">{group.description}</p>
            {/if}
          </div>
          <div class="ws-strip overview-strip">
            {#each unique(group.preview) as id (id)}
              <img class="ws-strip-tile" src={thumbnail(id)} alt="" loading="lazy" width="72" height="72" />
            {/each}
          </div>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .overview-row {
    grid-template-columns: minmax(16rem, 1fr) auto;
    align-items: center;
  }
  .overview-text {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
  }
  .overview-text p {
    flex-basis: 100%;
  }
  .overview-strip :global(.ws-strip-tile) {
    width: 72px;
    height: 72px;
  }
  @media (max-width: 767px) {
    .overview-row {
      grid-template-columns: 1fr;
    }
    .overview-strip :global(.ws-strip-tile) {
      width: 56px;
      height: 56px;
    }
  }
</style>
