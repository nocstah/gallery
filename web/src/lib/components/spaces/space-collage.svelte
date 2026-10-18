<script lang="ts">
  import { getAssetMediaUrl } from '$lib/utils';
  import { Icon } from '@immich/ui';
  import { mdiImageMultipleOutline } from '@mdi/js';

  interface AssetInfo {
    id: string;
    thumbhash: string | null;
  }

  interface Props {
    assets: AssetInfo[];
    preload?: boolean;
    /** Local Omarchy layer: the glyph an empty collage wears (photos by default; a folder's card wears a folder) */
    emptyIcon?: string;
  }

  let { assets, preload = false, emptyIcon = mdiImageMultipleOutline }: Props = $props();

  let layout = $derived(
    assets.length === 0 ? 'empty' : assets.length === 1 ? 'single' : assets.length <= 3 ? 'asymmetric' : 'grid',
  );
</script>

{#if layout === 'empty'}
  <!-- Local Omarchy layer: nothing to show yet wears the house's icon cover (a faint ink ground inside a hairline, the
       glyph muted: .ws-album-icon-cover, as QR's albums do), where a grey or Space-coloured gradient slab stood (the
       Albums page's empty folder, a Space with no photos on Spaces and in the pickers) -->
  <div class="ws-album-icon-cover aspect-square size-full rounded-xl" data-testid="collage-empty">
    <Icon icon={emptyIcon} size="36%" aria-hidden />
  </div>
{:else if layout === 'single'}
  <div class="aspect-square overflow-hidden rounded-xl" data-testid="collage-single">
    <img
      alt=""
      src={getAssetMediaUrl({ id: assets[0].id })}
      class="size-full object-cover"
      loading={preload ? 'eager' : 'lazy'}
      draggable="false"
    />
  </div>
{:else if layout === 'asymmetric'}
  <div
    class="grid aspect-square gap-0.5 overflow-hidden rounded-xl"
    style="grid-template-columns: 3fr 2fr;"
    data-testid="collage-asymmetric"
  >
    <img
      alt=""
      src={getAssetMediaUrl({ id: assets[0].id })}
      class="size-full object-cover"
      style="grid-row: 1 / {assets.length === 2 ? 2 : 3};"
      loading={preload ? 'eager' : 'lazy'}
      draggable="false"
    />
    <img
      alt=""
      src={getAssetMediaUrl({ id: assets[1].id })}
      class="size-full object-cover"
      loading={preload ? 'eager' : 'lazy'}
      draggable="false"
    />
    {#if assets.length >= 3}
      <img
        alt=""
        src={getAssetMediaUrl({ id: assets[2].id })}
        class="size-full object-cover"
        loading={preload ? 'eager' : 'lazy'}
        draggable="false"
      />
    {/if}
  </div>
{:else}
  <div class="grid aspect-square grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl" data-testid="collage-grid">
    {#each assets.slice(0, 4) as asset (asset.id)}
      <img
        alt=""
        src={getAssetMediaUrl({ id: asset.id })}
        class="size-full object-cover"
        loading={preload ? 'eager' : 'lazy'}
        draggable="false"
      />
    {/each}
  </div>
{/if}
