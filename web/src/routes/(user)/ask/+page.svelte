<script lang="ts">
  // Local Omarchy layer: Ask. A question about the library ("when were we last in Bali?", "Mamma at christmas"),
  // answered by Curator (~/code/curator, curator/ask.py) with Gallery's own searches and the local models' captions
  // and transcripts: a one-line answer when the question wants one, what was searched for, and the photos. Reached
  // from the Ctrl+K palette's Ask mode.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { curator, CuratorError, type AskResult } from '$lib/utils/curator';
  import { AssetMediaSize } from '@immich/sdk';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const question = $derived(page.url.searchParams.get('q')?.trim() ?? '');
  let draft = $state('');
  let result = $state<AskResult>();
  let failure = $state<CuratorError>();
  let busy = $state(false);

  $effect(() => {
    draft = question;
    if (!question) {
      result = undefined;
      return;
    }
    busy = true;
    failure = undefined;
    const asked = question;
    curator
      .ask(asked, 120)
      .then((answer) => {
        if (asked === question) {
          result = answer;
        }
      })
      .catch((error: unknown) => {
        failure = error instanceof CuratorError ? error : new CuratorError(String(error), 0);
      })
      .finally(() => (busy = false));
  });

  // the language model loads while the question is typed (Curator skips this while the GPU is busy)
  onMount(() => void curator.warmAsk().catch(() => undefined));

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (next && next !== question) {
      void goto(`?q=${encodeURIComponent(next)}`, { keepFocus: true });
    }
  };

  const monthDay = (value: string) =>
    new Date(`2001-${value}T12:00:00`).toLocaleDateString($locale ?? undefined, { day: 'numeric', month: 'short' });
  const day = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString($locale ?? undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  /** What the question was read as, in short data chips. */
  const searched = $derived.by(() => {
    const plan = result?.plan as Record<string, unknown> | undefined;
    if (!plan) {
      return [];
    }
    const chips: string[] = [];
    for (const name of (plan.people as string[] | undefined) ?? []) {
      chips.push(name);
    }
    for (const place of (plan.places as string[] | undefined) ?? []) {
      chips.push(place);
    }
    const from = plan.date_from as string | null;
    const to = plan.date_to as string | null;
    if (from || to) {
      chips.push(from && to ? `${day(from)} – ${day(to)}` : day((from ?? to)!));
    }
    const recurring = plan.recurring as { from: string; to: string } | null;
    if (recurring) {
      chips.push($t('ask_every_year', { values: { from: monthDay(recurring.from), to: monthDay(recurring.to) } }));
    }
    if (plan.media === 'VIDEO') {
      chips.push($t('videos'));
    }
    if (plan.favorites) {
      chips.push($t('favorites'));
    }
    if (plan.visual) {
      chips.push(`“${plan.visual as string}”`);
    }
    if (plan.text) {
      chips.push($t('ask_mentions', { values: { text: plan.text as string } }));
    }
    return chips;
  });

  const thumbnail = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
</script>

<!-- Local Omarchy layer: the poster heads the page; on a phone its name is the bar's (UserPageLayout titleInBody) -->
<UserPageLayout title={data.meta.title} titleInBody>
  <div class="ws-inbox">
    <header class="ws-inbox-head">
      <h1 class="ws-inbox-title">{data.meta.title}</h1>
      {#if result && !busy}
        <span class="ws-inbox-count">
          {$t('ask_found', { values: { count: result.total } })} · {result.source === 'llm'
            ? $t('ask_by_model')
            : $t('ask_by_rules')}
        </span>
      {/if}
    </header>

    <form class="ask-form" onsubmit={submit}>
      <input
        class="ask-input"
        type="search"
        bind:value={draft}
        placeholder={$t('cmdk_ask_placeholder')}
        aria-label={data.meta.title}
        maxlength="500"
      />
      <button type="submit" class="ws-btn" disabled={busy || !draft.trim()}>{$t('ask_submit')}</button>
    </form>

    {#if failure}
      <div class="ws-empty">
        <h2 class="ws-empty-title">{failure.status === 0 ? $t('ai_inbox_offline_title') : failure.message}</h2>
        {#if failure.status === 0}
          <p class="ws-empty-body">{$t('ai_inbox_offline_body')}</p>
        {/if}
      </div>
    {:else if result}
      {#if result.answer}
        <p class="ask-answer">{result.answer}</p>
      {/if}
      {#if searched.length > 0}
        <ul class="ask-chips" aria-label={$t('ask_searched')}>
          {#each searched as chip (chip)}
            <li>{chip}</li>
          {/each}
        </ul>
      {/if}
      {#if result.unused.length > 0}
        <p class="ws-inbox-row-body">{$t('ask_not_known', { values: { names: result.unused.join(', ') } })}</p>
      {/if}

      {#if result.assets.length === 0}
        <div class="ws-empty ask-empty">
          <h2 class="ws-empty-title">{$t('ask_nothing')}</h2>
          <p class="ws-empty-body">{$t('ask_nothing_hint')}</p>
        </div>
      {:else}
        <ul class="ask-grid">
          {#each result.assets as asset (asset.id)}
            <li>
              <a class="ask-tile" href="/photos/{asset.id}">
                <img src={thumbnail(asset.id)} alt="" loading="lazy" />
                <span class="ws-inbox-meta">
                  {day(asset.localDateTime.slice(0, 10))}{asset.exifInfo?.city ? ` · ${asset.exifInfo.city}` : ''}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</UserPageLayout>

<style>
  .ask-form {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    padding: 1.25rem 0 0.5rem;
    max-width: 48rem;
  }
  .ask-input {
    flex: 1;
    min-width: 0;
    padding: 0.65rem 0.9rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    background: transparent;
    color: var(--immich-ui-dark);
    font-size: 1.05rem;
  }
  .ask-input::placeholder {
    color: var(--immich-ui-muted);
  }
  .ask-input:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .ask-answer {
    margin-top: 1.25rem;
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem);
    font-weight: 750;
    font-variation-settings:
      'wdth' 80,
      'opsz' 72;
    letter-spacing: -0.03em;
    line-height: 1.05;
    text-wrap: balance;
    color: var(--immich-ui-dark);
  }
  .ask-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 1rem 0 0.75rem;
    list-style: none;
  }
  .ask-chips li {
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--ws-hairline);
    border-radius: var(--ws-radius);
    font-family: var(--ws-font-data);
    font-size: 12px;
    font-weight: 600;
    color: var(--immich-ui-muted);
  }
  .ask-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
    gap: var(--ws-gap);
    margin-top: 1rem;
    list-style: none;
  }
  .ask-tile {
    display: grid;
    gap: 0.35rem;
    border-radius: var(--ws-radius);
  }
  .ask-tile img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .ask-tile:hover img,
  .ask-tile:focus-visible img {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .ask-tile:focus-visible {
    outline: none;
  }
  .ask-empty {
    margin-top: 3rem;
  }
</style>
