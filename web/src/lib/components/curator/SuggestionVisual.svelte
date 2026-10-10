<script lang="ts">
  // Local Omarchy layer: what a suggestion is about, shown with the photos themselves. A cover change shows the
  // current cover beside the proposed one, a name shows the face group beside photos it was found in, a merge shows
  // every face group being joined. Each photo opens in Gallery in a new tab, so the review keeps its place.
  import type { Suggestion } from '$lib/utils/curator';
  import { getAssetMediaUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';

  interface Props {
    suggestion: Suggestion;
  }

  let { suggestion }: Props = $props();

  const thumbnail = (id: string) => getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail });
  const face = (personId: string) => `/api/people/${personId}/thumbnail`;

  const payload = $derived(suggestion.payload as Record<string, unknown>);
  const photos = $derived([...new Set(suggestion.asset_ids)]);
  const rotation = $derived(Number(payload.rotation ?? payload.angle ?? 0));
  const faces = $derived(
    suggestion.kind === 'person.merge'
      ? [String(payload.into_id), ...((payload.ids as string[] | undefined) ?? [])]
      : [suggestion.target_id],
  );
</script>

{#snippet photo(id: string, size: number, label?: string, turn = 0)}
  <a class="visual-tile" href="/photos/{id}" target="_blank" rel="noopener" style:width="{size}px">
    <img
      class="ws-strip-tile"
      src={thumbnail(id)}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      style:rotate={turn ? `${turn}deg` : undefined}
    />
    {#if label}
      <span class="ws-inbox-meta">{label}</span>
    {/if}
  </a>
{/snippet}

<div class="ws-strip visual">
  {#if suggestion.kind === 'stack.cover' && suggestion.asset_ids.length > 1}
    {@render photo(suggestion.asset_ids[1], 112, $t('ai_inbox_now'))}
    {@render photo(suggestion.asset_ids[0], 112, $t('ai_inbox_proposed'))}
  {:else if suggestion.kind === 'asset.rotate' && suggestion.asset_ids.length > 0}
    {@render photo(suggestion.asset_ids[0], 112, $t('ai_inbox_now'))}
    {@render photo(suggestion.asset_ids[0], 112, $t('ai_inbox_proposed'), rotation)}
  {:else if suggestion.kind === 'person.name' || suggestion.kind === 'person.merge'}
    {#each [...new Set(faces)] as personId (personId)}
      <img class="ws-strip-tile visual-face" src={face(personId)} alt="" loading="lazy" width="72" height="72" />
    {/each}
    {#if suggestion.kind === 'person.name'}
      {#each photos.slice(0, 4) as id (id)}
        {@render photo(id, 72)}
      {/each}
    {/if}
  {:else if suggestion.kind === 'asset.archive' && suggestion.asset_ids.length > 0}
    {@render photo(suggestion.asset_ids[0], 112)}
  {:else}
    {#each photos.slice(0, 6) as id (id)}
      {@render photo(id, 72)}
    {/each}
  {/if}
</div>

<style>
  .visual {
    align-items: flex-start;
  }
  .visual-tile {
    display: grid;
    gap: 0.3rem;
    flex: none;
  }
  .visual-tile:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
    border-radius: var(--ws-radius);
  }
  .visual-tile :global(.ws-strip-tile) {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    transition: rotate 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .visual-tile:hover :global(.ws-strip-tile) {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: calc(var(--ws-border) * -1);
  }
  /* faces are people, not photos: drawn round like everywhere else Gallery shows a person */
  .visual-face {
    border-radius: 999px;
  }
  @media (prefers-reduced-motion: reduce) {
    .visual-tile :global(.ws-strip-tile) {
      transition: none;
    }
  }
</style>
