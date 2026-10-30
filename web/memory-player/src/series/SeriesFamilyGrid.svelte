<script lang="ts">
  // Local Omarchy layer: All photos on the family page (series): a day's photos and clips in film order as square
  // tiles on the page's ground, two columns on a phone and columns of 15rem or more on a wider screen, as the shared
  // memory's grid; a clip's tile has its play mark. A photo opens the film from it, a clip plays whole with its sound
  // (SeriesFamilyClip). Back and Escape go back to where All photos was opened from; Play plays the day from its start.
  import type { FilmMedia } from '../../../src/lib/components/memories/film/film-media';
  import { Icon } from '@immich/ui';
  import { mdiArrowLeft, mdiPlay } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { SeriesDay } from './series-family';

  type Props = {
    day: SeriesDay;
    media: FilmMedia;
    /** on screen: false while the film is up over it */
    shown: boolean;
    /** on top: a clip over it takes the keys */
    active: boolean;
    onBack: () => void;
    onPlay: () => void;
    onOpen: (id: string) => void;
  };

  let { day, media, shown, active, onBack, onPlay, onOpen }: Props = $props();

  const onKeyDown = (event: KeyboardEvent) => {
    if (active && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      onBack();
    }
  };
</script>

<svelte:document onkeydown={onKeyDown} />

<section
  class="family-grid-page"
  hidden={!shown}
  inert={!active}
  aria-labelledby="family-grid-title"
  data-testid="series-family-grid"
>
  <header class="family-grid-head">
    <button type="button" class="memory-icon-button" aria-label={$t('back')} title={$t('back')} onclick={onBack}>
      <Icon icon={mdiArrowLeft} size="24" aria-hidden />
    </button>
    <div class="family-grid-words">
      <h1 id="family-grid-title" lang={day.language}>{day.title}</h1>
      {#if day.line}
        <p lang={day.language}>{day.line}</p>
      {/if}
    </div>
    <button type="button" class="memory-play" onclick={onPlay}>
      <Icon icon={mdiPlay} size="20" aria-hidden />
      {$t('memory_series_play')}
    </button>
  </header>
  <ul class="family-grid">
    {#each day.assets as asset, index (asset.id)}
      {@const clip = asset.type === 'VIDEO'}
      <li>
        <button
          type="button"
          aria-label={$t(clip ? 'memory_series_clip' : 'memory_series_photo', { values: { number: index + 1 } })}
          data-testid="series-family-tile"
          data-video={clip || undefined}
          onclick={() => onOpen(asset.id)}
        >
          <img src={media.preview(asset.id, asset.thumbhash)} alt="" loading="lazy" draggable="false" />
          {#if clip}
            <span class="family-grid-clip" aria-hidden="true"><Icon icon={mdiPlay} size="24" /></span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  /* a page of its own over the list, which holds still under it */
  .family-grid-page {
    position: fixed;
    inset: 0;
    z-index: 30;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      max(2rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    background: var(--public-memory-ground);
    color: var(--public-memory-ink);
  }
  .family-grid-page[hidden] {
    display: none;
  }
  .family-grid-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .family-grid-words {
    flex: 1;
    min-width: 0;
  }
  .family-grid-words h1 {
    font: 700 1.125rem / 1.25 var(--ws-font-display);
    text-wrap: balance;
  }
  .family-grid-words p {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-meta);
    font-weight: 600;
    color: var(--public-memory-muted);
  }
  .family-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
    gap: 0.5rem;
    list-style: none;
  }
  .family-grid button {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: var(--public-memory-hairline);
  }
  .family-grid img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  /* a clip's mark on the photo, on the film's glass: it sits on the picture, not on the page */
  .family-grid-clip {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    display: inline-grid;
    padding: 0.25rem;
    border-radius: var(--ws-radius);
    background: var(--ws-glass-strong);
    color: #fff;
  }
  @media (max-width: 600px) {
    .family-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .family-grid-head .memory-play {
      margin-inline-start: 3.75rem;
    }
  }
</style>
