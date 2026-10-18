<script lang="ts">
  // Local Omarchy layer: the AI inbox's kinds. One row per kind of suggestion (the burst covers, the restored prints,
  // the Mac's names), however many nights fed it (utils/curator-inbox): its title, what accepting would do with how
  // many wait ("Archive 42 clips", kindAction) and the days of its runs in data type, and a strip of the photos it
  // touches, the kind waiting longest first. The rest of what a kind does is said once, inside it; opening a row
  // reviews the whole kind as one queue.
  import { curator } from '$lib/utils/curator';
  import { kindAction, kindQuery, kindsOf, runDays, type InboxKind } from '$lib/utils/curator-inbox';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    onRunScan: () => void;
    onCalibrate: () => void;
  }

  let { onRunScan, onCalibrate }: Props = $props();

  let kinds = $state<InboxKind[]>();

  onMount(async () => {
    kinds = kindsOf(await curator.inbox());
  });

  const thumbnail = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
</script>

{#if kinds && kinds.length === 0}
  <div class="ws-empty">
    <h2 class="ws-empty-title">{$t('ai_inbox_empty_title')}</h2>
    <p class="ws-empty-body">{$t('ai_inbox_empty_body')}</p>
    <div class="ws-empty-actions">
      <button type="button" class="ws-empty-action" onclick={onRunScan}>{$t('ai_inbox_run_scan')}</button>
      <button type="button" class="ws-empty-link" onclick={onCalibrate}>{$t('ai_inbox_tab_calibrate')}</button>
    </div>
  </div>
{:else if kinds}
  <ul class="ws-inbox-rows">
    {#each kinds as kind (kind.series)}
      <li>
        <a class="ws-inbox-row overview-row" href="?{kindQuery(kind.keys)}">
          <div class="overview-text">
            <span class="ws-inbox-row-title">{kind.title}</span>
            <span class="overview-facts">
              <!-- what accepting would do, in words, then the days of its runs in data type -->
              <span class="overview-todo"
                >{$t(kindAction(kind.series, kind.kind).todo, { values: { count: kind.pending } })}</span
              >
              <span class="ws-inbox-meta">{runDays(kind.runs, $locale ?? undefined)}</span>
            </span>
          </div>
          <div class="ws-strip overview-strip">
            {#each kind.preview as id (id)}
              <img class="ws-strip-tile" src={thumbnail(id)} alt="" loading="lazy" width="72" height="72" />
            {/each}
          </div>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* the photos follow their title, not the far edge of a wide screen */
  .overview-row {
    grid-template-columns: minmax(16rem, 28rem) minmax(0, 1fr);
    align-items: center;
  }
  .overview-text {
    display: grid;
    gap: 0.3rem;
  }
  .overview-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 1.25rem;
  }
  .overview-todo {
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .overview-strip :global(.ws-strip-tile) {
    width: 72px;
    height: 72px;
  }
  @media (max-width: 767px) {
    .overview-row {
      grid-template-columns: minmax(0, 1fr);
    }
    .overview-strip :global(.ws-strip-tile) {
      width: 56px;
      height: 56px;
    }
  }
</style>
