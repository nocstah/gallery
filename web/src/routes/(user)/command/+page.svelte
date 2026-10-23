<script lang="ts">
  // Local Omarchy layer: the command center. Everything about the library on one screen: what waits in the AI inbox
  // (by kind, as the inbox lists it: utils/curator-inbox), what Curator is doing and will do tonight, the library's
  // health, the machine (GPU, local models, disk, backups), today's memory, and the actions used most. Read from
  // Curator (~/code/curator: /api/overview, /api/inbox, /api/jobs, /api/library-health) and Gallery (today's
  // memories, as the Memories page's cards: managers/memory-manager); refreshed while open. It opens on one thing to look at: how many wait in the inbox, with the way to
  // review them beside it; the day's other numbers follow in one quiet line, a zero in muted data type. Counts are ink;
  // the danger tone is only for real trouble, never the accent, which stays for focus and response: a job still
  // failing or stuck (Curator's health says which; a week's failures of jobs that have run fine since are said
  // calmly), a backup that failed or is old. An off-site copy not set up yet is a fact, not trouble. What is
  // fine in the library reads as two short lists, its photos and the work, not one run-on line.
  import { goto } from '$app/navigation';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { globalSearchManager } from '$lib/managers/global-search-manager.svelte';
  import { memoryFacts } from '$lib/managers/memory-facts.svelte';
  import { memoryManager } from '$lib/managers/memory-manager.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { getAssetMediaUrl, memoryLaneTitle } from '$lib/utils';
  import { backupCopy, backupWhen, databaseBackup, type BackupFacts } from '$lib/utils/command-words';
  import {
    curator,
    type CuratorOverview,
    type HealthItem,
    type InboxGroup,
    type JobKind,
    type JobRow,
    type LibraryHealth,
  } from '$lib/utils/curator';
  import { kindQuery, kindsOf } from '$lib/utils/curator-inbox';
  import { memoryCardLine } from '$lib/utils/memory-cards';
  import { memoryCover } from '$lib/utils/memory-title';
  import { AssetMediaSize } from '@immich/sdk';
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
  import { t, type Translations } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let overview = $state<CuratorOverview>();
  let groups = $state<InboxGroup[]>([]);
  let jobs = $state<JobRow[]>([]);
  // what each kind of job is called, so a running job reads by its name, not its key (faces.cluster)
  let kinds = $state<JobKind[]>([]);
  let health = $state<LibraryHealth>();
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
    void curator
      .kinds()
      .then((found) => (kinds = found))
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
  // Curator's runs that failed this week or are stuck (its health report says which, and links to them): trouble while
  // a job is still failing or stuck; failures of jobs that have run fine since, a quiet line that still leads to them
  const jobsAlert = $derived(item('curator_jobs')?.attention ? item('curator_jobs') : undefined);
  const jobsPast = $derived.by(() => {
    const entry = item('curator_jobs');
    return entry && !entry.attention && (entry.value ?? 0) > 0 ? entry : undefined;
  });
  // what is fine in the library, in two short lists: the photos, and the work (jobs, last night, the archive's arrivals)
  const WORK = new Set(['gallery_jobs', 'night', 'archive', 'curator_jobs']);
  const calmGroups = $derived(
    [
      {
        name: 'photos',
        label: $t('command_calm_photos'),
        items: calm.filter((entry) => shown(entry) && !WORK.has(entry.key)),
      },
      {
        name: 'work',
        label: $t('command_calm_work'),
        items: calm.filter((entry) => shown(entry) && WORK.has(entry.key)),
      },
    ].filter((group) => group.items.length > 0),
  );
  const number = (value: number) => value.toLocaleString();
  const jobTitle = (kind: string) => kinds.find((entry) => entry.kind === kind)?.title ?? kind;
  // the backups in words: which copy, when it last went well as a person says it the morning after ("last night"),
  // and whether that is fine ("Last night's backup to the My Book: fine, 02:10"), where the page showed the
  // database dump's file name and "OK, Oct 23, 02:30 AM". The copies' names are the owner's disk and service.
  const COPY_NAMES = { mybook: 'My Book', b2: 'B2' };
  const backupWords = (key: Translations, facts: BackupFacts, target?: string) =>
    $t(key, {
      values: {
        state: facts.state,
        when: facts.at ? backupWhen(facts.at) : 'date',
        last: facts.at ? 'yes' : 'no',
        date: facts.at?.toLocaleString({ day: 'numeric', month: 'short' }) ?? '',
        time: facts.at?.toFormat('HH:mm') ?? '',
        target: target ?? '',
      },
    });
  const backups = $derived.by(() => {
    const database = databaseBackup(item('backup'));
    const list = [{ key: 'database', words: backupWords('command_backup_database', database), facts: database }];
    if (overview?.backups) {
      const disk = backupCopy(overview.backups.mybook);
      const offsite = backupCopy(overview.backups.b2);
      list.push(
        { key: 'disk', words: backupWords('command_backup_disk', disk, COPY_NAMES.mybook), facts: disk },
        { key: 'offsite', words: backupWords('command_backup_offsite', offsite, COPY_NAMES.b2), facts: offsite },
      );
    }
    return list;
  });
  // trouble, in the danger tone: no backup, an old one, a copy that failed (an off-site copy not set up is a fact)
  const trouble = (backup: { key: string; facts: BackupFacts }) =>
    backup.facts.state === 'failed' ||
    (backup.key !== 'offsite' && (backup.facts.state === 'stale' || backup.facts.state === 'none'));
  // Local Omarchy layer: today's memory is the Memories page's first card of today, named and shown as that card is
  // (its title of facts, its line, Curator's cover; the owner's "one word for one thing", 2026-10-23), where the page
  // had its own labeller that called the card "Siem Reap · October 2025" "1 year ago". Curator's facts tell which
  // memories are one card, so it waits for them as the Memories page does (2 s at most).
  $effect(() => {
    memoryFacts.request(memoryManager.memories.map(({ id }) => id));
  });
  const todayKnown = $derived(
    memoryManager.loading === undefined && memoryFacts.settledAll(memoryManager.memories.map(({ id }) => id)),
  );
  const today = $derived(todayKnown ? memoryManager.cards.find((card) => card.section === 'today') : undefined);
  const todayCover = $derived(today ? memoryCover(today.lead, memoryFacts.get(today.lead.id)) : undefined);

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

    <!-- the one thing to look at first: what waits in the inbox, and the way to review it -->
    {#if !overview || overview.pending > 0}
      <section class="command-lead">
        <a class="command-lead-count" href="/inbox">
          <span class="value">{overview ? number(overview.pending) : '–'}</span>
          <span class="label">{$t('command_waiting')}</span>
        </a>
        <button type="button" class="ws-btn" onclick={() => goto('/inbox')}>
          <Icon icon={mdiInboxOutline} size="16" />{$t('command_review')}
        </button>
      </section>
    {/if}

    <!-- the day's other numbers in one quiet line: a zero in muted data type, the rest in ink -->
    <p class="command-day">
      {#if overview && overview.pending === 0}
        <a class="command-fact" href="/inbox" data-zero>
          <span class="value">0</span>
          {$t('command_waiting')}
        </a>
      {/if}
      <span class="command-fact" data-zero={overview?.decided_today === 0 || undefined}>
        <span class="value">{overview ? number(overview.decided_today) : '–'}</span>
        {$t('command_decided_today')}
      </span>
      <a class="command-fact" href="/inbox?tab=jobs" data-zero={active.length === 0 || undefined}>
        <span class="value">{active.length}</span>
        {$t('command_jobs_active')}
      </a>
      <span class="command-fact">
        <span class="value">{nextNight ? nextNight.toFormat('HH:mm') : '–'}</span>
        {$t('command_next_night', { values: { count: overview?.schedule.jobs.length ?? 0 } })}
      </span>
    </p>

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
              <span class="job-kind">{jobTitle(job.kind)}</span>
              <span class="job-note"
                >{job.status === 'queued' ? $t('command_job_queued') : (job.progress?.note ?? '')}</span
              >
              <div class="ws-meter"><span style:width="{progress(job) * 100}%"></span></div>
            </li>
          {/each}
        </ul>
        {#if jobsAlert}
          <!-- Curator's words ("1 failed in the last 7 days; still failing: kiosk.sync."), leading to the failures -->
          <a class="command-alert" href={jobsAlert.link ?? '/inbox?tab=jobs#failed'}>
            <Icon icon={mdiAlertCircleOutline} size="16" />
            <span>{jobsAlert.detail}</span>
          </a>
        {:else if jobsPast}
          <!-- failures behind it ("9 failed in the last 7 days; all have run fine since."): said, calmly -->
          <a class="command-past" href={jobsPast.link ?? '/inbox?tab=jobs#failed'}>{jobsPast.detail}</a>
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
        {#if calmGroups.length > 0}
          <div class="command-calm">
            {#each calmGroups as group (group.name)}
              <section class="calm-group" aria-labelledby="calm-{group.name}">
                <h3 class="calm-title" id="calm-{group.name}">{group.label}</h3>
                <ul>
                  {#each group.items as entry (entry.key)}
                    <li>
                      <svelte:element
                        this={entry.link ? 'a' : 'span'}
                        href={entry.link ?? undefined}
                        title={entry.detail}
                        class="calm-item"
                        data-zero={entry.value === 0 || undefined}
                      >
                        <span class="calm-value">{entry.value === null ? '–' : number(entry.value)}</span>
                        <span>{entry.title}</span>
                      </svelte:element>
                    </li>
                  {/each}
                </ul>
              </section>
            {/each}
          </div>
        {/if}
      </section>

      <!-- the machine -->
      <section class="command-panel">
        <h2>{$t('command_machine')}</h2>
        <dl class="command-facts">
          {#if overview?.gpu}
            <dt>{$t('command_gpu')}</dt>
            <dd>
              {$t('command_gpu_in_use', {
                values: {
                  used: (overview.gpu.used_mib / 1024).toFixed(1),
                  total: (overview.gpu.total_mib / 1024).toFixed(0),
                },
              })}
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
          {#if overview?.paused}
            <dt>{$t('command_paused')}</dt>
            <dd>{$t('command_paused_detail')}</dd>
          {/if}
        </dl>
        <!-- the backups, each a sentence: which copy, when it last went well and whether that is fine; trouble (none,
             old, failed) in the danger tone, an off-site copy not set up yet a muted fact -->
        <ul class="command-backups" data-testid="command-backups">
          {#each backups as backup (backup.key)}
            <li class:attention={trouble(backup)} class:quiet={backup.facts.state === 'unset'}>{backup.words}</li>
          {/each}
        </ul>
      </section>

      <!-- today -->
      <section class="command-panel">
        <h2>{$t('command_today')}</h2>
        {#if today && todayCover?.id}
          <a class="command-memory" href={Route.viewMemory({ id: today.lead.id, assetId: today.assets[0].id })}>
            <img src={thumb(todayCover.id)} alt="" />
            <span class="command-memory-words">
              <span class="command-memory-title">{$memoryLaneTitle(today.lead)}</span>
              <span class="command-memory-line">{memoryCardLine(today, $t, $locale)}</span>
            </span>
          </a>
        {:else if todayKnown}
          <p class="command-note">{$t('command_today_nothing')}</p>
        {/if}
      </section>

      <!-- the actions used most -->
      <section class="command-panel">
        <h2>{$t('command_actions')}</h2>
        <!-- Review the inbox leads the page, beside the inbox's count -->
        <div class="command-actions">
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
  /* the one thing to look at first: the inbox's count as the page's one display numeral, its review beside it */
  .command-lead {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.75rem calc(var(--ws-gap) * 2.4);
  }
  .command-lead-count {
    display: grid;
    gap: 0.2rem;
  }
  .command-lead-count:hover .value {
    color: var(--ws-accent);
  }
  .command-lead-count .value {
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
  .command-lead-count .label {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    color: var(--immich-ui-muted);
  }
  .command-lead .ws-btn {
    margin-bottom: 0.15rem;
  }
  /* the day's other numbers, quiet, in data type: the value in ink, a zero muted like its words */
  .command-day {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.75rem;
    padding-bottom: calc(var(--ws-gap) * 0.8);
    border-bottom: 1px solid var(--ws-hairline);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    color: var(--immich-ui-muted);
  }
  .command-fact {
    display: inline-flex;
    gap: 0.45rem;
    align-items: baseline;
  }
  .command-fact .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-dark);
  }
  .command-fact[data-zero] .value {
    font-weight: 400;
    color: var(--immich-ui-muted);
  }
  a.command-fact:hover {
    color: var(--immich-ui-dark);
  }
  .command-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
    gap: calc(var(--ws-gap) * 2.4);
  }
  .command-panel.wide {
    grid-column: 1 / -1;
  }
  /* a panel's name in the heading role over a hairline, as the inbox's Jobs and Health tabs head theirs; it was the
     data role in capitals, so on a phone, where the poster steps aside, nothing on the page read as a heading */
  .command-panel h2 {
    margin-bottom: calc(var(--ws-gap) * 0.8);
    padding-bottom: calc(var(--ws-gap) * 0.8);
    border-bottom: 1px solid var(--ws-hairline);
    font-size: var(--ws-text-heading);
    font-weight: 600;
    line-height: 1.3;
    color: var(--immich-ui-dark);
  }
  /* the inbox's biggest kinds: calm rows split by hairlines in as many columns as fit, where each was a framed card */
  .command-batches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    column-gap: calc(var(--ws-gap) * 2.4);
  }
  .command-batches li {
    border-bottom: 1px solid var(--ws-hairline);
  }
  .command-batches a {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem 0.25rem;
    border-radius: var(--ws-radius);
    transition: background-color 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .command-batches a:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 4%, transparent);
  }
  .command-batches a:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
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
  /* failures behind it: Curator's words in muted meta, still the way to them */
  .command-past {
    display: inline-block;
    margin-top: 0.75rem;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  .command-past:hover {
    color: var(--immich-ui-dark);
    text-decoration: underline;
    text-decoration-color: var(--ws-accent);
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
  /* what is fine, in short lists side by side (the photos, the work), each row its number in data type and its words
     in muted meta; a zero is muted too, so the numbers that are something stand out */
  .command-calm {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
    gap: 1rem calc(var(--ws-gap) * 2.4);
    padding-top: 0.8rem;
  }
  .calm-title {
    margin-bottom: 0.35rem;
    font-size: var(--ws-text-meta);
    font-weight: 600;
    color: var(--immich-ui-dark);
  }
  .calm-group ul {
    display: grid;
    gap: 0.3rem;
  }
  .calm-item {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    gap: 0.75rem;
    align-items: baseline;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  a.calm-item:hover {
    color: var(--immich-ui-dark);
  }
  .calm-value {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: end;
    color: var(--immich-ui-dark);
  }
  .calm-item[data-zero] .calm-value {
    font-weight: 400;
    color: var(--immich-ui-muted);
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
  /* the backups, a sentence each in meta: ink while fine, the danger tone for trouble, muted for what is not set up */
  .command-backups {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.9rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--ws-hairline);
    font-size: var(--ws-text-meta);
    line-height: 1.45;
  }
  .command-backups .attention {
    color: var(--ws-danger);
    font-weight: 600;
  }
  .command-backups .quiet {
    color: var(--immich-ui-muted);
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
  /* the card's words: its title, then its line in data type, as the Memories page's card says them */
  .command-memory-words {
    display: grid;
    gap: 0.15rem;
  }
  .command-memory-title {
    font-weight: 600;
  }
  .command-memory-line {
    color: var(--immich-ui-muted);
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
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
