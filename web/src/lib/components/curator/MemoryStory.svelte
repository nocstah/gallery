<script lang="ts">
  // Local Omarchy layer: in the memory viewer, the story Curator's stories.write told for this memory
  // (curator/jobs/stories.py), over the bottom of the photo on a smoked panel that keeps it readable on any picture.
  // It stays while the memory's photos change. The close button hides stories (remembered in this browser) and a
  // small "Story" button brings them back. Left out when the memory has no story yet or Curator does not answer;
  // faded while the gallery below the viewer is in view, like the viewer's own buttons.
  import { curator, type Story } from '$lib/utils/curator';
  import { Icon } from '@immich/ui';
  import { mdiClose, mdiTextBoxOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    memoryId: string;
    faded?: boolean;
  }

  let { memoryId, faded = false }: Props = $props();

  const HIDDEN = 'curator-memory-story-hidden';

  const storedHidden = () => {
    try {
      return localStorage.getItem(HIDDEN) === '1';
    } catch {
      return false;
    }
  };

  let hidden = $state(storedHidden());
  let story = $state<Story | null>(null);
  // a memory's story is asked for once per visit, as the viewer moves back and forth between memories (a plain
  // record: nothing needs to react to it filling up)
  const told: Record<string, Story | null> = {};

  const setHidden = (value: boolean) => {
    hidden = value;
    try {
      if (value) {
        localStorage.setItem(HIDDEN, '1');
      } else {
        localStorage.removeItem(HIDDEN);
      }
    } catch {
      // storage refused (a private window): the choice lasts until the page closes
    }
  };

  $effect(() => {
    const asked = memoryId;
    if (Object.hasOwn(told, asked)) {
      story = told[asked];
      return;
    }
    story = null;
    curator
      .story({ memory: asked })
      .then((answer) => {
        told[asked] = answer.story;
        if (asked === memoryId) {
          story = answer.story;
        }
      })
      .catch(() => undefined);
  });
</script>

{#if story}
  {#if hidden}
    <button
      type="button"
      class="memory-story-pill"
      class:is-faded={faded}
      aria-label={$t('ai_story_show')}
      onclick={() => setHidden(false)}
    >
      <Icon icon={mdiTextBoxOutline} size="16" />
      {$t('ai_story')}
    </button>
  {:else}
    <section class="memory-story" class:is-faded={faded} aria-label={$t('ai_story')} title={story.model}>
      <header class="memory-story-head">
        <span>{$t('ai_story')} · {$t('ai_story_by_ai')}</span>
        <button
          type="button"
          class="memory-story-close"
          aria-label={$t('ai_story_hide')}
          title={$t('ai_story_hide')}
          onclick={() => setHidden(true)}
        >
          <Icon icon={mdiClose} size="16" />
        </button>
      </header>
      <p class="memory-story-text">{story.text}</p>
    </section>
  {/if}
{/if}

<style>
  .memory-story,
  .memory-story-pill {
    position: absolute;
    inset-inline-start: 1rem;
    bottom: 1rem;
    z-index: 1;
    border: 1px solid color-mix(in oklab, white 16%, transparent);
    background: color-mix(in oklab, black 62%, transparent);
    backdrop-filter: blur(14px) saturate(1.15);
    color: white;
    transition: opacity 200ms ease;
  }
  .memory-story {
    display: grid;
    gap: 0.35rem;
    /* clear of the "view in timeline" button in the bottom-right corner */
    max-width: min(36rem, calc(100% - 6rem));
    max-height: 45%;
    padding: 0.7rem 0.9rem 0.85rem;
    border-radius: var(--ws-radius, 0px);
  }
  .memory-story-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-family: var(--ws-font-data);
    font-size: 12px;
    font-weight: 600;
    color: color-mix(in oklab, white 72%, transparent);
  }
  .memory-story-text {
    overflow-y: auto;
    font-size: 1rem;
    line-height: 1.5;
    text-wrap: pretty;
  }
  .memory-story-close {
    display: grid;
    place-items: center;
    padding: 0.2rem;
    border-radius: var(--ws-radius);
    color: inherit;
  }
  .memory-story-close:hover {
    color: white;
    background: color-mix(in oklab, white 14%, transparent);
  }
  .memory-story-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.65rem;
    border-radius: calc(var(--ws-radius, 0px) + 5px);
    font-family: var(--ws-font-data);
    font-size: 12px;
    font-weight: 600;
  }
  .memory-story-pill:hover {
    background: color-mix(in oklab, black 78%, transparent);
  }
  .memory-story-close:focus-visible,
  .memory-story-pill:focus-visible {
    outline: var(--ws-border, 2px) solid var(--ws-accent);
    outline-offset: 2px;
  }
  .is-faded {
    opacity: 0;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .memory-story,
    .memory-story-pill {
      transition: none;
    }
  }
</style>
