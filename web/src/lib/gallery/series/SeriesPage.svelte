<script lang="ts">
  // Local Omarchy layer: "From the beginning", the Coming up view of "A memory a day, from the beginning" (gallery/series;
  // the design: ~/code/curator/docs/memory-series-design.md, section 3). The owner plans the series here first, then
  // looks over the coming days as the family will see them, one row a day: plays a film, swaps a photo, has Curator pick
  // again or skips the day, puts a skipped one back, and says who never goes in a memory. One quiet line says what the
  // page waits for: that nothing goes out yet, or that Curator is preparing the days, which the page then asks for again
  // every few seconds (series-state). Curator not answering, or not the owner's, is the page's own state, as the AI
  // inbox says it.
  import PanelStatus from '$lib/components/curator/PanelStatus.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { locale } from '$lib/stores/preferences.store';
  import { curatorPort } from '$lib/utils/curator';
  import { modalManager } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import SeriesDay from './SeriesDay.svelte';
  import SeriesFilm from './SeriesFilm.svelte';
  import SeriesLeaveOut from './SeriesLeaveOut.svelte';
  import SeriesSwapSheet from './SeriesSwapSheet.svelte';
  import type { ComingMemory } from './series-api';
  import { isTomorrow, seriesDate } from './series-days';
  import { SeriesPageState } from './series-state.svelte';

  type Props = { title: string };

  let { title }: Props = $props();

  const view = new SeriesPageState();
  const id = $props.id();

  onMount(() => {
    void view.load();
    return () => view.close();
  });

  const dayWords = (day: string) => (isTomorrow(day) ? $t('memory_series_tomorrow') : seriesDate(day, $locale));

  const swap = async (memory: ComingMemory) => {
    const series = view.series;
    if (!series) {
      return;
    }
    const swapped = await modalManager.show(SeriesSwapSheet, { seriesId: series.id, memory });
    if (swapped) {
      view.swapped(swapped);
    }
  };

  // Pick again drops what the owner chose, so it asks first where there is something to drop
  const repick = async (memory: ComingMemory) => {
    if (
      memory.picked_by === 'owner' &&
      !(await modalManager.showDialog({
        title: $t('memory_series_repick'),
        prompt: $t('memory_series_repick_confirm'),
        confirmText: $t('memory_series_repick'),
        confirmColor: 'primary',
      }))
    ) {
      return;
    }
    await view.repick(memory.key);
  };
</script>

