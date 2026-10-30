<script lang="ts">
  // Local Omarchy layer: On the page, in Coming up (gallery/series): what went out to the family page, newest first, a
  // row each on the ground as the family has it: the day it went out, the title and the line, the cover (Gallery's
  // thumbnail with the owner's session). Take off the page takes one off the page and out of its link at once, which
  // the page asks about first; one taken off says so, with Put back. Each button is described by the memory's title.
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import type { SentMemory } from './series-api';

  type Props = {
    memories: SentMemory[];
    /** a day in words: "Today", "Yesterday", "Sun, Nov 1" */
    dayWords: (day: string) => string;
    /** something is under way for this memory: its button waits */
    isBusy: (key: string) => boolean;
    onTakeOff: (memory: SentMemory) => void;
    onPutBack: (memory: SentMemory) => void;
    language?: string;
  };

  let { memories, dayWords, isBusy, onTakeOff, onPutBack, language }: Props = $props();

  const id = $props.id();
  const onPage = $derived(memories.filter(({ state }) => state === 'sent').length);
</script>

<section class="ws-sharing-section" aria-labelledby="{id}-heading" data-testid="series-sent">
  <h2 class="ws-sharing-heading" id="{id}-heading">
    {$t('memory_series_on_the_page')}
    <span class="ws-inbox-meta">{onPage.toLocaleString(language)}</span>
  </h2>
  <ul class="series-sent">
    {#each memories as memory, index (memory.key)}
      {@const off = memory.state === 'withdrawn'}
      <li
        class="series-sent-memory"
        data-testid="series-sent-memory"
        data-key={memory.key}
        data-off={off || undefined}
        aria-busy={isBusy(memory.key) || undefined}
      >
        {#if memory.cover}
          <img
            class="series-sent-cover"
            src={getAssetMediaUrl({ id: memory.cover, size: AssetMediaSize.Thumbnail })}
            alt=""
            loading="lazy"
            draggable="false"
          />
        {:else}
          <span class="series-sent-cover" aria-hidden="true"></span>
        {/if}
        <div class="series-sent-words">
          <p class="series-sent-when" data-testid="series-sent-when">{dayWords(memory.day)}</p>
          <h3 class="series-sent-title" id="{id}-memory-{index}">{memory.title}</h3>
          {#if memory.line}
            <p class="series-sent-line">{memory.line}</p>
          {/if}
        </div>
        <div class="series-sent-actions">
          {#if off}
            <span class="series-sent-off" data-testid="series-sent-off">{$t('memory_series_taken_off')}</span>
            <button
              type="button"
              class="ws-btn-quiet"
              disabled={isBusy(memory.key)}
              aria-describedby="{id}-memory-{index}"
              onclick={() => onPutBack(memory)}
            >
              {$t('memory_series_restore')}
            </button>
          {:else}
            <button
              type="button"
              class="ws-btn-quiet"
              disabled={isBusy(memory.key)}
              aria-describedby="{id}-memory-{index}"
              onclick={() => onTakeOff(memory)}
            >
              {$t('memory_series_take_off')}
            </button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .series-sent {
    list-style: none;
  }
  /* a row on the ground, split from the next by a hairline edge to edge: the cover, the words, the action at the end */
  .series-sent-memory {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.75rem 0;
  }
  .series-sent-memory + .series-sent-memory {
    border-top: 1px solid var(--ws-hairline);
  }
  .series-sent-cover {
    display: block;
    width: 3.5rem;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--ws-radius);
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  /* one taken off stands back: its cover and words faded, its state in words beside Put back */
  .series-sent-memory[data-off] :is(.series-sent-cover, .series-sent-words) {
    opacity: 0.5;
  }
  .series-sent-words {
    min-width: 0;
  }
  .series-sent-when,
  .series-sent-line {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .series-sent-title {
    font-size: var(--ws-text-body);
    font-weight: 600;
    text-wrap: balance;
  }
  .series-sent-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem 0.5rem;
  }
  .series-sent-off {
    font-size: var(--ws-text-meta);
    color: var(--immich-ui-muted);
  }
  @media (max-width: 640px) {
    .series-sent-memory {
      grid-template-columns: 3.5rem minmax(0, 1fr);
    }
    .series-sent-actions {
      grid-column: 2;
      justify-content: flex-start;
      margin-inline-start: -0.6rem;
    }
  }
</style>
