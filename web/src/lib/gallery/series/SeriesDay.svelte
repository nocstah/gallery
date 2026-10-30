<script lang="ts">
  // Local Omarchy layer: one day in Coming up (gallery/series): the day, the memory's title and line as the family will
  // see them, its photos in film order, the song, what changed since it was prepared, and what the owner can do with it.
  // Each button is described by the memory's title, so a screen reader hears which day it is about.
  import { joinNames } from '$lib/utils/memory-title';
  import { Icon } from '@immich/ui';
  import { mdiMusicNote, mdiPlay } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import SeriesTile from './SeriesTile.svelte';
  import type { ComingMemory } from './series-api';

  type Props = {
    memory: ComingMemory;
    /** its day in words: "Tomorrow", "Sun, Nov 1" */
    day: string;
    language?: string;
    /** something is under way for it: its buttons wait */
    busy?: boolean;
    onPlay: () => void;
    onSwap: () => void;
    onRepick: () => void;
    onSkip: () => void;
  };

  let { memory, day, language, busy = false, onPlay, onSwap, onRepick, onSkip }: Props = $props();

  const id = $props.id();
  // "title · artist", each song the film plays, in the reader's own "and"
  const song = $derived(
    memory.tracks.length > 0
      ? joinNames(
          memory.tracks.map(({ title, artist }) => (artist ? `${title} · ${artist}` : title)),
          language,
        )
      : undefined,
  );
</script>

<li class="series-day" data-testid="series-day" data-key={memory.key} aria-busy={busy || undefined}>
  <p class="series-day-when" data-testid="series-day-when">{day}</p>
  <div class="series-day-body">
    <h3 class="series-day-title" id="{id}-title">{memory.title}</h3>
    {#if memory.line}
      <p class="series-day-line" data-testid="series-day-line">{memory.line}</p>
    {/if}
    <ul class="series-strip" aria-labelledby="{id}-title">
      {#each memory.photos as photo, index (photo.id)}
        <li><SeriesTile {photo} {index} cover={photo.id === memory.cover} /></li>
      {/each}
    </ul>
    {#if song}
      <p class="series-day-song" data-testid="series-day-song">
        <Icon icon={mdiMusicNote} size="16" aria-hidden />
        <span>{song}</span>
      </p>
    {/if}
    {#if memory.picked_by === 'owner'}
      <p class="series-day-note" data-testid="series-day-owner">{$t('memory_series_owner_picked')}</p>
    {/if}
    {#if memory.note}
      <p class="series-day-note" data-testid="series-day-note">{memory.note}</p>
    {/if}
    <div class="series-day-actions">
      <button type="button" class="ws-btn" disabled={busy} aria-describedby="{id}-title" onclick={onPlay}>
        <Icon icon={mdiPlay} size="18" aria-hidden />
        {$t('memory_series_play')}
      </button>
      <button type="button" class="ws-btn-quiet" disabled={busy} aria-describedby="{id}-title" onclick={onSwap}>
        {$t('memory_series_swap')}
      </button>
      <button type="button" class="ws-btn-quiet" disabled={busy} aria-describedby="{id}-title" onclick={onRepick}>
        {$t('memory_series_repick')}
      </button>
      <button type="button" class="ws-btn-quiet" disabled={busy} aria-describedby="{id}-title" onclick={onSkip}>
        {$t('memory_series_skip')}
      </button>
    </div>
  </div>
</li>

<style>
  /* a row on the ground, split from the next by a hairline edge to edge: the day in data type beside the memory */
  .series-day {
    display: grid;
    grid-template-columns: 9rem minmax(0, 1fr);
    gap: 0.5rem 1.5rem;
    padding: 1.1rem 0;
  }
  .series-day:not(:first-child) {
    border-top: 1px solid var(--ws-hairline);
  }
  .series-day-when {
    padding-top: 0.15rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-dark);
  }
  .series-day-body {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .series-day-title {
    font-size: var(--ws-text-heading);
    font-weight: 600;
    line-height: 1.3;
    text-wrap: balance;
  }
  .series-day-line {
    margin-top: -0.35rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  /* the photos in film order, on half the gap, wrapping rather than cut */
  .series-strip {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--ws-gap) * 0.5);
    list-style: none;
  }
  .series-day-song,
  .series-day-note {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 62ch;
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  .series-day-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
    margin-top: 0.25rem;
  }
  .series-day-actions .ws-btn {
    margin-inline-end: 0.25rem;
  }
  @media (max-width: 640px) {
    .series-day {
      grid-template-columns: minmax(0, 1fr);
    }
    .series-strip {
      --series-tile: 3.5rem;
    }
  }
</style>
