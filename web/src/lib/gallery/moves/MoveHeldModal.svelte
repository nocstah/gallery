<script lang="ts">
  // Local Omarchy layer: the photos a move left in this library (gallery/moves, S5), each a thumbnail of this
  // library's own under the reason it stayed. Only the source's page gets this list from the mover, and never a
  // photo in the Locked Folder.
  import { AssetMediaSize } from '@immich/sdk';
  import { Modal, ModalBody } from '@immich/ui';
  import { mdiImageMove } from '@mdi/js';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import { Route } from '$lib/route';
  import { getAssetMediaUrl } from '$lib/utils';
  import { holdKey, holdWords } from './hold-reasons';
  import { errorWords, moveNames } from './move-words';
  import { MoverError, moveStatus, type MoveStatus } from './mover';

  type Props = { move: MoveStatus; onClose: () => void };

  let { move, onClose }: Props = $props();

  const names = $derived(moveNames(move));
  let groups = $state<{ key: string; reason: string; assets: string[] }[]>();
  let failed = $state<string>();

  onMount(async () => {
    try {
      const { held } = await moveStatus(move.move);
      // one group per reason's words, in the order the mover listed them
      const found: { key: string; reason: string; assets: string[] }[] = [];
      for (const { asset, reason } of held) {
        const key = holdKey(reason);
        const group = found.find((item) => item.key === key);
        if (group) {
          group.assets.push(asset);
        } else {
          found.push({ key, reason, assets: [asset] });
        }
      }
      groups = found;
    } catch (error) {
      failed = errorWords($t, error instanceof MoverError ? error.code : 'failed', names);
    }
  });
</script>

<Modal title={$t('moves_held_title', { values: names })} icon={mdiImageMove} {onClose} size="medium">
  <ModalBody>
    <div class="ws-move-held" data-testid="move-held">
      {#if failed}
        <p role="alert">{failed}</p>
      {:else if !groups}
        <p role="status">{$t('loading')}</p>
      {:else}
        {#each groups as group (group.key)}
          <section>
            <h3>
              <span>{holdWords($t, group.reason, names)}</span>
              <span class="ws-move-held-count">{group.assets.length.toLocaleString($locale ?? undefined)}</span>
            </h3>
            <ul>
              {#each group.assets as id (id)}
                <li>
                  <a href={Route.viewAsset({ id })} onclick={() => onClose()}>
                    <img src={getAssetMediaUrl({ id, size: AssetMediaSize.Thumbnail })} alt="" loading="lazy" />
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      {/if}
    </div>
  </ModalBody>
</Modal>

<style>
  .ws-move-held {
    display: flex;
    flex-direction: column;
    font-size: var(--ws-text-ui, 0.875rem);
  }
  /* each reason under a hairline that runs edge to edge, its photos as small square tiles */
  section {
    padding: 0.75rem 0;
  }
  section + section {
    border-top: 1px solid var(--ws-hairline);
  }
  h3 {
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }
  .ws-move-held-count {
    flex: none;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
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
