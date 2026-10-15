<script lang="ts">
  // Local Omarchy layer: the hand-labelled test sets. A Curator judge may only act on its own once it agrees with
  // these: 50 bursts where you pick the best frame (then the runner-up), and 200 photos marked junk or keep.
  // Sets resume where you stopped; keys: 1-9 pick a frame, Enter saves, J/K mark junk/keep, S skips.
  import { curator, type LabelBatch, type LabelItem } from '$lib/utils/curator';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize, getAssetInfo, type AssetResponseDto } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { t, type Translations } from 'svelte-i18n';

  const SETS = ['burst-pick', 'junk'] as const;
  type SetName = (typeof SETS)[number];
  const SET_LABEL: Record<SetName, { title: Translations; body: Translations }> = {
    'burst-pick': { title: 'ai_inbox_calibrate_bursts', body: 'ai_inbox_calibrate_bursts_body' },
    junk: { title: 'ai_inbox_calibrate_junk', body: 'ai_inbox_calibrate_junk_body' },
  };

  let stats = $state<Record<string, { labelled: number; target: number }>>({});
  let active = $state<SetName>();
  let batch = $state<LabelBatch>();
  let item = $state<LabelItem>();
  let ranks = $state<string[]>([]);
  let info = $state<AssetResponseDto>();
  let saving = $state(false);

  const loadStats = async () => {
    for (const name of SETS) {
      stats[name] = await curator.labelStats(name);
    }
  };

  const advance = async () => {
    if (!active) {
      return;
    }
    if (!batch || batch.items.length === 0) {
      batch = await curator.nextLabels(active, 10);
      stats[active] = { labelled: batch.labelled, target: batch.target };
    }
    item = batch.items.shift();
    ranks = [];
    info = undefined;
    if (item && active === 'junk') {
      const id = item.asset_ids[0];
      info = await getAssetInfo({ id }).catch(() => undefined);
    }
  };

  const start = async (name: SetName) => {
    active = name;
    batch = undefined;
    await advance();
  };

  const save = async (value: Record<string, unknown>) => {
    if (!active || !item || saving) {
      return;
    }
    saving = true;
    try {
      stats[active] = await curator.putLabel(active, item.key, value);
      await advance();
    } finally {
      saving = false;
    }
  };

  const pick = (id: string) => {
    ranks = ranks.includes(id) ? ranks.filter((other) => other !== id) : [...ranks, id].slice(0, 2);
  };

  const saveBurst = () => {
    if (ranks.length > 0) {
      void save({ best: ranks[0], second: ranks[1] ?? null });
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (!active || !item || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) {
      return;
    }
    const key = event.key.toLowerCase();
    const frame = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    if (active === 'burst-pick' && frame >= 0 && frame < item.asset_ids.length) {
      pick(item.asset_ids[frame]);
    } else if (active === 'burst-pick' && key === 'enter') {
      saveBurst();
    } else if (active === 'junk' && key === 'j') {
      void save({ junk: true });
    } else if (active === 'junk' && key === 'k') {
      void save({ junk: false });
    } else if (key === 's') {
      void advance();
    } else if (key === 'escape') {
      active = undefined;
    } else {
      return;
    }
    event.preventDefault();
  };

  const media = (id: string, size: AssetMediaSize) => getAssetMediaUrl({ id, size });
  const progress = (name: string) => stats[name] ?? { labelled: 0, target: 0 };

  onMount(() => {
    void loadStats();
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if !active}
  <ul class="ws-inbox-rows">
    {#each SETS as name (name)}
      {@const done = progress(name)}
      <li>
        <div class="ws-inbox-row task-row">
          <div class="task-text">
            <span class="ws-inbox-row-title">{$t(SET_LABEL[name].title)}</span>
            <span class="ws-inbox-meta">{done.labelled} / {done.target}</span>
            <p class="ws-inbox-row-body">{$t(SET_LABEL[name].body)}</p>
            <div class="ws-meter task-meter">
              <span style:width="{(done.labelled / Math.max(1, done.target)) * 100}%"></span>
            </div>
          </div>
          <button type="button" class="ws-btn" onclick={() => start(name)}>
            {done.labelled > 0 ? $t('continue') : $t('start')}
          </button>
        </div>
      </li>
    {/each}
  </ul>
{:else}
  {@const done = progress(active)}
  <div class="task-head">
    <button type="button" class="ws-inbox-link" onclick={() => (active = undefined)}
      >{$t('ai_inbox_tab_calibrate')}</button
    >
    <span class="ws-inbox-meta">{$t(SET_LABEL[active].title)} · {done.labelled} / {done.target}</span>
  </div>

  {#if !item}
    <div class="ws-empty">
      <h2 class="ws-empty-title">{$t('ai_inbox_set_done')}</h2>
    </div>
  {:else if active === 'burst-pick'}
    <p class="ws-inbox-row-body task-hint">{$t('ai_inbox_burst_hint')}</p>
    <div class="burst">
      {#each item.asset_ids as id, index (id)}
        {@const rank = ranks.indexOf(id)}
        <button type="button" class="ws-pick" aria-pressed={rank >= 0} onclick={() => pick(id)}>
          <img src={media(id, AssetMediaSize.Preview)} alt="" draggable="false" />
          <span class="ws-inbox-meta burst-key">{index + 1}</span>
          {#if rank >= 0}
            <span class="ws-pick-rank">{rank === 0 ? $t('ai_inbox_best') : $t('ai_inbox_runner_up')}</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="task-actions">
      <button type="button" class="ws-btn" disabled={ranks.length === 0 || saving} onclick={saveBurst}>
        {$t('ai_inbox_save_next')}
      </button>
      <button type="button" class="ws-btn-quiet" onclick={() => advance()}>{$t('skip')}</button>
    </div>
  {:else}
    <div class="junk">
      <img class="junk-photo" src={media(item.asset_ids[0], AssetMediaSize.Preview)} alt="" draggable="false" />
      {#if info}
        <span class="ws-inbox-meta">
          {info.originalFileName} · {info.exifInfo?.make ?? '—'} · {info.exifInfo?.exifImageWidth ?? info.width}×{info
            .exifInfo?.exifImageHeight ?? info.height}
        </span>
      {/if}
    </div>
    <div class="task-actions">
      <button type="button" class="ws-btn" disabled={saving} onclick={() => save({ junk: false })}>
        {$t('keep')} <kbd>K</kbd>
      </button>
      <button type="button" class="ws-btn" disabled={saving} onclick={() => save({ junk: true })}>
        {$t('ai_inbox_junk')} <kbd>J</kbd>
      </button>
      <button type="button" class="ws-btn-quiet" onclick={() => advance()}>{$t('skip')}</button>
    </div>
  {/if}
{/if}

<style>
  .task-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
  .task-text {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
  }
  .task-text p,
  .task-meter {
    flex-basis: 100%;
  }
  .task-meter {
    max-width: 24rem;
    margin-top: 0.35rem;
  }
  .task-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.75rem;
    padding: 1.25rem 0 0.5rem;
  }
  .task-hint {
    margin-bottom: 1rem;
  }
  .burst {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ws-gap);
  }
  .burst .ws-pick img {
    height: clamp(9rem, 30vh, 20rem);
    width: auto;
    max-width: 100%;
  }
  .burst .ws-pick[aria-pressed='true'] img {
    outline: calc(var(--ws-border) + 1px) solid var(--immich-ui-dark);
    outline-offset: calc((var(--ws-border) + 1px) * -1);
  }
  .burst-key {
    position: absolute;
    right: 0.5rem;
    bottom: 0.4rem;
    color: #fff;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.6);
  }
  .junk {
    display: grid;
    justify-items: start;
    gap: 0.5rem;
    padding-top: 0.5rem;
  }
  .junk-photo {
    max-height: 62vh;
    max-width: 100%;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
  }
  .task-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }
  kbd {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    opacity: 0.7;
  }
</style>
