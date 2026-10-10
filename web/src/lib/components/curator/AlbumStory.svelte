<script lang="ts">
  // Local Omarchy layer: under an album's description, the story of the event or trip the album holds (the one Curator
  // made it from, else the one most of its photos belong to). Left out when there is none yet, when Curator does not
  // answer, and when the description already is that story (a trip's album accepted from the inbox gets it there).
  import StoryText from '$lib/components/curator/StoryText.svelte';
  import { curator, type Story } from '$lib/utils/curator';

  interface Props {
    albumId: string;
    description: string;
  }

  let { albumId, description }: Props = $props();

  let story = $state<Story | null>(null);

  $effect(() => {
    const asked = albumId;
    story = null;
    curator
      .story({ album: asked })
      .then((answer) => {
        if (asked === albumId) {
          story = answer.story;
        }
      })
      .catch(() => undefined);
  });

  // a description Curator wrote from the story ends in its "(AI)" mark
  const plain = (text: string | null | undefined) => (text ?? '').trim().replace(/\s*\(AI\)$/, '');
  const shown = $derived(story && plain(story.text) !== plain(description) ? story : null);
</script>

{#if shown}
  <div class="album-story">
    <StoryText story={shown} />
  </div>
{/if}

<style>
  .album-story {
    margin-block: 0.75rem 0.25rem;
  }
</style>
