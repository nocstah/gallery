<script lang="ts">
  // Local Omarchy layer: copies a move left unfinished in this library (gallery/moves, D7): their groups stayed in the
  // source after the copy arrived here, most often because this library had not read them yet or a detail would not
  // carry. Each is on the timeline without some of its details. Moving the same photos again finishes them with no
  // new copy; deleting them here is the other way. This library's own thumbnails, from the mover's list of ids.
  import { AssetMediaSize } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import { Route } from '$lib/route';
  import { getAssetMediaUrl } from '$lib/utils';

  type Props = { ids: readonly string[]; names: { source: string; library: string } };

  let { ids, names }: Props = $props();
</script>

{#if ids.length > 0}
  <section class="ws-move-unfinished" data-testid="move-unfinished">
    <h2>{$t('moves_unfinished_title', { values: names })}</h2>
    <ul>
      {#each ids as id (id)}
        <li>
          <a href={Route.viewAsset({ id })}>
            <img src={getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail })} alt="" loading="lazy" />
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  h2 {
    margin-bottom: 0.5rem;
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
    gap: var(--ws-gap, 10px);
  }
  a {
    display: block;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--ws-radius);
    box-shadow: inset 0 0 0 1px var(--ws-hairline);
  }
  a:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
