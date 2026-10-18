<script lang="ts">
  // Local Omarchy layer: reviewing one kind of Curator's suggestions, all its batches as one queue (utils/curator-inbox:
  // Curator adds each night's proposals to the batch of their kind still waiting, and the batches it made one per
  // night before that open together). Reject the few that are wrong, then accept the rest in one go; every accepted
  // change stays undoable here and in History. Keys: j/k move, a accepts, r rejects, u undoes. Accepting more than 20
  // at once runs Curator's database backup first, shown as progress. A decided row sinks to the bottom of the list at
  // once, so the next one to decide is always where the last was. A card about one photo also has Delete (key d): the
  // photo goes to Gallery's Trash and the card is set aside; its Undo restores the photo and puts the card back.
  import ReviewMode from '$lib/components/curator/ReviewMode.svelte';
  import StoryText from '$lib/components/curator/StoryText.svelte';
  import SuggestionVisual from '$lib/components/curator/SuggestionVisual.svelte';
  import { curator, waitForJob, type GroupPage, type Suggestion, type SuggestionStatus } from '$lib/utils/curator';
  import { newestBatch, queueOrder, runDays, runsOf, waitingIn } from '$lib/utils/curator-inbox';
  import { deleteAssets, restoreAssets } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiArrowLeft } from '@mdi/js';
  import { onMount, tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { SvelteSet } from 'svelte/reactivity';
  import { locale, t, type Translations } from 'svelte-i18n';

  interface Props {
    /** the kind's batches */
    keys: string[];
    onChange: () => void;
  }

  let { keys, onChange }: Props = $props();

  const FILTERS = ['pending', 'applied', 'rejected'] as const;
  type Filter = (typeof FILTERS)[number];
  const STATUS_LABEL: Record<SuggestionStatus, Translations> = {
    pending: 'waiting',
    applied: 'ai_inbox_applied',
    rejected: 'ai_inbox_rejected',
    failed: 'failed',
    undone: 'ai_inbox_undone',
    superseded: 'ai_inbox_replaced',
  };
  // a page of the list, per batch
  const PAGE = 100;

  let filter = $state<Filter>('pending');
  /** each batch's last page: its words, how many it holds under the filter */
  let pages = $state<GroupPage[]>([]);
  /** how many of each batch's suggestions are in the list */
  let loaded = $state<Record<string, number>>({});
  let items = $state<Suggestion[]>([]);
  let busy = $state(false);
  let working = $state<{ note: string; done: number; total: number }>();
  let message = $state<string>();
  let rows: HTMLElement[] = $state([]);
  let reviewing = $state(false);
  /** rows whose accept or reject is on its way to Curator */
  const deciding = new SvelteSet<number>();
  /** cards whose photo was sent to the Trash from here */
  const trashed = new SvelteSet<number>();

  const deletable = (item: Suggestion) => item.kind.startsWith('asset.') && new Set(item.asset_ids).size === 1;

  const words = $derived(pages.length > 0 ? newestBatch(pages.map((page) => page.group)) : undefined);
  const runs = $derived([...new Set(pages.flatMap((page) => runsOf(page.group)))].sort());
  const total = $derived(pages.reduce((sum, page) => sum + page.total, 0));
  const waiting = $derived(filter === 'pending' ? items.filter((item) => item.status === 'pending').length : 0);
  const remaining = $derived(filter === 'pending' ? total - (items.length - waiting) : 0);
  const more = $derived(pages.some((page) => (loaded[page.group.key] ?? 0) < page.total));

  const closeReview = async () => {
    reviewing = false;
    await load();
    onChange();
  };

  const load = async (append = false) => {
    try {
      const wanted = append
        ? pages.filter((page) => (loaded[page.group.key] ?? 0) < page.total).map((page) => page.group.key)
        : keys;
      const next = await Promise.all(
        wanted.map((key) => curator.group(key, filter, PAGE, append ? (loaded[key] ?? 0) : 0)),
      );
      const counts = append ? { ...loaded } : {};
      for (const page of next) {
        counts[page.group.key] = (counts[page.group.key] ?? 0) + page.items.length;
      }
      loaded = counts;
      pages = append ? pages.map((page) => next.find((fresh) => fresh.group.key === page.group.key) ?? page) : next;
      const fresh = queueOrder(next.flatMap((page) => page.items));
      items = append ? [...items, ...fresh] : fresh;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
  };

  const setStatus = (ids: number[], status: SuggestionStatus) => {
    const set = new Set(ids);
    for (const item of items) {
      if (set.has(item.id)) {
        item.status = status;
      }
    }
  };

  // the decided rows go to the bottom, keeping their order
  const sink = (ids: number[]) => {
    const set = new Set(ids);
    items = [...items.filter((item) => !set.has(item.id)), ...items.filter((item) => set.has(item.id))];
  };

  const decide = async (ids: number[], decision: 'accept' | 'reject') => {
    ids = ids.filter((id) => !deciding.has(id));
    if (ids.length === 0) {
      return;
    }
    // one row at a time stays quick: the rest of the list stays usable while it is applied
    const single = ids.length === 1;
    if (single) {
      deciding.add(ids[0]);
      sink(ids);
    } else {
      busy = true;
    }
    message = undefined;
    try {
      const result = await curator.decide(ids, decision);
      if (result.job) {
        working = { note: $t('ai_inbox_applying', { values: { count: ids.length } }), done: 0, total: ids.length };
        const job = await waitForJob(result.job, (row) => {
          if (working && row.progress.total) {
            working = { ...working, done: row.progress.done ?? 0, total: row.progress.total };
          }
        });
        working = undefined;
        if (job?.status === 'failed') {
          message = job.error?.split('\n', 1)[0] ?? $t('failed');
        }
        await load();
      } else if (decision === 'reject') {
        setStatus(ids, 'rejected');
        sink(ids);
      } else {
        setStatus(result.applied ?? [], 'applied');
        setStatus(result.failed ?? [], 'failed');
        if (result.failed?.length) {
          message = $t('ai_inbox_some_failed', { values: { count: result.failed.length } });
        }
        sink(ids);
      }
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      for (const id of ids) {
        deciding.delete(id);
      }
      if (!single) {
        busy = false;
      }
      onChange();
    }
  };

  const trash = async (item: Suggestion) => {
    if (deciding.has(item.id) || item.status !== 'pending' || !deletable(item)) {
      return;
    }
    deciding.add(item.id);
    sink([item.id]);
    message = undefined;
    try {
      await deleteAssets({ assetBulkDeleteDto: { ids: [item.asset_ids[0]] } });
      await curator.decide([item.id], 'reject');
      item.status = 'rejected';
      trashed.add(item.id);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      deciding.delete(item.id);
      onChange();
    }
  };

  const untrash = async (item: Suggestion) => {
    busy = true;
    message = undefined;
    try {
      await restoreAssets({ bulkIdsDto: { ids: [item.asset_ids[0]] } });
      await curator.reopen([item.id]);
      item.status = 'pending';
      trashed.delete(item.id);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
      onChange();
    }
  };

  const decideAll = async (decision: 'accept' | 'reject') => {
    const queue = await waitingIn(keys);
    await decide(
      queue.map((item) => item.id),
      decision,
    );
  };

  const undo = async (item: Suggestion) => {
    busy = true;
    message = undefined;
    try {
      const result = await curator.undo([item.id]);
      const problem = result.conflicts[0] ?? result.failed?.[0];
      if (result.undone.includes(item.id)) {
        item.status = 'undone';
      } else if (problem) {
        message = $t('ai_inbox_conflict', { values: { reason: problem.reason } });
      }
    } finally {
      busy = false;
      onChange();
    }
  };

  const setFilter = async (next: Filter) => {
    filter = next;
    await load();
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const index = rows.indexOf(document.activeElement as HTMLElement);
    const item = items[index];
    const move = (to: number) => rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
    if (event.key === 'j' || event.key === 'ArrowDown') {
      move(index + 1);
    } else if (event.key === 'k' || event.key === 'ArrowUp') {
      move(index - 1);
    } else if (item && event.key === 'a' && item.status === 'pending' && !deciding.has(item.id)) {
      void decide([item.id], 'accept');
      void tick().then(() => move(index)); // the next row has moved up into this place
    } else if (
      item &&
      (event.key === 'r' || event.key === 'x') &&
      item.status === 'pending' &&
      !deciding.has(item.id)
    ) {
      void decide([item.id], 'reject');
      void tick().then(() => move(index));
    } else if (item && event.key === 'd' && item.status === 'pending' && deletable(item) && !deciding.has(item.id)) {
      void trash(item);
      void tick().then(() => move(index));
    } else if (item && event.key === 'u' && trashed.has(item.id)) {
      void untrash(item);
    } else if (item && event.key === 'u' && item.status === 'applied') {
      void undo(item);
    } else {
      return;
    }
    event.preventDefault();
  };

  const confidence = (value: number | null) => (value === null ? '' : `${Math.round(value * 100)}%`);

  onMount(() => {
    void load();
  });
</script>

<div class="group-head">
  <a class="ws-inbox-link back" href="?"><Icon icon={mdiArrowLeft} size="16" />{$t('back')}</a>
  {#if words}
    <h2 class="group-title">{words.title}</h2>
    {#if filter === 'pending' || runs.length > 0}
      <p class="ws-inbox-meta group-facts">
        {#if filter === 'pending'}
          <span>{$t('ai_inbox_waiting', { values: { count: remaining } })}</span>
        {/if}
        {#if runs.length > 0}
          <span>{runDays(runs, $locale ?? undefined)}</span>
        {/if}
      </p>
    {/if}
    {#if words.description}
      <p class="ws-inbox-row-body">{words.description}</p>
    {/if}
  {/if}
  <div class="group-bar">
    <div class="ws-seg" role="group" aria-label={words?.title}>
      {#each FILTERS as name (name)}
        <button type="button" aria-pressed={filter === name} onclick={() => setFilter(name)}>
          {$t(STATUS_LABEL[name])}
        </button>
      {/each}
    </div>
    {#if filter === 'pending' && remaining > 0}
      <button type="button" class="ws-btn-quiet" disabled={busy} onclick={() => (reviewing = true)}>
        {$t('ai_inbox_review')}
      </button>
      <button type="button" class="ws-btn" disabled={busy} onclick={() => decideAll('accept')}>
        {$t('ai_inbox_accept_all', { values: { count: remaining } })}
      </button>
      <button type="button" class="ws-btn-quiet" disabled={busy} onclick={() => decideAll('reject')}>
        {$t('ai_inbox_reject_all')}
      </button>
    {/if}
  </div>
  {#if working}
    <div class="group-working" role="status">
      <span class="ws-inbox-meta">{working.note}</span>
      <div class="ws-meter"><span style:width="{(working.done / Math.max(1, working.total)) * 100}%"></span></div>
    </div>
  {/if}
  {#if message}
    <p class="group-message" role="status">{message}</p>
  {/if}
</div>

{#if pages.length > 0 && items.length === 0}
  <p class="ws-inbox-row-body group-empty">{$t('ai_inbox_group_empty')}</p>
{/if}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul class="ws-inbox-rows" onkeydown={onKeydown}>
  {#each items as item, index (item.id)}
    <li animate:flip={{ duration: 180 }}>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="ws-inbox-row item-row"
        tabindex="0"
        data-status={item.status}
        data-deciding={deciding.has(item.id) || undefined}
        bind:this={rows[index]}
      >
        <SuggestionVisual suggestion={item} />
        <div class="item-text">
          <span class="ws-inbox-row-title">{item.title}</span>
          {#if item.detail}
            <p class="ws-inbox-row-body">{item.detail}</p>
          {/if}
          {#if item.story}
            <StoryText story={item.story} kind={item.kind} clamp />
          {/if}
          {#if item.confidence !== null || item.error}
            <span class="ws-inbox-meta">{item.error ?? confidence(item.confidence)}</span>
          {/if}
        </div>
        <div class="item-actions">
          {#if item.status === 'pending'}
            <button
              type="button"
              class="ws-btn"
              disabled={busy || deciding.has(item.id)}
              onclick={() => decide([item.id], 'accept')}
            >
              {$t('accept')}
            </button>
            <button
              type="button"
              class="ws-btn-quiet"
              disabled={busy || deciding.has(item.id)}
              onclick={() => decide([item.id], 'reject')}
            >
              {$t('ai_inbox_reject')}
            </button>
            {#if deletable(item)}
              <button
                type="button"
                class="ws-btn-quiet"
                disabled={busy || deciding.has(item.id)}
                onclick={() => trash(item)}
              >
                {$t('delete')}
              </button>
            {/if}
          {:else if trashed.has(item.id)}
            <span class="ws-inbox-meta">{$t('moved_to_trash')}</span>
            <button type="button" class="ws-btn-quiet" disabled={busy} onclick={() => untrash(item)}>
              {$t('undo')}
            </button>
          {:else}
            <span class="ws-inbox-meta">{$t(STATUS_LABEL[item.status])}</span>
            {#if item.status === 'applied'}
              <button type="button" class="ws-btn-quiet" disabled={busy} onclick={() => undo(item)}>
                {$t('undo')}
              </button>
            {/if}
          {/if}
        </div>
      </div>
    </li>
  {/each}
</ul>

{#if reviewing && words}
  <ReviewMode {keys} title={words.title} onClose={closeReview} />
{/if}

{#if more}
  <button type="button" class="ws-btn-quiet more" onclick={() => load(true)}>{$t('show_more')}</button>
{/if}

<style>
  .group-head {
    display: grid;
    gap: 0.6rem;
    padding: 1.25rem 0 1rem;
    border-bottom: 1px solid var(--ws-hairline);
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    justify-self: start;
    color: var(--immich-ui-muted);
  }
  .group-title {
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem);
    font-weight: 750;
    font-variation-settings:
      'wdth' 80,
      'opsz' 72;
    letter-spacing: -0.03em;
    line-height: 1.05;
    text-wrap: balance;
  }
  .group-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 1.25rem;
  }
  .group-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.4rem;
  }
  .group-bar :global(.ws-seg) {
    margin-inline-start: 0;
    margin-inline-end: auto;
  }
  .group-working {
    display: grid;
    gap: 0.4rem;
    max-width: 36rem;
  }
  .group-message {
    font-size: 0.9rem;
    font-weight: 500;
  }
  .group-empty {
    padding: 2rem 0;
  }
  .item-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
  }
  .item-row[data-deciding],
  .item-row[data-status='rejected'],
  .item-row[data-status='undone'],
  .item-row[data-status='superseded'] {
    opacity: 0.55;
  }
  .item-text {
    display: grid;
    gap: 0.3rem;
    align-content: start;
  }
  .item-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .more {
    margin-top: 1rem;
  }
  @media (max-width: 767px) {
    .item-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
