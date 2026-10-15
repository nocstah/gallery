<script lang="ts">
  // Local Omarchy layer: Look Up (Curator, ~/code/curator/curator/lookup.py). A card over the photo naming what in it
  // has a name, a plant, a breed, a landmark, a painting, a dish, with a sentence about each and a link to read more.
  // A small local model says it, so anything it is not sure of reads as a guess. It follows the viewer from photo to
  // photo until closed; a photo seen before answers at once.
  import { curator, type LookUpAnswer, type LookUpSubject } from '$lib/utils/curator';
  import { Icon } from '@immich/ui';
  import {
    mdiClose,
    mdiFlowerOutline,
    mdiFoodForkDrink,
    mdiImageFrame,
    mdiOpenInNew,
    mdiPaw,
    mdiPineTree,
    mdiRefresh,
    mdiShapeOutline,
    mdiTempleBuddhistOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    assetId: string;
    onClose: () => void;
  }

  let { assetId, onClose }: Props = $props();

  let answer = $state<LookUpAnswer>();
  let error = $state<string>();
  let loading = $state(false);
  let controller: AbortController | undefined;

  const ICONS: Record<LookUpSubject['kind'], string> = {
    plant: mdiFlowerOutline,
    animal: mdiPaw,
    landmark: mdiTempleBuddhistOutline,
    art: mdiImageFrame,
    food: mdiFoodForkDrink,
    nature: mdiPineTree,
    object: mdiShapeOutline,
    other: mdiShapeOutline,
  };

  const ask = async (id: string, again = false) => {
    controller?.abort();
    controller = new AbortController();
    const mine = controller;
    loading = true;
    error = undefined;
    if (!again) {
      answer = undefined;
    }
    try {
      const found = await curator.lookUp(id, again, mine.signal);
      if (!mine.signal.aborted) {
        answer = found;
      }
    } catch (failure) {
      if (!mine.signal.aborted) {
        error = failure instanceof Error ? failure.message : String(failure);
      }
    } finally {
      if (!mine.signal.aborted) {
        loading = false;
      }
    }
  };

  $effect(() => {
    void ask(assetId);
    return () => controller?.abort();
  });

  const readMore = (name: string) => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
</script>

<section class="lookup dark" aria-label={$t('look_up')} aria-live="polite">
  <header class="lookup-head">
    <span class="lookup-title">{$t('look_up')}</span>
    <button
      type="button"
      class="lookup-icon"
      disabled={loading}
      aria-label={$t('look_up_again')}
      title={$t('look_up_again')}
      onclick={() => ask(assetId, true)}
    >
      <Icon icon={mdiRefresh} size="16" />
    </button>
    <button type="button" class="lookup-icon" aria-label={$t('close')} title={$t('close')} onclick={onClose}>
      <Icon icon={mdiClose} size="16" />
    </button>
  </header>

  {#if loading && !answer}
    <p class="lookup-note"><span class="lookup-spinner" aria-hidden="true"></span>{$t('look_up_looking')}</p>
  {:else if error}
    <p class="lookup-note is-error">{error}</p>
  {:else if answer && answer.subjects.length === 0}
    <p class="lookup-note">{$t('look_up_nothing')}</p>
  {:else if answer}
    <ul class="lookup-list" class:is-stale={loading}>
      {#each answer.subjects as subject, index (index)}
        <li>
          <span class="lookup-kind"><Icon icon={ICONS[subject.kind] ?? mdiShapeOutline} size="18" /></span>
          <div class="lookup-body">
            <div class="lookup-name">
              {#if subject.sure !== 'high'}<span class="lookup-guess">{$t('look_up_looks_like')}</span>{/if}
              {subject.name}
            </div>
            <p>{subject.about}</p>
            <a href={readMore(subject.name)} target="_blank" rel="noopener noreferrer">
              {$t('look_up_read_more')}
              <Icon icon={mdiOpenInNew} size="12" />
            </a>
          </div>
        </li>
      {/each}
    </ul>
    <p class="lookup-foot">{$t('look_up_model', { values: { model: answer.model } })}</p>
  {/if}
</section>

<style>
  .lookup {
    position: absolute;
    /* top left, under the viewer's bar: the bottom holds a stack's strip and the text-in-photo button */
    inset-inline-start: 1.5rem;
    top: 4.75rem;
    z-index: 2;
    width: min(22rem, calc(100% - 3rem));
    max-height: calc(100% - 11rem);
    overflow-y: auto;
    padding: 0.75rem 0.85rem 0.7rem;
    border: 1px solid var(--ws-glass-edge);
    border-radius: 16px;
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    color: rgb(255 255 255 / 0.92);
    font-size: 0.85rem;
  }
  .lookup-head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-bottom: 0.4rem;
  }
  .lookup-title {
    flex: 1;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .lookup-icon {
    display: grid;
    place-items: center;
    padding: 0.3rem;
    border-radius: var(--ws-radius);
    color: rgb(255 255 255 / 0.75);
  }
  .lookup-icon:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.1);
    color: #fff;
  }
  .lookup-icon:disabled {
    opacity: 0.4;
  }
  .lookup-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: rgb(255 255 255 / 0.72);
  }
  .lookup-note.is-error {
    color: #fff;
    font-weight: 600;
  }
  .lookup-list {
    display: grid;
    gap: 0.7rem;
    transition: opacity 0.2s;
  }
  .lookup-list.is-stale {
    opacity: 0.5;
  }
  .lookup-list li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.6rem;
  }
  .lookup-kind {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--ws-radius);
    background: rgb(255 255 255 / 0.1);
    color: var(--ws-accent, #fff);
  }
  .lookup-name {
    font-weight: 650;
    font-size: 0.92rem;
    line-height: 1.3;
  }
  .lookup-guess {
    font-weight: 500;
    color: rgb(255 255 255 / 0.6);
    margin-inline-end: 0.25rem;
  }
  .lookup-body p {
    margin-block: 0.15rem 0.2rem;
    color: rgb(255 255 255 / 0.78);
    line-height: 1.4;
  }
  .lookup-body a {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ws-accent, #fff);
  }
  .lookup-body a:hover {
    text-decoration: underline;
  }
  .lookup-foot {
    margin-top: 0.6rem;
    font-size: var(--ws-text-data);
    color: rgb(255 255 255 / 0.5);
  }
  .lookup-spinner {
    width: 0.9rem;
    height: 0.9rem;
    border: 2px solid rgb(255 255 255 / 0.25);
    border-top-color: var(--ws-accent, #fff);
    border-radius: 50%;
    animation: lookup-spin 0.9s linear infinite;
  }
  @keyframes lookup-spin {
    to {
      rotate: 1turn;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .lookup-spinner {
      animation-duration: 3s;
    }
  }
</style>
