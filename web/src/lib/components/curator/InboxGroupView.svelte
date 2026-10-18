<script lang="ts">
  // Local Omarchy layer: reviewing one kind of Curator's suggestions, all its batches as one queue (utils/curator-inbox:
  // Curator adds each night's proposals to the batch of their kind still waiting, and the batches it made one per
  // night before that open together). Every word says what accepting does for this kind (utils/curator-inbox
  // kindAction: Archive, Publish, Make album), never a bare Accept. Review one by one leads; doing all of the kind at
  // once comes second, each way saying what it does before the click (Gallery's database backed up first when more
  // than 20 change) and leaving a receipt after it with Undo all, which takes back exactly that action in one call to
  // Curator and leaves them all waiting again. Every accepted change stays undoable here and in History, and a
  // rejected one waits under Rejected, where Put back returns it.
  // The cards are a list of articles, each named by its title. The keys (one quiet line above the cards says them, and
  // each button names its own in aria-keyshortcuts): J/K or the arrows move from card to card, A does what the card's
  // first button says, R rejects, D sends a one-photo card's photo to the Trash, U takes back the last word on a card
  // (an accepted change undone and waiting again, a rejection put back, a photo back from the Trash); a held one acts
  // once. A decided card sinks to the bottom of the list at once, so the next one to decide is always where the last
  // was; its buttons sit under its words, beside its photos. A card about one photo also has Delete, in the danger
  // role: the photo goes to Gallery's Trash and the card is set aside; its Undo restores the photo and puts the card
  // back.
  import ReviewMode from '$lib/components/curator/ReviewMode.svelte';
  import StoryText from '$lib/components/curator/StoryText.svelte';
  import SuggestionVisual from '$lib/components/curator/SuggestionVisual.svelte';
  import {
    curator,
    waitForJob,
    type GroupPage,
    type JobRow,
    type Suggestion,
    type SuggestionStatus,
    type UndoJobResult,
  } from '$lib/utils/curator';
  import {
    kindAction,
    newestBatch,
    queueOrder,
    runDays,
    runsOf,
    seriesOf,
    sharedConfidence,
    waitingIn,
  } from '$lib/utils/curator-inbox';
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
  // Curator answers a page of at most 500; a reopen takes as many at once
  const PAGE = 100;
  const MOST = 500;
  // more than this many accepted or taken back at once go to Curator's worker, after its database backup
  const SYNC_LIMIT = 20;

  let filter = $state<Filter>('pending');
  /** each batch's last page: its words, how many it holds under the filter */
  let pages = $state<GroupPage[]>([]);
  /** how many of each batch's suggestions are in the list */
  let loaded = $state<Record<string, number>>({});
  let items = $state<Suggestion[]>([]);
  let busy = $state(false);
  let working = $state<{ note: string; done: number; total: number }>();
  let message = $state<string>();
  /** what the kind's action for all of it (or Reject all) just did: its receipt and Undo all */
  let bulk = $state<{ decision: 'accept' | 'reject'; ids: number[]; done: number; failed: number }>();
  let rows: HTMLElement[] = $state([]);
  let reviewing = $state(false);
  /** rows whose accept or reject is on its way to Curator */
  const deciding = new SvelteSet<number>();
  /** cards whose photo was sent to the Trash from here */
  const trashed = new SvelteSet<number>();
  /** cards decided since the list was loaded */
  const decided = new SvelteSet<number>();

  const deletable = (item: Suggestion) => item.kind.startsWith('asset.') && new Set(item.asset_ids).size === 1;

  const words = $derived(pages.length > 0 ? newestBatch(pages.map((page) => page.group)) : undefined);
  /** what accepting does for this kind, in words (utils/curator-inbox) */
  const action = $derived(kindAction(seriesOf(keys[0] ?? ''), words?.kind ?? ''));
  /** a card's own words: the chat's batch holds every kind of change, each card its own */
  const cardAction = (item: Suggestion) => (action.verb === 'apply' ? kindAction('', item.kind) : action);
  const runs = $derived([...new Set(pages.flatMap((page) => runsOf(page.group)))].sort());
  const total = $derived(pages.reduce((sum, page) => sum + page.total, 0));
  const remaining = $derived(filter === 'pending' ? Math.max(0, total - decided.size) : 0);
  const more = $derived(pages.some((page) => (loaded[page.group.key] ?? 0) < page.total));
  const anyDeletable = $derived(items.some((item) => item.status === 'pending' && deletable(item)));
  /** "80% sure" on every card tells one from another nothing: then no card says it */
  const quietConfidence = $derived(sharedConfidence(items));

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
      if (!append) {
        decided.clear();
      }
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

  const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

  const mark = (ids: number[]) => {
    for (const id of ids) {
      decided.add(id);
    }
  };

  // the decided rows go to the bottom, keeping their order
  const sink = (ids: number[]) => {
    const set = new Set(ids);
    items = [...items.filter((item) => !set.has(item.id)), ...items.filter((item) => set.has(item.id))];
  };

  /** one card's decision: the rest of the list stays usable while it is applied */
  const decide = async (item: Suggestion, decision: 'accept' | 'reject') => {
    if (deciding.has(item.id)) {
      return;
    }
    deciding.add(item.id);
    sink([item.id]);
    message = undefined;
    bulk = undefined;
    try {
      const result = await curator.decide([item.id], decision);
      if (decision === 'reject') {
        item.status = 'rejected';
      } else if (result.applied?.includes(item.id)) {
        item.status = 'applied';
      } else if (result.failed?.includes(item.id)) {
        item.status = 'failed';
        message = $t('ai_inbox_some_failed', { values: { count: 1 } });
      }
      if (item.status !== 'pending') {
        mark([item.id]);
      }
    } catch (error) {
      message = failure(error);
    } finally {
      deciding.delete(item.id);
      onChange();
    }
  };

  /** a Curator job's progress on the meter, until it is done */
  const follow = async (job: number, note: string, count: number): Promise<JobRow | undefined> => {
    working = { note, done: 0, total: count };
    try {
      return await waitForJob(job, (row) => {
        if (working && row.progress.total) {
          working = { ...working, done: row.progress.done ?? 0, total: row.progress.total };
        }
      });
    } finally {
      working = undefined;
    }
  };

  /** every waiting one of the kind at once: what accepting does (Archive all 42), or Reject all; a receipt after it */
  const decideAll = async (decision: 'accept' | 'reject') => {
    busy = true;
    message = undefined;
    bulk = undefined;
    try {
      const queue = await waitingIn(keys);
      const ids = queue.map((item) => item.id);
      if (ids.length === 0) {
        return;
      }
      const result = await curator.decide(ids, decision);
      let done = 0;
      let failed = 0;
      if (result.job) {
        const job = await follow(result.job, $t('ai_inbox_applying', { values: { count: ids.length } }), ids.length);
        if (job?.status === 'failed') {
          message = job.error?.split('\n', 1)[0] ?? $t('failed');
        }
        done = Number(job?.result?.applied ?? 0);
        failed = Number(job?.result?.failed ?? 0);
      } else if (decision === 'reject') {
        done = result.rejected ?? ids.length;
      } else {
        done = result.applied?.length ?? 0;
        failed = result.failed?.length ?? 0;
      }
      if (done > 0) {
        bulk = { decision, ids, done, failed };
      } else if (failed > 0) {
        message = $t('ai_inbox_some_failed', { values: { count: failed } });
      }
      await load();
    } catch (error) {
      message = failure(error);
    } finally {
      busy = false;
      onChange();
    }
  };

  /** rejected (or failed) back to waiting, `MOST` at a time; the ones Curator left as they were */
  const reopen = async (ids: number[]) => {
    const back: number[] = [];
    for (let start = 0; start < ids.length; start += MOST) {
      const { reopened } = await curator.reopen(ids.slice(start, start + MOST));
      back.push(...reopened);
    }
    return ids.filter((id) => !back.includes(id));
  };

  /** Undo all: exactly what the action for all of it did, taken back in one call, and all of them waiting again */
  const undoAll = async () => {
    const last = bulk;
    if (!last) {
      return;
    }
    busy = true;
    message = undefined;
    try {
      if (last.decision === 'reject') {
        const left = await reopen(last.ids);
        if (left.length > 0) {
          message = $t('ai_inbox_put_back_failed', { values: { count: left.length } });
        }
      } else {
        const result = await curator.undo(last.ids, true);
        // more than 20 are taken back by Curator's worker, which counts what it did; fewer are answered at once
        let problems: { id: number; reason: string }[] = [];
        let count = 0;
        if (result.job) {
          const job = await follow(result.job, $t('ai_inbox_undoing', { values: { count: last.done } }), last.done);
          const outcome = job?.result as UndoJobResult | null | undefined;
          if (job?.status === 'failed') {
            message = job.error?.split('\n', 1)[0] ?? $t('failed');
          }
          problems = outcome?.problems ?? [];
          count = (outcome?.conflicts ?? 0) + (outcome?.failed ?? 0);
        } else {
          problems = [...(result.conflicts ?? []), ...(result.failed ?? [])];
          count = problems.length;
        }
        if (count > 0 && problems.length > 0) {
          message = $t('ai_inbox_undo_all_left', { values: { count, reason: problems[0].reason } });
        }
      }
      bulk = undefined;
      await load();
    } catch (error) {
      message = failure(error);
    } finally {
      busy = false;
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
      decided.add(item.id);
    } catch (error) {
      message = failure(error);
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
      decided.delete(item.id);
    } catch (error) {
      message = failure(error);
    } finally {
      busy = false;
      onChange();
    }
  };

  const putBack = async (item: Suggestion) => {
    busy = true;
    message = undefined;
    try {
      const left = await reopen([item.id]);
      if (left.length > 0) {
        message = $t('ai_inbox_put_back_failed', { values: { count: 1 } });
      } else {
        item.status = 'pending';
        decided.delete(item.id);
      }
    } catch (error) {
      message = failure(error);
    } finally {
      busy = false;
      onChange();
    }
  };

  /** an accepted card taken back: the change undone, and the card waiting again, as before it was accepted */
  const undo = async (item: Suggestion) => {
    busy = true;
    message = undefined;
    try {
      const result = await curator.undo([item.id], true);
      const problem = result.conflicts[0] ?? result.failed?.[0];
      if (result.reopened?.includes(item.id)) {
        item.status = 'pending';
        decided.delete(item.id);
      } else if (result.undone.includes(item.id)) {
        item.status = 'undone';
      } else if (problem) {
        message = $t('ai_inbox_conflict', { values: { reason: problem.reason } });
      }
    } catch (error) {
      message = failure(error);
    } finally {
      busy = false;
      onChange();
    }
  };

  /** U: the last word on a card taken back, whatever it was */
  const takeBack = (item: Suggestion) => {
    if (trashed.has(item.id)) {
      void untrash(item);
    } else if (item.status === 'applied') {
      void undo(item);
    } else if (item.status === 'rejected') {
      void putBack(item);
    } else {
      return false;
    }
    return true;
  };

  const setFilter = async (next: Filter) => {
    filter = next;
    bulk = undefined;
    await load();
  };

  // The keys, heard on the window so the list itself needs no handler: on the card that has the focus (the card, or a
  // button or photo in it), and J or K with nothing in particular focused starts on the first card, so the keys work as
  // soon as the page is there. A field keeps its keys, and review mode has its own.
  const onWindowKeydown = (event: KeyboardEvent) => {
    if (reviewing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const card = focused?.closest<HTMLElement>('.item-row');
    const index = card ? rows.indexOf(card) : -1;
    if (index < 0) {
      if ((key === 'j' || key === 'k') && (!focused || focused === document.body)) {
        rows[0]?.focus();
        event.preventDefault();
      }
      return;
    }
    const item = items[index];
    const move = (to: number) => rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
    // a held A, R, D or U acts once: the next card moves up into this place, and a repeat would decide it too (J, K
    // and the arrows keep repeating, moving on)
    const open = item && item.status === 'pending' && !deciding.has(item.id) && !busy && !event.repeat;
    if (key === 'j' || key === 'ArrowDown') {
      move(index + 1);
    } else if (key === 'k' || key === 'ArrowUp') {
      move(index - 1);
    } else if (open && key === 'a') {
      void decide(item, 'accept');
      void tick().then(() => move(index)); // the next row has moved up into this place
    } else if (open && (key === 'r' || key === 'x')) {
      void decide(item, 'reject');
      void tick().then(() => move(index));
    } else if (open && key === 'd' && deletable(item)) {
      void trash(item);
      void tick().then(() => move(index));
    } else if (!(item && key === 'u' && !busy && !event.repeat && takeBack(item))) {
      return;
    }
    event.preventDefault();
  };

  const confidence = (value: number) => Math.round(value * 100);

  onMount(() => {
    void load();
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="group-head">
  <a class="ws-inbox-link back" href="?"><Icon icon={mdiArrowLeft} size="16" />{$t('back')}</a>
  {#if words}
    <h2 class="group-title" id="group-title">{words.title}</h2>
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
      <!-- the way the owner chose to lead: each card seen large, one at a time -->
      <button type="button" class="ws-btn" disabled={busy} onclick={() => (reviewing = true)}>
        {$t('ai_inbox_review')}
      </button>
    {/if}
  </div>
  {#if filter === 'pending' && remaining > 1 && !bulk}
    <!-- the whole kind at once comes second: each way names what it does, and says before the click what follows -->
    <div class="group-bulk">
      <button
        type="button"
        class="group-bulk-action"
        disabled={busy}
        aria-describedby="group-accept-all-hint"
        onclick={() => decideAll('accept')}
      >
        {$t(action.all, { values: { count: remaining } })}
      </button>
      <p class="group-hint" id="group-accept-all-hint">
        {$t('ai_inbox_accept_all_hint', { values: { backup: remaining > SYNC_LIMIT ? 'yes' : 'no' } })}
      </p>
      <button
        type="button"
        class="group-bulk-action"
        disabled={busy}
        aria-describedby="group-reject-all-hint"
        onclick={() => decideAll('reject')}
      >
        {$t('ai_inbox_reject_all', { values: { count: remaining } })}
      </button>
      <p class="group-hint" id="group-reject-all-hint">{$t('ai_inbox_reject_all_hint')}</p>
    </div>
  {/if}
  {#if working}
    <div class="group-working" role="status">
      <span class="ws-inbox-meta">{working.note}</span>
      <div class="ws-meter"><span style:width="{(working.done / Math.max(1, working.total)) * 100}%"></span></div>
    </div>
  {/if}
  {#if bulk}
    <!-- the receipt: what was done, in the kind's words, and the one way to take exactly that back -->
    <p class="group-message" role="status">
      <span>
        {bulk.decision === 'accept'
          ? $t(action.done, { values: { count: bulk.done } })
          : $t('ai_inbox_rejected_all', { values: { count: bulk.done } })}
      </span>
      {#if bulk.failed > 0}
        <span>{$t('ai_inbox_some_failed', { values: { count: bulk.failed } })}</span>
      {/if}
      <button type="button" class="ws-btn-quiet group-undo" disabled={busy} onclick={undoAll}>
        {$t('ai_inbox_undo_all')}
      </button>
    </p>
  {/if}
  {#if message}
    <p class="group-message" role="status">{message}</p>
  {/if}
  {#if items.length > 0}
    <p class="ws-inbox-meta group-keys" id="group-keys">
      {$t(anyDeletable ? 'ai_inbox_keys_trash' : 'ai_inbox_keys', { values: { accept: $t(action.button) } })}
    </p>
  {/if}
</div>

{#if pages.length > 0 && items.length === 0}
  <p class="ws-inbox-row-body group-empty">{$t('ai_inbox_group_empty')}</p>
{/if}

<!-- a list of articles, each named by its title; the keys are the window's (onWindowKeydown) -->
<ul
  class="ws-inbox-rows"
  aria-labelledby={words ? 'group-title' : undefined}
  aria-describedby={items.length > 0 ? 'group-keys' : undefined}
>
  {#each items as item, index (item.id)}
    <li animate:flip={{ duration: 180 }}>
      <article
        class="ws-inbox-row item-row"
        tabindex="-1"
        aria-labelledby="item-{item.id}-title"
        data-status={item.status}
        data-deciding={deciding.has(item.id) || undefined}
        bind:this={rows[index]}
      >
        <SuggestionVisual suggestion={item} />
        <div class="item-text">
          <h3 class="ws-inbox-row-title item-title" id="item-{item.id}-title">{item.title}</h3>
          {#if item.detail}
            <p class="ws-inbox-row-body">{item.detail}</p>
          {/if}
          {#if item.story}
            <StoryText story={item.story} kind={item.kind} clamp />
          {/if}
          {#if item.error}
            <span class="ws-inbox-meta">{item.error}</span>
          {:else if item.confidence !== null && !quietConfidence}
            <span class="ws-inbox-meta">
              {$t('ai_inbox_confidence', { values: { percent: confidence(item.confidence) } })}
            </span>
          {/if}
          <!-- the decision sits under the words it decides, beside the photos -->
          <div class="item-actions">
            {#if item.status === 'pending'}
              <button
                type="button"
                class="ws-btn"
                aria-keyshortcuts="A"
                disabled={busy || deciding.has(item.id)}
                onclick={() => decide(item, 'accept')}
              >
                {$t(cardAction(item).button)}
              </button>
              <button
                type="button"
                class="ws-btn-quiet"
                aria-keyshortcuts="R"
                disabled={busy || deciding.has(item.id)}
                onclick={() => decide(item, 'reject')}
              >
                {$t('ai_inbox_reject')}
              </button>
              {#if deletable(item)}
                <!-- the photo goes to the Trash: the danger role, not Reject's look -->
                <button
                  type="button"
                  class="ws-btn-quiet item-delete"
                  aria-keyshortcuts="D"
                  disabled={busy || deciding.has(item.id)}
                  onclick={() => trash(item)}
                >
                  {$t('delete')}
                </button>
              {/if}
            {:else if trashed.has(item.id)}
              <span class="ws-inbox-meta">{$t('moved_to_trash')}</span>
              <button
                type="button"
                class="ws-btn-quiet"
                aria-keyshortcuts="U"
                disabled={busy}
                onclick={() => untrash(item)}
              >
                {$t('undo')}
              </button>
            {:else}
              <span class="ws-inbox-meta">{$t(STATUS_LABEL[item.status])}</span>
              {#if item.status === 'applied'}
                <button
                  type="button"
                  class="ws-btn-quiet"
                  aria-keyshortcuts="U"
                  disabled={busy}
                  onclick={() => undo(item)}
                >
                  {$t('undo')}
                </button>
              {:else if item.status === 'rejected'}
                <button
                  type="button"
                  class="ws-btn-quiet"
                  aria-keyshortcuts="U"
                  disabled={busy}
                  onclick={() => putBack(item)}
                >
                  {$t('ai_inbox_put_back')}
                </button>
              {/if}
            {/if}
          </div>
        </div>
      </article>
    </li>
  {/each}
</ul>

{#if reviewing && words}
  <ReviewMode {keys} title={words.title} {action} onClose={closeReview} />
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
  /* the review follows its filters, near the words and photos it decides, not at a wide screen's far edge */
  .group-bar :global(.ws-seg) {
    margin-inline-start: 0;
    margin-inline-end: 0.75rem;
  }
  /* the whole kind at once: each button framed by a hairline (second to the ink of Review one by one), what it does
     beside it in muted meta, one row each */
  .group-bulk {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    justify-items: start;
    gap: 0.5rem 1rem;
    margin-top: 0.25rem;
  }
  .group-bulk-action {
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    color: var(--immich-ui-dark);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    white-space: nowrap;
  }
  .group-bulk-action:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 7%, transparent);
  }
  .group-bulk-action:disabled {
    opacity: 0.45;
    pointer-events: none;
  }
  .group-bulk-action:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }
  .group-hint {
    max-width: 62ch;
    font-size: var(--ws-text-meta);
    line-height: 1.45;
    color: var(--immich-ui-muted);
  }
  /* the keys are for a keyboard: a touch screen has none to press (as the Adjust panel's help line) */
  @media (pointer: coarse) {
    .group-keys {
      display: none;
    }
  }
  .group-working {
    display: grid;
    gap: 0.4rem;
    max-width: 36rem;
  }
  .group-message {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    max-width: 62ch;
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .group-undo {
    margin-inline-start: -0.6rem;
  }
  .group-empty {
    padding: 2rem 0;
  }
  .item-row {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }
  /* a card set aside steps back, its photos and words; what takes it back (Put back) stays legible */
  .item-row[data-deciding],
  .item-row:is([data-status='rejected'], [data-status='undone'], [data-status='superseded']) > :not(.item-text),
  .item-row:is([data-status='rejected'], [data-status='undone'], [data-status='superseded'])
    .item-text
    > :not(.item-actions) {
    opacity: 0.55;
  }
  .item-text {
    display: grid;
    gap: 0.3rem;
    align-content: start;
  }
  .item-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.35rem;
  }
  /* Delete sends the photo to Gallery's Trash: the danger role's words, inverted in it when pointed at, as a menu's
     destructive row is */
  .item-delete {
    color: var(--ws-danger);
  }
  .item-delete:hover {
    background: var(--ws-danger);
    color: var(--immich-ui-light);
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
