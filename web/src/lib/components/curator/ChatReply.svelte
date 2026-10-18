<script lang="ts">
  // Local Omarchy layer: one answer in the library chat. The steps the model took come first, each with what it found
  // or made under it (photos, a proposed album, a reel being made), then the answer itself. While the answer streams,
  // a running step spins and one line says what the wait is: the model loading (perhaps after a night's job made way
  // for it) or the model thinking. An answer that broke off says why and offers to ask again.
  import ChatPhotos from '$lib/components/curator/ChatPhotos.svelte';
  import ChatProposal from '$lib/components/curator/ChatProposal.svelte';
  import ChatText from '$lib/components/curator/ChatText.svelte';
  import type { ChatAssistantTurn, ChatStep } from '$lib/utils/curator';
  import { Icon } from '@immich/ui';
  import { mdiAlertCircleOutline, mdiCheck, mdiLoading, mdiMinus, mdiMovieOpenOutline } from '@mdi/js';
  import { locale, t, type Translations } from 'svelte-i18n';

  interface Props {
    turn: ChatAssistantTurn;
    /** this answer is the one streaming now */
    live?: boolean;
    /** the model is loading; `making_way_for` names the background job that pauses meanwhile */
    status?: { loading: string; making_way_for: string | null } | null;
    /** asks the question before this answer again (shown on a broken-off last answer) */
    onRetry?: () => void;
  }

  let { turn, live = false, status = null, onRetry }: Props = $props();

  const TOOL_LABEL: Record<string, Translations> = {
    search_photos: 'chat_tool_search_photos',
    list_events: 'chat_tool_list_events',
    event_story: 'chat_tool_event_story',
    library_counts: 'chat_tool_library_counts',
    list_people: 'chat_tool_list_people',
    inbox: 'chat_tool_inbox',
    recent_changes: 'chat_tool_recent_changes',
    propose_album: 'chat_tool_propose_album',
    make_reel: 'chat_tool_make_reel',
  };

  const label = (step: ChatStep) => {
    const key = Object.hasOwn(TOOL_LABEL, step.tool) ? TOOL_LABEL[step.tool] : undefined;
    return key ? $t(key) : $t('chat_tool_other', { values: { tool: step.tool } });
  };

  const day = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return;
    }
    const when = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(when.getTime())
      ? undefined
      : when.toLocaleDateString($locale ?? undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const words = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const names = (value: unknown) => (Array.isArray(value) ? value.map(String).filter(Boolean) : []);

  /** What a step looked for, in short: the people, places, dates and words it was given. */
  const chips = (step: ChatStep) => {
    const args = step.args;
    const out = [...names(args.people), ...names(args.places)];
    const from = day(args.date_from);
    const to = day(args.date_to);
    if (from && to) {
      out.push(from === to ? from : `${from} – ${to}`);
    } else if (from) {
      out.push($t('chat_from', { values: { date: from } }));
    } else if (to) {
      out.push($t('chat_until', { values: { date: to } }));
    }
    if (typeof args.year === 'number') {
      out.push(String(args.year));
    }
    for (const key of ['visual', 'words', 'name']) {
      const value = words(args[key]);
      if (value) {
        out.push(`“${value}”`);
      }
    }
    const text = words(args.text);
    if (text) {
      out.push($t('ask_mentions', { values: { text } }));
    }
    if (args.kind === 'trip') {
      out.push($t('chat_kind_trip'));
    } else if (args.kind === 'event') {
      out.push($t('chat_kind_event'));
    }
    if (args.order === 'biggest') {
      out.push($t('chat_order_biggest'));
    } else if (args.order === 'oldest' || args.oldest_first === true) {
      out.push($t('chat_order_oldest'));
    }
    if (args.videos_only === true) {
      out.push($t('videos'));
    }
    if (args.favorites_only === true) {
      out.push($t('favorites'));
    }
    const by = words(args.by);
    if (by) {
      out.push($t('chat_by', { values: { by } }));
    }
    const country = words(args.country);
    if (country) {
      out.push(country);
    }
    return out;
  };

  /** What came of a step, in short: a count, a flag, or what failed. */
  const outcome = (step: ChatStep) => {
    const result = step.outcome;
    if (!result) {
      return '';
    }
    if (result.error) {
      return $t('chat_outcome_failed', { values: { message: result.error } });
    }
    switch (step.tool) {
      case 'search_photos': {
        return result.best_matches === undefined
          ? $t('chat_outcome_found', { values: { count: result.found ?? 0 } })
          : $t('chat_outcome_best', { values: { count: result.best_matches } });
      }
      case 'list_events': {
        return $t('chat_outcome_events', { values: { count: result.total ?? result.events ?? 0 } });
      }
      case 'event_story': {
        return result.story === false ? $t('chat_outcome_no_story') : '';
      }
      case 'library_counts': {
        return result.total === undefined ? '' : $t('chat_outcome_items', { values: { count: result.total } });
      }
      case 'list_people': {
        return $t('chat_outcome_people', { values: { count: result.people ?? 0 } });
      }
      case 'inbox': {
        return $t('chat_outcome_waiting', { values: { count: result.waiting ?? 0 } });
      }
      case 'recent_changes': {
        return $t('chat_outcome_changes', { values: { count: result.changes ?? 0 } });
      }
      case 'propose_album': {
        return result.proposed ? $t('chat_outcome_proposed') : $t('chat_outcome_decided_before');
      }
      case 'make_reel': {
        return result.started ? $t('chat_outcome_started') : '';
      }
      default: {
        return '';
      }
    }
  };

  const stateOf = (step: ChatStep) => {
    if (step.running && live) {
      return 'running';
    }
    if (step.outcome?.error) {
      return 'failed';
    }
    return step.outcome ? 'done' : 'cut';
  };

  const ICON = { running: mdiLoading, failed: mdiAlertCircleOutline, done: mdiCheck, cut: mdiMinus };

  const waiting = $derived.by(() => {
    if (!live) {
      return;
    }
    if (status) {
      return status.making_way_for ? $t('chat_loading_model_jobs') : $t('chat_loading_model');
    }
    if (!turn.text && !turn.error && turn.steps.every((step) => !step.running)) {
      return $t('chat_thinking');
    }
  });
</script>

<article class="chat-reply" aria-busy={live}>
  {#if turn.steps.length > 0}
    <ol class="chat-steps">
      {#each turn.steps as step, index (index)}
        {@const mark = stateOf(step)}
        {@const result = outcome(step)}
        <li class="chat-step">
          <div class="chat-step-line" data-state={mark}>
            <span class="chat-step-mark" aria-hidden="true"><Icon icon={ICON[mark]} size="14" /></span>
            <span class="chat-step-label">{label(step)}</span>
            {#each chips(step) as chip, at (at)}
              <span class="chat-chip">{chip}</span>
            {/each}
            {#if result}
              <span class="chat-step-outcome">{result}</span>
            {/if}
          </div>
          {#each turn.photos.filter((photos) => photos.step === index) as photos, at (at)}
            <ChatPhotos {photos} />
          {/each}
          {#each turn.proposals.filter((proposal) => proposal.step === index) as proposal (proposal.id)}
            <ChatProposal {proposal} />
          {/each}
          {#each turn.jobs.filter((job) => job.step === index) as job (job.id)}
            <p class="chat-job">
              <Icon icon={mdiMovieOpenOutline} size="16" />
              <span>{$t('chat_job_reel', { values: { title: job.title } })}</span>
              <a class="ws-inbox-link" href="/inbox?tab=jobs">{$t('chat_job_link')}</a>
            </p>
          {/each}
        </li>
      {/each}
    </ol>
  {/if}

  {#if waiting}
    <p class="chat-wait" role="status">
      <span class="chat-wait-mark" aria-hidden="true"><Icon icon={mdiLoading} size="16" /></span>
      {waiting}
    </p>
  {/if}

  {#if turn.text}
    <ChatText text={turn.text} />
  {/if}

  {#if turn.stopped}
    <p class="ws-inbox-meta">{$t('chat_stopped')}</p>
  {/if}

  {#if turn.error}
    <div class="chat-error" role="alert">
      <p>{$t('chat_error', { values: { message: turn.error } })}</p>
      {#if onRetry}
        <button type="button" class="ws-btn-quiet chat-retry" onclick={onRetry}>{$t('chat_try_again')}</button>
      {/if}
    </div>
  {/if}
</article>

<style>
  .chat-reply {
    display: grid;
    gap: 0.85rem;
    min-width: 0;
  }
  .chat-steps {
    display: grid;
    gap: 0.55rem;
    list-style: none;
  }
  .chat-step {
    min-width: 0;
  }
  .chat-step-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem 0.5rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .chat-step-mark {
    display: inline-grid;
    place-items: center;
    align-self: center;
  }
  .chat-step-line[data-state='running'] .chat-step-mark,
  .chat-wait-mark {
    display: inline-grid;
    animation: chat-spin 900ms linear infinite;
  }
  .chat-step-line[data-state='failed'] {
    color: var(--immich-ui-dark);
  }
  .chat-step-label {
    font-weight: 700;
    color: var(--immich-ui-dark);
  }
  .chat-chip {
    padding: 0.05rem 0.4rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .chat-step-outcome {
    font-weight: 600;
  }
  .chat-step-outcome::before {
    content: '· ';
    font-weight: 400;
  }
  .chat-job {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.6rem;
    margin-top: 0.5rem;
    font-size: var(--ws-text-ui);
    color: var(--immich-ui-dark);
  }
  .chat-wait {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--ws-text-body);
    color: var(--immich-ui-muted);
  }
  .chat-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 1rem;
    font-size: var(--ws-text-body);
    font-weight: 600;
    color: var(--immich-ui-dark);
  }
  .chat-retry {
    margin-inline-start: -0.6rem;
    text-decoration: underline;
    text-underline-offset: 0.25em;
    text-decoration-color: var(--ws-hairline);
  }
  @keyframes chat-spin {
    to {
      rotate: 1turn;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chat-step-line[data-state='running'] .chat-step-mark,
    .chat-wait-mark {
      animation: none;
    }
  }
</style>
