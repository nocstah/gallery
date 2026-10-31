<script lang="ts">
  // Local Omarchy layer: "From the beginning", the owner's series of "A memory a day" (gallery/series), the oldest first.
  // Each card says what the series is made from (the whole library, or its album by name: the owner's alone, never on
  // the family page), its span, where it stands, the days its plan still holds and its family link, with its album's
  // note when its smart rule stopped or Gallery no longer has it, and the family page's title when the owner gave it
  // one; the card opens the series' own page. New series (in the bar, and the empty state's one step) asks what it is
  // made from (SeriesNewSheet) and opens the series Curator answers with, new or the album's own. Curator not
  // answering, or not the owner's, is the page's own state, as on a series' page.
  import { goto } from '$app/navigation';
  import PanelStatus from '$lib/components/curator/PanelStatus.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { Button, modalManager } from '@immich/ui';
  import { mdiPlus } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import SeriesFailed from './SeriesFailed.svelte';
  import SeriesNewSheet from './SeriesNewSheet.svelte';
  import { albumNote, daysLeftWords, linkWords, publicTitle, sourceName, spanWords, statusWords } from './series-cards';
  import { SeriesListState } from './series-list.svelte';
  import { seriesRoute } from './series-route';

  type Props = { title: string };

  let { title }: Props = $props();

  const view = new SeriesListState();
  let opening = $state(false);

  onMount(() => {
    void view.load();
    return () => view.close();
  });

  const newSeries = async () => {
    if (opening) {
      return;
    }
    opening = true;
    try {
      const seriesId = await modalManager.show(SeriesNewSheet, { series: view.cards ?? [] });
      if (seriesId !== undefined) {
        await goto(seriesRoute(seriesId));
      }
    } finally {
      opening = false;
    }
  };
</script>

{#snippet buttons()}
  {#if view.cards && view.cards.length > 0}
    <Button
      leadingIcon={mdiPlus}
      variant="ghost"
      size="small"
      color="secondary"
      disabled={opening}
      onclick={newSeries}
      data-testid="series-new"
    >
      <span class="ws-action-label">{$t('memory_series_new')}</span>
    </Button>
  {/if}
{/snippet}

<UserPageLayout {title} {buttons}>
  <div class="ws-sharing series-list" data-testid="series-list">
    {#if view.failure}
      <SeriesFailed failure={view.failure} onRetry={() => view.load()} />
    {:else if !view.cards}
      <PanelStatus waiting={$t('memory_series_loading')} onRetry={() => view.load()} />
    {:else if view.cards.length === 0}
      <div class="ws-empty" data-testid="series-empty">
        <h2 class="ws-empty-title">{$t('memory_series_empty_title')}</h2>
        <p class="ws-empty-body">{$t('memory_series_empty_body')}</p>
        <div class="ws-empty-actions">
          <button type="button" class="ws-empty-action" disabled={opening} onclick={newSeries}>
            {$t('memory_series_new')}
          </button>
        </div>
      </div>
    {:else}
      <p class="series-list-about">{$t('memory_series_list_about')}</p>
      <ul class="ws-inbox-rows series-cards">
        {#each view.cards as card (card.id)}
          {@const span = spanWords(card, $t, $locale)}
          {@const days = daysLeftWords(card, $t)}
          {@const note = albumNote(card, $t)}
          {@const shown = publicTitle(card, $t)}
          <li>
            <a
              class="ws-inbox-row series-card"
              href={seriesRoute(card.id)}
              data-testid="series-card"
              data-status={card.status}
            >
              <span class="ws-inbox-row-title">{sourceName(card, $t)}</span>
              <span class="series-card-facts">
                <span class="series-card-status" data-testid="series-card-status">
                  {statusWords(card, $t, $locale)}
                </span>
                {#if days}
                  <span data-testid="series-card-days">{days}</span>
                {/if}
                <span data-testid="series-card-link">{linkWords(card, $t)}</span>
                {#if span}
                  <span class="ws-inbox-meta" data-testid="series-card-span">{span}</span>
                {/if}
              </span>
              {#if note || shown}
                <span class="series-card-notes">
                  {#if shown}
                    <span data-testid="series-card-title">{shown}</span>
                  {/if}
                  {#if note}
                    <span data-testid="series-card-note">{note}</span>
                  {/if}
                </span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</UserPageLayout>

<style>
  .series-list-about {
    max-width: 62ch;
    margin-bottom: 1rem;
    font-size: var(--ws-text-body);
    line-height: 1.5;
    color: var(--immich-ui-muted);
  }
  /* a series is a row on the ground, split from the next by a hairline edge to edge (the inbox's rows): what it is made
     from, then where it stands at the ui size, its days and its link in muted words, its span in data type, and its
     notes in muted meta; the pointer and the keys underline its name in the accent, as a quiet link's */
  .series-card {
    gap: 0.3rem;
    color: var(--immich-ui-dark);
  }
  .series-card .ws-inbox-row-title {
    overflow-wrap: anywhere;
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 0.25em;
  }
  .series-card:hover .ws-inbox-row-title,
  .series-card:focus-visible .ws-inbox-row-title {
    text-decoration-color: var(--ws-accent);
  }
  .series-card-facts,
  .series-card-notes {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 1.25rem;
    font-size: var(--ws-text-ui);
    color: var(--immich-ui-muted);
  }
  .series-card-status {
    font-weight: 500;
    color: var(--immich-ui-dark);
  }
  .series-card-notes {
    font-size: var(--ws-text-meta);
  }
</style>
