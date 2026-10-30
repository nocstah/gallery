<script lang="ts">
  // Local Omarchy layer: Swap a photo, for one day of Coming up (gallery/series). First the photo to take out, from the
  // memory's own in film order; then the one to put in, from the event's other photos Curator would take (its
  // candidates, in time order, without the ones the memory already holds). Swap asks Curator, which keeps the memory as
  // the owner set it and answers with it; the sheet closes with it, and the row shows it. Nothing changes on Cancel.
  import { Button, HStack, Modal, ModalBody, ModalFooter } from '@immich/ui';
  import { mdiSwapHorizontal } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import SeriesTile from './SeriesTile.svelte';
  import { seriesApi, seriesFailure, type ComingMemory, type SeriesCandidate } from './series-api';

  type Props = {
    seriesId: number;
    memory: ComingMemory;
    /** the memory as the swap left it; nothing when nothing was swapped */
    onClose: (memory?: ComingMemory) => void;
  };

  let { seriesId, memory, onClose }: Props = $props();

  let out = $state<string>();
  let into = $state<string>();
  let candidates = $state<SeriesCandidate[]>();
  let failed = $state<string>();
  let swapping = $state(false);
  const choices = $derived(candidates?.filter(({ picked }) => !picked) ?? []);

  onMount(async () => {
    try {
      ({ photos: candidates } = await seriesApi.candidates(seriesId, memory.key));
    } catch (error) {
      failed = seriesFailure(error);
    }
  });

  const swap = async () => {
    if (!out || !into || swapping) {
      return;
    }
    swapping = true;
    failed = undefined;
    try {
      const swapped = await seriesApi.swap(seriesId, memory.key, out, into);
      onClose(swapped.memory);
    } catch (error) {
      failed = seriesFailure(error);
      swapping = false;
    }
  };
</script>

<Modal title={$t('memory_series_swap')} icon={mdiSwapHorizontal} onClose={() => onClose()} size="large">
  <ModalBody>
    <div class="series-swap" data-testid="series-swap">
      <section aria-labelledby="series-swap-out">
        <h3 class="series-swap-step" id="series-swap-out">{$t('memory_series_swap_out')}</h3>
        <ul class="series-swap-grid" data-testid="series-swap-out">
          {#each memory.photos as photo, index (photo.id)}
            <li>
              <button
                type="button"
                class="series-swap-pick"
                aria-pressed={out === photo.id}
                onclick={() => (out = photo.id)}
              >
                <SeriesTile {photo} {index} cover={photo.id === memory.cover} />
              </button>
            </li>
          {/each}
        </ul>
      </section>

      {#if out}
        <section aria-labelledby="series-swap-in">
          <h3 class="series-swap-step" id="series-swap-in">{$t('memory_series_swap_in')}</h3>
          {#if candidates === undefined}
            {#if !failed}
              <p class="series-swap-quiet" role="status">{$t('loading')}</p>
            {/if}
          {:else if choices.length === 0}
            <p class="series-swap-quiet">{$t('memory_series_swap_none')}</p>
          {:else}
            <ul class="series-swap-grid" data-testid="series-swap-in">
              {#each choices as photo, index (photo.id)}
                <li>
                  <button
                    type="button"
                    class="series-swap-pick"
                    aria-pressed={into === photo.id}
                    onclick={() => (into = photo.id)}
                  >
                    <SeriesTile {photo} {index} />
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      {#if failed}
        <p class="series-swap-failed" role="alert">{failed}</p>
      {/if}
    </div>
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={() => onClose()}>{$t('cancel')}</Button>
      <Button
        shape="round"
        fullWidth
        disabled={!out || !into || swapping}
        onclick={swap}
        data-testid="series-swap-confirm"
      >
        {$t('memory_series_swap_confirm')}
      </Button>
    </HStack>
  </ModalFooter>
</Modal>

<style>
  .series-swap {
    display: grid;
    gap: 1.25rem;
  }
  .series-swap-step {
    margin-bottom: 0.6rem;
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .series-swap-grid {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--ws-gap) * 0.5);
    list-style: none;
  }
  .series-swap-pick {
    position: relative;
    display: block;
    border-radius: var(--ws-radius);
  }
  /* the one chosen is inverted round its edge, as a chosen mode is; the pointer and the keys draw the accent */
  .series-swap-pick::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }
  .series-swap-pick[aria-pressed='true']::after {
    box-shadow:
      inset 0 0 0 calc(var(--ws-border) + 1px) var(--immich-ui-dark),
      inset 0 0 0 calc(var(--ws-border) + 3px) var(--immich-ui-light);
  }
  .series-swap-pick:hover::after {
    box-shadow: inset 0 0 0 var(--ws-border) var(--ws-accent);
  }
  .series-swap-pick:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .series-swap-quiet {
    font-size: var(--ws-text-ui);
    color: var(--immich-ui-muted);
  }
  .series-swap-failed {
    font-size: var(--ws-text-ui);
    font-weight: 500;
    color: var(--ws-danger);
  }
</style>
