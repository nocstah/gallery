<script lang="ts">
  // Local Omarchy layer: the photos a library-chat step found or showed, as thumbnails into the photo viewer. Twelve
  // at first, all that came with the answer on request (a search sends up to 60), and how many the search counted
  // beyond those. A visual search is ranked by likeness, so it has no count to give.
  import { getAssetMediaUrl } from '$lib/utils';
  import type { ChatPhotos } from '$lib/utils/curator';
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  interface Props {
    photos: ChatPhotos;
  }

  let { photos }: Props = $props();

  const FIRST = 12;
  let all = $state(false);

  const shown = $derived(all ? photos.ids : photos.ids.slice(0, FIRST));
  const counted = $derived(!photos.ranked && photos.total > photos.ids.length);
</script>

<div class="chat-photos">
  <ul class="chat-photo-grid">
    {#each shown as id, index (id)}
      <li>
        <a class="chat-photo" href="/photos/{id}" aria-label={$t('chat_photo', { values: { n: index + 1 } })}>
          <img src={getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail })} alt="" loading="lazy" draggable="false" />
        </a>
      </li>
    {/each}
  </ul>
  {#if photos.ids.length > FIRST || counted}
    <div class="chat-photos-foot">
      {#if photos.ids.length > FIRST}
        <button type="button" class="ws-btn-quiet" aria-expanded={all} onclick={() => (all = !all)}>
          {all ? $t('chat_photos_show_fewer') : $t('chat_photos_show_all', { values: { count: photos.ids.length } })}
        </button>
      {/if}
      {#if counted}
        <span class="ws-inbox-meta">
          {$t('chat_photos_shown', { values: { shown: photos.ids.length, total: photos.total } })}
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .chat-photos {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }
  .chat-photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
    gap: calc(var(--ws-gap) * 0.5);
    max-width: 52rem;
    list-style: none;
  }
  .chat-photo {
    display: block;
    border-radius: var(--ws-radius);
  }
  .chat-photo img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--ws-radius);
    outline: 1px solid var(--ws-hairline);
    outline-offset: -1px;
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
    transition: outline-color 120ms ease-out;
  }
  .chat-photo:hover img,
  .chat-photo:focus-visible img {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  .chat-photo:focus-visible {
    outline: none;
  }
  .chat-photos-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    margin-inline-start: -0.6rem;
  }
  @media (max-width: 640px) {
    .chat-photo-grid {
      grid-template-columns: repeat(auto-fill, minmax(4.75rem, 1fr));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chat-photo img {
      transition: none;
    }
  }
</style>
