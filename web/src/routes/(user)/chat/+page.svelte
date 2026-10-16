<script lang="ts">
  // Local Omarchy layer: Chat with the library. A conversation with Curator's local model (~/code/curator,
  // curator/chat.py), which answers from the library through tools: it searches the photos the way Ask does, reads the
  // events and trips and their stories, counts the library, looks at the AI inbox, and proposes albums or starts
  // highlight reels, which wait for a yes. Answers stream in as they are written. Curator keeps the conversations; the
  // open one rides in the URL (?id=), so a reload or the back button returns to it.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ChatReply from '$lib/components/curator/ChatReply.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import {
    chatStream,
    curator,
    CuratorError,
    type ChatAssistantTurn,
    type ChatEvent,
    type ChatSummary,
    type ChatTurn,
  } from '$lib/utils/curator';
  import { Icon } from '@immich/ui';
  import { mdiArrowUp, mdiDeleteOutline, mdiHistory, mdiPlus, mdiStop } from '@mdi/js';
  import { onMount, untrack } from 'svelte';
  import { locale, t, type Translations } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const EXAMPLES: Translations[] = [
    'chat_example_trips',
    'chat_example_beach',
    'chat_example_years',
    'chat_example_inbox',
  ];

  let turns = $state<ChatTurn[]>([]);
  let chatId = $state<string | null>(null);
  let chatTitle = $state<string | null>(null);
  let recent = $state<ChatSummary[]>([]);
  let draft = $state('');
  let streaming = $state(false);
  let status = $state<{ loading: string; making_way_for: string | null } | null>(null);
  let offline = $state(false);
  let loadingChat = $state(false);
  let confirmDelete = $state(false);
  let announcement = $state('');
  let input = $state<HTMLTextAreaElement>();
  let end = $state<HTMLElement>();
  let controller: AbortController | undefined;
  // follow the newest words only while the person is reading at the bottom
  let pinned = true;

  const requested = $derived(page.url.searchParams.get('id'));
  const last = $derived(turns.at(-1));

  const refreshRecent = () =>
    curator
      .chats()
      .then((list) => (recent = list))
      .catch(() => undefined);

  const when = (value: string) =>
    new Date(value).toLocaleString($locale ?? undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const scrollToEnd = () => {
    if (!pinned || !end) {
      return;
    }
    const scroller = end.closest<HTMLElement>('.overflow-y-auto');
    requestAnimationFrame(() => {
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      } else {
        end?.scrollIntoView?.({ block: 'end' });
      }
    });
  };

  const resize = () => {
    if (input) {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 192)}px`;
    }
  };

  const load = async (id: string) => {
    loadingChat = true;
    offline = false;
    try {
      const found = await curator.chat(id);
      if (page.url.searchParams.get('id') !== id) {
        return;
      }
      turns = found.turns;
      chatId = found.id;
      chatTitle = found.title;
      pinned = true;
      scrollToEnd();
    } catch (error) {
      if (error instanceof CuratorError && error.status === 0) {
        offline = true;
      } else {
        // gone (deleted elsewhere): a new conversation instead
        await goto(page.url.pathname, { replaceState: true, keepFocus: true, noScroll: true });
      }
    } finally {
      loadingChat = false;
    }
  };

  $effect(() => {
    const id = requested;
    untrack(() => {
      if (id === chatId || streaming) {
        return;
      }
      confirmDelete = false;
      if (id) {
        void load(id);
      } else {
        turns = [];
        chatId = null;
        chatTitle = null;
      }
    });
  });

  const handle = (event: ChatEvent, reply: ChatAssistantTurn) => {
    switch (event.type) {
      case 'chat': {
        if (chatId !== event.data.id) {
          chatId = event.data.id;
          void goto(`?id=${event.data.id}`, { replaceState: true, keepFocus: true, noScroll: true });
        }
        break;
      }
      case 'status': {
        status = event.data;
        break;
      }
      case 'step': {
        status = null;
        reply.steps[event.data.index] = { tool: event.data.tool, args: event.data.args, running: true };
        break;
      }
      case 'step_done': {
        const step = reply.steps[event.data.index];
        if (step) {
          step.outcome = event.data.outcome;
          step.running = false;
        }
        break;
      }
      case 'photos': {
        reply.photos.push(event.data);
        break;
      }
      case 'proposal': {
        reply.proposals.push(event.data);
        break;
      }
      case 'job': {
        reply.jobs.push(event.data);
        break;
      }
      case 'text': {
        status = null;
        reply.text += event.data.delta;
        break;
      }
      case 'error': {
        reply.error = event.data.message;
        break;
      }
      case 'done': {
        break;
      }
    }
    scrollToEnd();
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming) {
      return;
    }
    draft = '';
    requestAnimationFrame(resize);
    offline = false;
    confirmDelete = false;
    chatTitle ??= message.length > 80 ? `${message.slice(0, 79)}…` : message;
    turns.push(
      { role: 'user', text: message },
      { role: 'assistant', text: '', steps: [], photos: [], proposals: [], jobs: [] },
    );
    const reply = turns.at(-1) as ChatAssistantTurn;
    streaming = true;
    status = null;
    pinned = true;
    scrollToEnd();
    controller = new AbortController();
    let finished = false;
    try {
      const ended = await chatStream(
        chatId,
        message,
        (event) => {
          finished ||= event.type === 'done';
          handle(event, reply);
        },
        controller.signal,
      );
      if (ended === 'aborted') {
        reply.stopped = true;
      } else if (!finished && !reply.error) {
        reply.error = $t('chat_interrupted');
      }
    } catch (error) {
      reply.error =
        error instanceof CuratorError && error.status === 0
          ? $t('ai_inbox_offline_title')
          : error instanceof Error
            ? error.message
            : String(error);
    } finally {
      for (const step of reply.steps) {
        step.running = false;
      }
      streaming = false;
      status = null;
      controller = undefined;
      announcement = reply.error ?? reply.text;
      void refreshRecent();
      input?.focus();
    }
  };

  const stop = () => controller?.abort();

  const retry = () => {
    const question = turns.findLast((turn) => turn.role === 'user');
    if (question) {
      void send(question.text);
    }
  };

  const startNew = async () => {
    stop();
    turns = [];
    chatId = null;
    chatTitle = null;
    confirmDelete = false;
    await goto(page.url.pathname, { keepFocus: true, noScroll: true });
    input?.focus();
  };

  const open = (id: string) => {
    if (id !== chatId) {
      stop();
      void goto(`?id=${id}`, { noScroll: true });
    }
  };

  const forget = async () => {
    if (!chatId) {
      return;
    }
    try {
      await curator.forgetChat(chatId);
    } catch (error) {
      if (!(error instanceof CuratorError && error.status === 404)) {
        return;
      }
    }
    await startNew();
    void refreshRecent();
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  onMount(() => {
    // the language model loads while the question is typed (Curator makes the night's jobs wait for it)
    void curator.warmAsk().catch(() => undefined);
    void refreshRecent();
    input?.focus();
    if (!end || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => (pinned = entry?.isIntersecting ?? true), {
      rootMargin: '0px 0px 160px 0px',
    });
    observer.observe(end);
    return () => observer.disconnect();
  });
</script>

<!-- Local Omarchy layer: the poster heads the page; on a phone its name is the bar's (UserPageLayout titleInBody) -->
<UserPageLayout title={data.meta.title} titleInBody>
  <div class="ws-inbox chat">
    <header class="ws-inbox-head chat-head">
      <h1 class="ws-inbox-title">{data.meta.title}</h1>
      {#if chatTitle}
        <span class="ws-inbox-count chat-current">{chatTitle}</span>
      {/if}
      <div class="chat-head-actions">
        {#if recent.length > 0}
          <ButtonContextMenu icon={mdiHistory} title={$t('chat_earlier')} align="bottom-right" direction="left">
            {#each recent as summary (summary.id)}
              <MenuOption
                text={summary.title ?? $t('chat_untitled')}
                subtitle={when(summary.updated_at)}
                onClick={() => open(summary.id)}
              />
            {/each}
          </ButtonContextMenu>
        {/if}
        {#if chatId}
          {#if confirmDelete}
            <span class="chat-confirm">{$t('chat_delete_confirm')}</span>
            <button type="button" class="ws-btn" onclick={forget}>{$t('delete')}</button>
            <button type="button" class="ws-btn-quiet" onclick={() => (confirmDelete = false)}>{$t('cancel')}</button>
          {:else}
            <button
              type="button"
              class="ws-btn-quiet chat-icon-button"
              aria-label={$t('chat_delete')}
              title={$t('chat_delete')}
              disabled={streaming}
              onclick={() => (confirmDelete = true)}
            >
              <Icon icon={mdiDeleteOutline} size="18" />
            </button>
          {/if}
        {/if}
        {#if turns.length > 0}
          <button type="button" class="ws-btn-quiet chat-new" onclick={startNew}>
            <Icon icon={mdiPlus} size="18" />
            {$t('chat_new')}
          </button>
        {/if}
      </div>
    </header>

    <section class="chat-thread" aria-busy={loadingChat || streaming}>
      {#if offline}
        <div class="ws-empty">
          <h2 class="ws-empty-title">{$t('ai_inbox_offline_title')}</h2>
          <p class="ws-empty-body">{$t('chat_offline_body')}</p>
        </div>
      {:else if turns.length === 0 && !loadingChat}
        <div class="chat-empty">
          <h2 class="ws-empty-title">{$t('chat_empty_title')}</h2>
          <p class="ws-empty-body">{$t('chat_empty_body')}</p>
          <ul class="chat-examples">
            {#each EXAMPLES as example (example)}
              <li>
                <button type="button" class="chat-example" onclick={() => send($t(example))}>{$t(example)}</button>
              </li>
            {/each}
          </ul>
        </div>
      {:else}
        <ol class="chat-turns">
          {#each turns as turn, index (index)}
            <li class="chat-turn" data-role={turn.role}>
              {#if turn.role === 'user'}
                <p class="chat-user">{turn.text}</p>
              {:else}
                {@const live = streaming && turn === last}
                <ChatReply
                  {turn}
                  {live}
                  status={live ? status : null}
                  onRetry={turn === last && !streaming && turn.error ? retry : undefined}
                />
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
      <div class="chat-end" bind:this={end}></div>
    </section>

    <p class="sr-only" aria-live="polite">{announcement}</p>

    <form class="chat-composer" onsubmit={submit}>
      <textarea
        bind:this={input}
        bind:value={draft}
        class="chat-input"
        rows="1"
        maxlength="4000"
        placeholder={$t('chat_placeholder')}
        aria-label={$t('chat_placeholder')}
        oninput={resize}
        onkeydown={onKeydown}></textarea>
      {#if streaming}
        <button type="button" class="ws-btn-quiet chat-stop" onclick={stop}>
          <Icon icon={mdiStop} size="18" />
          {$t('chat_stop')}
        </button>
      {:else}
        <button type="submit" class="ws-btn" disabled={!draft.trim()}>
          <Icon icon={mdiArrowUp} size="18" />
          {$t('chat_send')}
        </button>
      {/if}
    </form>
  </div>
</UserPageLayout>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding-bottom: 0;
  }
  .chat-head {
    align-items: center;
  }
  .chat-current {
    min-width: 0;
    max-width: min(36rem, 100%);
    padding-bottom: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chat-head-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
    margin-inline-start: auto;
  }
  .chat-confirm {
    font-size: 0.9rem;
    font-weight: 600;
  }
  .chat-icon-button,
  .chat-new,
  .chat-stop {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .chat-thread {
    flex: 1;
    padding-top: calc(var(--ws-gap) * 2.4);
    padding-bottom: calc(var(--ws-gap) * 2);
  }
  .chat-empty {
    max-width: 40rem;
    margin-top: clamp(1.5rem, 8vh, 5rem);
  }
  .chat-examples {
    display: grid;
    gap: 0.5rem;
    margin-top: 1.75rem;
    list-style: none;
  }
  .chat-example {
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    font-size: 0.95rem;
    text-align: start;
    color: var(--immich-ui-dark);
    transition:
      border-color 120ms ease-out,
      background-color 120ms ease-out;
  }
  .chat-example:hover {
    border-color: color-mix(in oklab, var(--immich-ui-dark) 35%, transparent);
    background: color-mix(in oklab, var(--immich-ui-dark) 4%, transparent);
  }
  .chat-turns {
    display: grid;
    gap: calc(var(--ws-gap) * 2.6);
    list-style: none;
  }
  .chat-turn[data-role='user'] {
    display: flex;
    justify-content: flex-end;
  }
  .chat-user {
    max-width: min(46rem, 85%);
    padding: 0.6rem 0.9rem;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    font-size: 1rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .chat-composer {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
    padding: 0.75rem 0 calc(var(--ws-gap) * 1.6);
    border-top: 1px solid var(--ws-hairline);
    background: var(--immich-ui-light);
  }
  .chat-input {
    flex: 1;
    min-width: 0;
    max-height: 12rem;
    padding: 0.65rem 0.9rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    background: transparent;
    color: var(--immich-ui-dark);
    font-size: 1rem;
    line-height: 1.45;
    resize: none;
  }
  .chat-input::placeholder {
    color: var(--immich-ui-muted);
  }
  .chat-input:focus-visible,
  .chat-example:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  @media (max-width: 640px) {
    .chat-user {
      max-width: 92%;
    }
    .chat-composer {
      padding-bottom: 0.75rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chat-example {
      transition: none;
    }
  }
</style>
