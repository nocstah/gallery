<script lang="ts">
  // Local Omarchy layer: the people in an album as a row of small faces in the album page's details (the block that
  // scrolls away). A face narrows the album to that person, as the filter rail's People does, and a second click takes
  // it back. The faces are the rail's own: the album's named, visible people, from the same suggestions call.
  import { buildAlbumDetailFilterConfig } from '$lib/utils/album-filter-config';
  import { t } from 'svelte-i18n';

  type Person = { id: string; name: string; thumbnailUrl?: string };
  type Props = {
    albumId: string;
    /** the people the album is narrowed to (filter ids) */
    selected: string[];
    onToggle: (person: Person) => void;
  };

  const { albumId, selected, onToggle }: Props = $props();

  const MAX_FACES = 16;
  let people = $state<Person[]>([]);

  $effect(() => {
    const config = buildAlbumDetailFilterConfig(albumId);
    let current = true;
    void config
      .baselineProvider?.()
      .then((result) => {
        if (current) {
          people = (result?.people ?? []).slice(0, MAX_FACES);
        }
      })
      .catch(() => {
        if (current) {
          people = [];
        }
      });
    return () => {
      current = false;
    };
  });
</script>

{#if people.length > 0}
  <div class="ws-album-people" role="group" aria-label={$t('people')}>
    {#each people as person (person.id)}
      <button
        type="button"
        class="ws-album-person"
        aria-pressed={selected.includes(person.id)}
        title={person.name}
        onclick={() => onToggle(person)}
      >
        {#if person.thumbnailUrl}
          <img src={person.thumbnailUrl} alt="" loading="lazy" draggable="false" />
        {/if}
        <span>{person.name}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .ws-album-people {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .ws-album-person {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding-inline: 0.125rem 0.625rem;
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-meta);
    font-weight: 500;
    color: var(--immich-ui-dark);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
    transition: background-color 120ms;
  }
  .ws-album-person:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 6%, transparent);
  }
  .ws-album-person[aria-pressed='true'] {
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    box-shadow: none;
  }
  .ws-album-person:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 2px;
  }
  /* a face stays round */
  img {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    object-fit: cover;
  }
  span {
    white-space: nowrap;
  }
</style>
