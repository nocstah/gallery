<script lang="ts">
  // Local Omarchy layer: a story Curator's stories.write told for an event, a trip or a memory (curator/jobs/stories.py:
  // a few factual sentences by the local text model, from the photos' captions, places, people and dates), as a
  // labelled paragraph. Outside the inbox the label says the text is the model's; on an inbox card (`kind` is the
  // suggestion's) it says what accepting does with the story instead, and `clamp` keeps a long one to three lines.
  import type { Story } from '$lib/utils/curator';
  import { t } from 'svelte-i18n';

  interface Props {
    story: Story;
    kind?: string;
    clamp?: boolean;
  }

  let { story, kind, clamp = false }: Props = $props();

  const note = $derived(
    kind === 'album.create' ? 'ai_story_album_note' : kind === 'reel.publish' ? 'ai_story_reel_note' : 'ai_story_by_ai',
  );
</script>

<div class="story" title={story.model}>
  <span class="ws-inbox-meta">{$t('ai_story')} · {$t(note)}</span>
  <p class="story-text" class:is-clamped={clamp}>{story.text}</p>
</div>

<style>
  .story {
    display: grid;
    gap: 0.2rem;
    max-width: 62ch;
  }
  .story-text {
    font-size: var(--ws-text-body);
    line-height: 1.55;
    color: var(--immich-ui-dark);
    text-wrap: pretty;
  }
  .story-text.is-clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
  }
</style>
