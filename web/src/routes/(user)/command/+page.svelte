<script lang="ts">
  // Local Omarchy layer: the command center. Everything about the library on one screen: what waits in the AI inbox
  // (by kind, as the inbox lists it: utils/curator-inbox), what Curator is doing and will do tonight, the library's
  // health, the machine (GPU, local models, disk, backups), today's memory, and the actions used most. Read from
  // Curator (~/code/curator: /api/overview, /api/inbox, /api/jobs, /api/library-health) and Gallery (today's
  // memories); refreshed while open. Counts are ink; what went wrong (failed runs, a backup in trouble) takes the
  // danger tone, never the accent, which stays for focus and response.
  import { goto } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { globalSearchManager } from '$lib/managers/global-search-manager.svelte';
  import { Route } from '$lib/route';
  import { getAssetMediaUrl } from '$lib/utils';
  import {
    curator,
    type CuratorOverview,
    type HealthItem,
    type InboxGroup,
    type JobRow,
    type LibraryHealth,
  } from '$lib/utils/curator';
  import { kindQuery, kindsOf } from '$lib/utils/curator-inbox';
  import { AssetMediaSize, searchMemories, type MemoryResponseDto } from '@immich/sdk';
  import { Icon, modalManager, toastManager } from '@immich/ui';
  import {
    mdiAlertCircleOutline,
    mdiChatOutline,
    mdiInboxOutline,
    mdiMagnify,
    mdiPaletteOutline,
    mdiPlayCircleOutline,
    mdiStarFourPointsOutline,
  } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let overview = $state<CuratorOverview>();
  let groups = $state<InboxGroup[]>([]);
  let jobs = $state<JobRow[]>([]);
  let health = $state<LibraryHealth>();
  let memory = $state<MemoryResponseDto>();
  let offline = $state(false);
  let timers: ReturnType<typeof setInterval>[] = [];

  const refreshFast = async () => {
    try {
      [overview, jobs] = await Promise.all([curator.overview(), curator.jobs(40)]);
      offline = false;
    } catch {
      offline = true;
    }
  };
  const refreshSlow = async () => {
    try {
      [groups, health] = await Promise.all([curator.inbox(), curator.libraryHealth()]);
    } catch {
      offline = true;
    }
  };

  onMount(() => {
    void refreshFast();
    void refreshSlow();
    void searchMemories({ $for: DateTime.now().toISODate() ?? undefined })
      .then((found) => (memory = found.find((m) => m.assets.length > 0)))
      .catch(() => undefined);
    timers = [setInterval(() => void refreshFast(), 5000), setInterval(() => void refreshSlow(), 60_000)];
  });
  onDestroy(() => {
    for (const timer of timers) {
      clearInterval(timer);
    }
  });

  const thumb = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
  // the inbox's biggest kinds, a kind's nightly batches counted as one, as the inbox lists them
  const topKinds = $derived(
    kindsOf(groups.filter((g) => g.pending > 0))
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 6),
  );
  const active = $derived(jobs.filter((j) => j.status === 'running' || j.status === 'queued'));
  const attention = $derived((health?.items ?? []).filter((item) => item.attention));
  const calm = $derived((health?.items ?? []).filter((item) => !item.attention));
  // disk and backups are in the machine panel, Curator's own failed runs in its panel as an alert; the inbox count is
  // the first number above
  const shown = (item: { key: string }) => !['disk', 'backup', 'inbox', 'curator_jobs'].includes(item.key);
  const gpuShare = $derived(overview?.gpu ? overview.gpu.used_mib / overview.gpu.total_mib : 0);
  const nextNight = $derived(overview ? DateTime.fromISO(overview.schedule.next_night) : undefined);
  const item = (key: string): HealthItem | undefined => health?.items.find((i) => i.key === key);
  // Curator's runs that failed this week or are stuck (its health report says which, and links to them)
  const jobsAlert = $derived(item('curator_jobs')?.attention ? item('curator_jobs') : undefined);
  const number = (value: number) => value.toLocaleString();
  // a backup's last good run, short ("13 Oct, 07:37"); three days without one is worth a look (curator-health says so)
  const when = (iso: string | null) =>
    iso
      ? DateTime.fromISO(iso).toLocaleString({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
  const stale = (iso: string | null) => !iso || DateTime.fromISO(iso) < DateTime.now().minus({ days: 3 });
  const memoryLabel = (found: MemoryResponseDto) => {
    // a featured memory's title, a trip's place, an "on this day" memory's year
    const data = (found.data ?? {}) as { year?: number; title?: string; context?: { placeLabel?: string } };
    if (typeof data.title === 'string') {
      return data.title;
    }
    if (typeof data.context?.placeLabel === 'string') {
      return data.context.placeLabel;
    }
    return data.year
      ? $t('years_ago', { values: { years: DateTime.now().year - data.year } })
      : $t('command_today_memory');
  };

  const runTonightNow = async () => {
    const confirmed = await modalManager.showDialog({
      title: $t('command_run_tonight'),
      prompt: $t('command_run_tonight_confirm', { values: { count: overview?.schedule.jobs.length ?? 0 } }),
    });
    if (!confirmed) {
      return;
    }
    try {
      await curator.runTonightNow();
      toastManager.primary($t('command_run_tonight_started'));
      await refreshFast();
    } catch (error) {
      toastManager.danger((error as Error).message);
    }
  };

  const progress = (job: JobRow) =>
    job.progress?.total
      ? Math.min(1, (job.progress.done ?? 0) / job.progress.total)
      : job.status === 'running'
        ? 0.05
        : 0;
</script>

<!-- Local Omarchy layer: the poster heads the page; on a phone its name is the bar's (UserPageLayout titleInBody) -->
<UserPageLayout hideNavbar={false} scrollbar title={data.meta.title} titleInBody>
  <div class="ws-inbox command">
    <header class="ws-inbox-head">
      <h1 class="ws-inbox-title">{$t('command_title')}</h1>
      <span class="ws-inbox-count">{DateTime.now().toLocaleString(DateTime.DATE_HUGE)}</span>
    </header>

    {#if offline}
      <p class="command-note">{$t('command_curator_offline')}</p>
    {/if}

    <!-- the four numbers -->
    <section class="command-numbers">
      <a class="command-number" href="/inbox">
        <span class="value">{overview ? number(overview.pending) : '–'}</span>
        <span class="label">{$t('command_waiting')}</span>
      </a>
      <div class="command-number">
        <span class="value">{overview ? number(overview.decided_today) : '–'}</span>
        <span class="label">{$t('command_decided_today')}</span>
      </div>
      <a class="command-number" href="/inbox?tab=jobs">
        <span class="value">{active.length}</span>
        <span class="label">{$t('command_jobs_active')}</span>
      </a>
      <div class="command-number">
        <span class="value">{nextNight ? nextNight.toFormat('HH:mm') : '–'}</span>
        <span class="label">
          {$t('command_next_night', { values: { count: overview?.schedule.jobs.length ?? 0 } })}
        </span>
      </div>
    </section>

    <div class="command-grid">
      <!-- the inbox's biggest batches -->
      <section class="command-panel wide">
        <h2>{$t('command_inbox')}</h2>
        {#if topKinds.length === 0}
          <p class="command-note">{$t('command_inbox_empty')}</p>
        {/if}
        <ul class="command-batches">
          {#each topKinds as kind (kind.series)}
            <li>
              <a href="/inbox?{kindQuery(kind.keys)}">
                <span class="batch-thumbs">
                  {#each kind.preview.slice(0, 3) as id (id)}
                    <img src={thumb(id)} alt="" loading="lazy" />
                  {/each}
                </span>
                <span class="batch-title">{kind.title}</span>
                <span class="batch-count">{number(kind.pending)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>

      <!-- what Curator is doing -->
      <section class="command-panel">
        <h2>{$t('command_jobs')}</h2>
        {#if active.length === 0}
          <p class="command-note">{$t('command_jobs_idle')}</p>
        {/if}
        <ul class="command-jobs">
          {#each active.slice(0, 6) as job (job.id)}
            <li>
              <span class="job-kind">{job.kind}</span>
              <span class="job-note"
                >{job.status === 'queued' ? $t('command_job_queued') : (job.progress?.note ?? '')}</span
              >
              <div class="ws-meter"><span style:width="{progress(job) * 100}%"></span></div>
            </li>
          {/each}
        </ul>
        {#if jobsAlert}
          <!-- Curator's words ("9 failed in the last 7 days."), leading to the failures in the Jobs tab -->
          <a class="command-alert" href={jobsAlert.link ?? '/inbox?tab=jobs#failed'}>
            <Icon icon={mdiAlertCircleOutline} size="16" />
            <span>{jobsAlert.detail}</span>
          </a>
        {/if}
        <button type="button" class="ws-btn-quiet command-run" onclick={runTonightNow}>
          <Icon icon={mdiPlayCircleOutline} size="16" />
          {$t('command_run_tonight')}
        </button>
      </section>

      <!-- the library -->
      <section class="command-panel wide">
        <h2>{$t('command_library')}</h2>
        <!-- what needs a look gets a row with room for its sentence; what is fine is one quiet line of counts -->
        {#if attention.some((entry) => shown(entry))}
          <ul class="command-health">
            {#each attention.filter((entry) => shown(entry)) as entry (entry.key)}
              <li>
                <svelte:element this={entry.link ? 'a' : 'div'} href={entry.link ?? undefined} class="health-row">
                  <span class="health-value">{entry.value === null ? '–' : number(entry.value)}</span>
                  <span class="health-text">
                    <span class="health-title">{entry.title}</span>
                    <span class="health-detail">{entry.detail}</span>
                  </span>
                </svelte:element>
              </li>
            {/each}
          </ul>
        {/if}
        {#if calm.some((entry) => shown(entry))}
          <ul class="command-calm">
            {#each calm.filter((entry) => shown(entry)) as entry (entry.key)}
              <li>
                <svelte:element
                  this={entry.link ? 'a' : 'span'}
                  href={entry.link ?? undefined}
                  title={entry.detail}
                  class="calm-item"
                >
                  <span class="calm-value">{entry.value === null ? '–' : number(entry.value)}</span>
                  {entry.title}
                </svelte:element>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- the machine -->
      <section class="command-panel">
        <h2>{$t('command_machine')}</h2>
        <dl class="command-facts">
          {#if overview?.gpu}
            <dt>{$t('command_gpu')}</dt>
            <dd>
              {(overview.gpu.used_mib / 1024).toFixed(1)} / {(overview.gpu.total_mib / 1024).toFixed(0)} GB
              <div class="ws-meter"><span style:width="{gpuShare * 100}%"></span></div>
            </dd>
          {/if}
          <dt>{$t('command_models')}</dt>
          <dd>
            {overview?.models_loaded.length
              ? overview.models_loaded.map((m) => `${m.name} (${m.vram_gb} GB)`).join(', ')
              : $t('command_models_none')}
          </dd>
          {#if item('disk')}
            <dt>{$t('command_disk')}</dt>
            <dd>{item('disk')?.detail}</dd>
          {/if}
          {#if item('backup')}
            <dt>{$t('command_db_backup')}</dt>
            <dd>{item('backup')?.detail}</dd>
          {/if}
          {#if overview?.backups}
            {@const { mybook, b2 } = overview.backups}
            <dt>{$t('command_local_backup')}</dt>
            <dd class:attention={!mybook.last_ok || mybook.ok === false || stale(mybook.last_ok)}>
              {#if !mybook.last_ok && mybook.ok === null}
                {$t('command_backup_none')}
              {:else}
                {mybook.ok === false ? $t('command_offsite_failed') : $t('command_offsite_ok')}
                {when(mybook.last_ok)}
              {/if}
            </dd>
            <dt>{$t('command_offsite')}</dt>
            <dd class:attention={!b2.configured || b2.ok === false}>
              {#if !b2.configured}
                {$t('command_offsite_not_set_up')}
              {:else if !b2.last_ok && b2.ok === null}
                {$t('command_backup_none')}
              {:else}
                {b2.ok === false ? $t('command_offsite_failed') : $t('command_offsite_ok')}
                {when(b2.last_ok)}
              {/if}
            </dd>
          {/if}
          {#if overview?.paused}
            <dt>{$t('command_paused')}</dt>
            <dd>{$t('command_paused_detail')}</dd>
          {/if}
        </dl>
      </section>

      <!-- today -->
      <section class="command-panel">
        <h2>{$t('command_today')}</h2>
        {#if memory}
          <a class="command-memory" href={Route.viewMemory({ id: memory.id })}>
            <img src={thumb(memory.assets[0].id)} alt="" />
            <span>{memoryLabel(memory)}</span>
          </a>
        {:else}
          <p class="command-note">{$t('command_today_nothing')}</p>
        {/if}
      </section>

      <!-- the actions used most -->
      <section class="command-panel">
        <h2>{$t('command_actions')}</h2>
        <div class="command-actions">
          <button type="button" class="ws-btn" onclick={() => goto('/inbox')}>
            <Icon icon={mdiInboxOutline} size="16" />{$t('command_review')}
          </button>
          <button type="button" class="ws-btn-quiet" onclick={() => goto('/chat')}>
            <Icon icon={mdiChatOutline} size="16" />{$t('command_ask')}
          </button>
          <button type="button" class="ws-btn-quiet" onclick={() => globalSearchManager.open()}>
            <Icon icon={mdiMagnify} size="16" />{$t('search')}
          </button>
          <button type="button" class="ws-btn-quiet" onclick={() => goto('/inbox?tab=calibrate')}>
            <Icon icon={mdiStarFourPointsOutline} size="16" />{$t('ai_inbox_tab_calibrate')}
          </button>
          <button type="button" class="ws-btn-quiet" onclick={() => goto('/user-settings?isOpen=theme')}>
            <Icon icon={mdiPaletteOutline} size="16" />{$t('theme')}
          </button>
        </div>
      </section>
    </div>
  </div>
</UserPageLayout>

<style>
  .command {
    display: grid;
    gap: calc(var(--ws-gap) * 2);
  }
  .command-note {
    color: var(--immich-ui-muted);
    font-size: var(--ws-text-meta);
  }
  .command-numbers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    border-bottom: 1px solid var(--ws-hairline);
  }
  .command-number {
    display: grid;
    gap: 0.2rem;
    padding: calc(var(--ws-gap) * 0.8) 0;
    padding-inline-end: var(--ws-gap);
  }
  .command-number + .command-number {
    padding-inline-start: calc(var(--ws-gap) * 1.2);
    border-inline-start: 1px solid var(--ws-hairline);
  }
  a.command-number:hover .value {
    color: var(--ws-accent);
  }
  .command-number .value {
    font-family: var(--font-display);
    font-size: var(--ws-text-display);
    font-weight: 800;
    font-variation-settings:
      'wdth' 75,
      'opsz' 96;
    line-height: 0.9;
    font-variant-numeric: tabular-nums;
    transition: color 0.15s;
  }
  .command-number .label {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    color: var(--immich-ui-muted);
  }
  .command-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
    gap: calc(var(--ws-gap) * 2.4);
  }
  .command-panel.wide {
    grid-column: 1 / -1;
  }
  .command-panel h2 {
    margin-bottom: calc(var(--ws-gap) * 0.8);
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--ws-hairline);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--immich-ui-muted);
  }
  .command-batches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: var(--ws-gap);
  }
  .command-batches a {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    transition: border-color 0.15s;
  }
  .command-batches a:hover {
    border-color: var(--ws-accent);
  }
  .batch-thumbs {
    display: flex;
  }
  .batch-thumbs img {
    width: 2.6rem;
    height: 2.6rem;
    object-fit: cover;
    border-radius: var(--ws-radius);
    border: 2px solid var(--immich-ui-light);
  }
  .batch-thumbs img + img {
    margin-inline-start: -1rem;
  }
  .batch-title {
    font-weight: 600;
    font-size: var(--ws-text-ui);
    line-height: 1.25;
  }
  /* a count is data, in ink: the accent is for focus and response */
  .batch-count {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-dark);
  }
  .command-jobs {
    display: grid;
    gap: 0.6rem;
  }
  .command-jobs li {
    display: grid;
    gap: 0.2rem;
  }
  .job-kind {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 700;
  }
  .job-note {
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  /* something went wrong: the danger tone (the theme's danger role once it has one, else @immich/ui's danger ramp,
     whose 700 step has the contrast on either face), an icon beside the words, the way to it on hover */
  .command-alert {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    margin-top: 0.75rem;
    font-size: var(--ws-text-meta);
    font-weight: 600;
    color: var(--ws-danger);
  }
  .command-alert:hover span {
    text-decoration: underline;
    text-underline-offset: 0.25em;
  }
  .command-run {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    margin-top: 0.9rem;
  }
  .command-health {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr));
    column-gap: calc(var(--ws-gap) * 2.4);
  }
  .command-health li {
    border-bottom: 1px solid var(--ws-hairline);
  }
  .health-row {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 1rem;
    align-items: baseline;
    height: 100%;
    padding: 0.8rem 0.25rem;
  }
  a.health-row:hover .health-title {
    text-decoration: underline;
    text-decoration-color: var(--ws-accent);
    text-underline-offset: 0.25em;
  }
  .health-value {
    font-family: var(--font-display);
    font-size: var(--ws-text-title);
    font-weight: 800;
    font-variation-settings: 'wdth' 75;
    line-height: 1;
    text-align: end;
  }
  .health-text {
    display: grid;
    gap: 0.2rem;
  }
  .health-title {
    font-weight: 600;
    font-size: var(--ws-text-ui);
  }
  .health-detail {
    max-width: 60ch;
    font-size: var(--ws-text-meta);
    line-height: 1.45;
    color: var(--immich-ui-muted);
  }
  .command-calm {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.25rem;
    padding-top: 0.8rem;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  .calm-item {
    display: inline-flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  a.calm-item:hover {
    color: var(--immich-ui-dark);
  }
  .calm-value {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    color: var(--immich-ui-dark);
  }
  .command-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.55rem 1rem;
    font-size: var(--ws-text-meta);
  }
  .command-facts dt {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    color: var(--immich-ui-muted);
  }
  .command-facts dd {
    display: grid;
    gap: 0.3rem;
  }
  .command-facts dd.attention {
    color: var(--ws-danger);
    font-weight: 600;
  }
  .command-memory {
    display: grid;
    gap: 0.5rem;
  }
  .command-memory img {
    width: 100%;
    max-height: 14rem;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--ws-radius);
  }
  .command-memory span {
    font-weight: 600;
  }
  .command-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .command-actions button {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }
</style>
