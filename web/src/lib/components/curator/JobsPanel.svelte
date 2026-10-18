<script lang="ts">
  // Local Omarchy layer: Curator's jobs and health. Scans only make suggestions, so running one is always safe; the
  // health line says what would make a job unsafe (Gallery's schema drifting from Curator's reads) or slow (paused for
  // a game, low disk). The runs that failed in the last week come first (#failed, where the command center's and the
  // Health tab's count of them lead), since the routine runs push them out of the recent list within hours. The list
  // refreshes itself while anything is queued or running.
  import { curator, type Health, type JobKind, type JobRow } from '$lib/utils/curator';
  import { onDestroy, onMount, tick } from 'svelte';
  import { locale, t, type Translations } from 'svelte-i18n';

  interface Props {
    health: Health;
    onChange: () => void;
  }

  let { health, onChange }: Props = $props();

  const JOB_LABEL: Record<JobRow['status'], Translations> = {
    queued: 'ai_inbox_queued',
    running: 'running',
    done: 'done',
    failed: 'failed',
    cancelled: 'ai_inbox_cancelled',
  };

  let kinds = $state<JobKind[]>([]);
  let jobs = $state<JobRow[]>([]);
  let failures = $state<JobRow[]>([]);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const titleOf = (kind: string) => kinds.find((entry) => entry.kind === kind)?.title ?? kind;
  const live = $derived(jobs.some((job) => job.status === 'queued' || job.status === 'running'));

  const load = async () => {
    jobs = await curator.jobs(30);
    clearTimeout(timer);
    if (jobs.some((job) => job.status === 'queued' || job.status === 'running')) {
      timer = setTimeout(() => void load(), 2000);
    } else {
      onChange();
    }
  };

  const run = async (kind: string) => {
    await curator.startJob(kind);
    await load();
  };

  const cancel = async (id: number) => {
    await curator.cancelJob(id);
    await load();
  };

  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString($locale ?? undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

  const summary = (job: JobRow) => {
    if (job.status === 'failed') {
      return job.error?.split('\n', 1)[0] ?? '';
    }
    if (!job.result) {
      return job.progress.note ?? '';
    }
    return Object.entries(job.result)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => `${key.replaceAll('_', ' ')} ${value}`)
      .join(' · ');
  };

  const backupAge = $derived.by(() => {
    if (!health.last_backup) {
      return $t('ai_inbox_no_backup');
    }
    const hours = (Date.now() / 1000 - health.last_backup.at) / 3600;
    return $t('ai_inbox_last_backup', { values: { hours: Math.max(0, Math.round(hours)) } });
  });

  onMount(async () => {
    kinds = await curator.kinds();
    await load();
    failures = await curator.failedJobs(7).catch(() => []);
    if (location.hash === '#failed') {
      await tick();
      document.querySelector('#failed')?.scrollIntoView({ block: 'start' });
    }
  });

  onDestroy(() => clearTimeout(timer));
</script>

<div class="jobs-health ws-inbox-meta">
  <span>{$t('ai_inbox_disk_free', { values: { size: Math.round(health.disk.free_gb) } })}</span>
  <span>{backupAge}</span>
  {#if health.paused}
    <span>{$t('ai_inbox_paused')}</span>
  {/if}
</div>
{#if health.schema_drift.length > 0}
  <p class="jobs-warning" role="alert">
    {$t('ai_inbox_schema_drift', { values: { names: health.schema_drift.join(', ') } })}
  </p>
{/if}

{#if failures.length > 0}
  <h2 class="jobs-heading" id="failed">{$t('ai_inbox_failed_week')}</h2>
  <ul class="ws-inbox-rows">
    {#each failures as job (job.id)}
      <li>
        <div class="ws-inbox-row job-row" data-status={job.status}>
          <div class="job-text">
            <span class="ws-inbox-row-title">{titleOf(job.kind)}</span>
            <span class="ws-inbox-meta">{$t(JOB_LABEL[job.status])} · {when(job.finished_at ?? job.created_at)}</span>
            <span class="ws-inbox-meta job-summary">{summary(job)}</span>
          </div>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<h2 class="jobs-heading">{$t('ai_inbox_scans')}</h2>
<ul class="ws-inbox-rows">
  {#each kinds as kind (kind.kind)}
    <li>
      <div class="ws-inbox-row kind-row">
        <span class="ws-inbox-row-title">{kind.title}</span>
        <button type="button" class="ws-btn-quiet" onclick={() => run(kind.kind)}>{$t('ai_inbox_run')}</button>
      </div>
    </li>
  {/each}
</ul>

<h2 class="jobs-heading">{$t('ai_inbox_recent_jobs')}</h2>
{#if jobs.length === 0}
  <p class="ws-inbox-row-body">{$t('ai_inbox_no_jobs')}</p>
{:else}
  <ul class="ws-inbox-rows" aria-live={live ? 'polite' : 'off'}>
    {#each jobs as job (job.id)}
      <li>
        <div class="ws-inbox-row job-row" data-status={job.status}>
          <div class="job-text">
            <span class="ws-inbox-row-title">{titleOf(job.kind)}</span>
            <span class="ws-inbox-meta">{$t(JOB_LABEL[job.status])} · {when(job.started_at ?? job.created_at)}</span>
            <span class="ws-inbox-meta job-summary">{summary(job)}</span>
            {#if job.status === 'running' && job.progress.total}
              <div class="ws-meter">
                <span style:width="{((job.progress.done ?? 0) / job.progress.total) * 100}%"></span>
              </div>
            {/if}
          </div>
          {#if job.status === 'queued' || job.status === 'running'}
            <button type="button" class="ws-btn-quiet" onclick={() => cancel(job.id)}>{$t('cancel')}</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .jobs-health {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    padding: 1.25rem 0 0.25rem;
  }
  .jobs-warning {
    margin-top: 0.75rem;
    max-width: 62ch;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .jobs-heading {
    margin-top: 2rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--ws-hairline);
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -0.01em;
    scroll-margin-top: 1rem;
  }
  .kind-row,
  .job-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
  .kind-row {
    padding: 0.6rem 0;
  }
  .job-text {
    display: grid;
    gap: 0.25rem;
  }
  .job-text :global(.ws-meter) {
    max-width: 24rem;
    margin-top: 0.25rem;
  }
  .job-summary {
    font-weight: 500;
  }
  .job-row[data-status='failed'] .job-summary {
    color: var(--immich-ui-dark);
  }
</style>
