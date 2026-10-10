<script lang="ts">
  // Local Omarchy layer: the AI inbox. Curator (~/code/curator) proposes changes to the library; nothing is written
  // until it is accepted here, and everything accepted can be undone from History. Calibrate collects the hand
  // labels each judge must agree with before it may act alone; Jobs starts scans and shows Curator's health.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import CalibratePanel from '$lib/components/curator/CalibratePanel.svelte';
  import HistoryPanel from '$lib/components/curator/HistoryPanel.svelte';
  import InboxGroupView from '$lib/components/curator/InboxGroupView.svelte';
  import InboxOverview from '$lib/components/curator/InboxOverview.svelte';
  import JobsPanel from '$lib/components/curator/JobsPanel.svelte';
  import { curator, CuratorError, type Health } from '$lib/utils/curator';
  import { onMount } from 'svelte';
  import { t, type Translations } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const TABS = ['inbox', 'calibrate', 'history', 'jobs'] as const;
  type Tab = (typeof TABS)[number];
  const TAB_LABEL: Record<Tab, Translations> = {
    inbox: 'ai_inbox_tab_inbox',
    calibrate: 'ai_inbox_tab_calibrate',
    history: 'ai_inbox_tab_history',
    jobs: 'jobs',
  };

  const tab = $derived.by((): Tab => {
    const value = page.url.searchParams.get('tab');
    return TABS.includes(value as Tab) ? (value as Tab) : 'inbox';
  });
  const groupKey = $derived(page.url.searchParams.get('group'));

  let health = $state<Health>();
  let failure = $state<CuratorError>();

  const refresh = async () => {
    try {
      health = await curator.health();
      failure = undefined;
    } catch (error) {
      failure = error instanceof CuratorError ? error : new CuratorError(String(error), 0);
    }
  };

  const open = (params: Record<string, string>) => goto(`?${new URLSearchParams(params)}`, { noScroll: false });

  onMount(() => {
    void refresh();
  });
</script>

<UserPageLayout>
  <div class="ws-inbox">
    <header class="ws-inbox-head">
      <h1 class="ws-inbox-title">{data.meta.title}</h1>
      {#if health}
        <span class="ws-inbox-count">{$t('ai_inbox_waiting', { values: { count: health.pending } })}</span>
      {/if}
      <div class="ws-seg" role="group" aria-label={data.meta.title}>
        {#each TABS as name (name)}
          <button type="button" aria-pressed={tab === name} onclick={() => open(name === 'inbox' ? {} : { tab: name })}>
            {$t(TAB_LABEL[name])}
          </button>
        {/each}
      </div>
    </header>

    {#if failure}
      <div class="ws-empty">
        <h2 class="ws-empty-title">
          {failure.status === 0 ? $t('ai_inbox_offline_title') : $t('ai_inbox_denied_title')}
        </h2>
        <p class="ws-empty-body">
          {failure.status === 0 ? $t('ai_inbox_offline_body') : failure.message}
        </p>
        <div class="ws-empty-actions">
          <button type="button" class="ws-empty-action" onclick={refresh}>{$t('retry')}</button>
        </div>
      </div>
    {:else if health}
      {#if tab === 'inbox'}
        {#if groupKey}
          {#key groupKey}
            <InboxGroupView key={groupKey} onChange={refresh} />
          {/key}
        {:else}
          <InboxOverview onRunScan={() => open({ tab: 'jobs' })} onCalibrate={() => open({ tab: 'calibrate' })} />
        {/if}
      {:else if tab === 'calibrate'}
        <CalibratePanel />
      {:else if tab === 'history'}
        <HistoryPanel onChange={refresh} />
      {:else}
        <JobsPanel {health} onChange={refresh} />
      {/if}
    {/if}
  </div>
</UserPageLayout>