<UserPageLayout {title}>
  <div class="ws-sharing series-page" data-testid="series-page">
    {#if view.failure}
      {@const offline = view.failure.status === 0}
      {@const denied = view.failure.status === 401 || view.failure.status === 403}
      <div class="ws-empty" data-testid="series-failed">
        <h2 class="ws-empty-title">
          {offline ? $t('ai_inbox_offline_title') : denied ? $t('ai_inbox_denied_title') : view.failure.message}
        </h2>
        {#if offline || denied}
          <p class="ws-empty-body">
            {offline ? $t('memory_series_offline_body', { values: { port: curatorPort() } }) : view.failure.message}
          </p>
        {/if}
        <div class="ws-empty-actions">
          <button type="button" class="ws-empty-action" onclick={() => view.load()}>{$t('retry')}</button>
        </div>
      </div>
    {:else if view.series === null}
      <div class="ws-empty" data-testid="series-empty">
        <h2 class="ws-empty-title">{$t('memory_series_empty_title')}</h2>
        <p class="ws-empty-body">{$t('memory_series_empty_body')}</p>
        <div class="ws-empty-actions">
          <button
            type="button"
            class="ws-empty-action"
            disabled={view.planning}
            data-testid="series-plan"
            onclick={() => view.plan()}
          >
            {$t('memory_series_plan')}
          </button>
        </div>
        {#if view.message}
          <p class="series-message" role="status">{view.message}</p>
        {/if}
      </div>
    {:else if !view.series || !view.coming}
      <PanelStatus waiting={$t('memory_series_loading')} onRetry={() => view.load()} />
    {:else}
      {@const coming = view.coming}
      {#if coming.provisional || coming.preparing}
        <p class="series-status" role="status" data-testid="series-status">
          {#if coming.provisional}
            <span>{$t('memory_series_provisional', { values: { date: seriesDate(coming.first_day, $locale) } })}</span>
          {/if}
          {#if coming.preparing}
            <span>{$t('memory_series_preparing')}</span>
          {/if}
        </p>
      {/if}
      {#if view.message}
        <p class="series-message" role="status" data-testid="series-message">{view.message}</p>
      {/if}

      {#if coming.memories.length > 0}
        <section class="ws-sharing-section" aria-labelledby="{id}-coming" data-testid="series-coming">
          <h2 class="ws-sharing-heading" id="{id}-coming">
            {$t('memory_series_coming_up')}
            <span class="ws-inbox-meta">{coming.memories.length.toLocaleString($locale)}</span>
          </h2>
          <ol class="series-days">
            {#each coming.memories as memory (memory.key)}
              <SeriesDay
                {memory}
                day={dayWords(memory.day)}
                language={$locale}
                busy={view.busy.has(memory.key)}
                onPlay={() => view.play(memory)}
                onSwap={() => swap(memory)}
                onRepick={() => repick(memory)}
                onSkip={() => view.skip(memory.key)}
              />
            {/each}
          </ol>
        </section>
      {/if}

      {#if coming.skipped.length > 0}
        <section class="ws-sharing-section" aria-labelledby="{id}-skipped" data-testid="series-skipped">
          <h2 class="ws-sharing-heading" id="{id}-skipped">
            {$t('memory_series_skipped')}
            <span class="ws-inbox-meta">{coming.skipped.length.toLocaleString($locale)}</span>
          </h2>
          <ul class="series-skips">
            {#each coming.skipped as memory, index (memory.key)}
              <li class="series-skip" data-testid="series-skip" data-key={memory.key}>
                <div class="series-skip-words">
                  <h3 class="series-skip-title" id="{id}-skip-{index}">{memory.title}</h3>
                  {#if memory.line}
                    <p class="series-skip-line">{memory.line}</p>
                  {/if}
                </div>
                <button
                  type="button"
                  class="ws-btn-quiet"
                  disabled={view.busy.has(memory.key)}
                  aria-describedby="{id}-skip-{index}"
                  onclick={() => view.restore(memory.key)}
                >
                  {$t('memory_series_restore')}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <SeriesLeaveOut
        ids={view.series.people_without}
        saving={view.savingPeople}
        onChange={(ids) => view.setPeopleWithout(ids)}
      />
    {/if}
  </div>
</UserPageLayout>

{#if view.film}
  {#key view.film}
    <SeriesFilm memory={view.film.memory} assets={view.film.assets} onClose={view.stopFilm} />
  {/key}
{/if}

<style>
  /* one quiet line: what the page waits for, in muted words at the ui size */
  .series-status {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    max-width: 62ch;
    margin-bottom: 1.5rem;
    font-size: var(--ws-text-ui);
    color: var(--immich-ui-muted);
  }
  .series-message {
    max-width: 62ch;
    margin-bottom: 1.5rem;
    font-size: var(--ws-text-ui);
    font-weight: 500;
  }
  .ws-empty .series-message {
    margin-top: 1.25rem;
    margin-bottom: 0;
  }
  .series-days,
  .series-skips {
    list-style: none;
  }
  .series-skip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0;
  }
  .series-skip + .series-skip {
    border-top: 1px solid var(--ws-hairline);
  }
  .series-skip-words {
    min-width: 0;
  }
  .series-skip-title {
    font-size: var(--ws-text-body);
    font-weight: 600;
  }
  .series-skip-line {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
</style>
