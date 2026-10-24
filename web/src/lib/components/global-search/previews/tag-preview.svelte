<script lang="ts">
  import { offeredSpecialAlbums } from '$lib/managers/special-albums.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { shownAmongPhotos } from '$lib/utils/slips';
  import {
    AssetMediaSize,
    AssetVisibility,
    searchAssets,
    type AssetResponseDto,
    type TagResponseDto,
  } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    tag: TagResponseDto;
  }
  let { tag }: Props = $props();

  let photos = $state<AssetResponseDto[]>([]);
  let loaded = $state(false);
  let generation = 0;

  // Local Omarchy layer: a special album's tag (QR's, To do's, Villa's: each tags what it holds with its name) previews
  // as the album: its icon on the house's quiet cover and the line under the album's title, since what it holds is
  // kept out of Photos, and QR's bank slips are not for looking at. Any other tag shows what its own page shows, the
  // photos on the timeline, and never one of QR's slips (utils/slips). A recent tag knows its name alone.
  const special = $derived.by(() => {
    const value = (tag as Partial<TagResponseDto>).value ?? tag.name;
    return offeredSpecialAlbums().find(({ name }) => name === value);
  });

  $effect(() => {
    const gen = ++generation;
    const tagId = tag.id;
    photos = [];
    loaded = false;
    if (special) {
      return;
    }
    const dwell = setTimeout(() => {
      void (async () => {
        const ctrl = new AbortController();
        try {
          const response = await searchAssets(
            { metadataSearchDto: { tagIds: [tagId], size: 6, visibility: AssetVisibility.Timeline } },
            { signal: ctrl.signal },
          );
          if (gen !== generation) {
            return;
          }
          photos = response.assets.items.filter((photo) => shownAmongPhotos(photo));
        } catch {
          // ignore
        } finally {
          if (gen === generation) {
            loaded = true;
          }
        }
      })();
    }, 300);
    return () => clearTimeout(dwell);
  });
</script>

<div data-cmdk-preview-tag class="p-5">
  <div class="text-base font-semibold">{tag.name}</div>
  {#if special}
    <div class="ws-album-icon-cover mt-3 size-[72px] rounded-md" aria-hidden="true" data-testid="tag-preview-special">
      <Icon icon={special.icon} size="36%" />
    </div>
    <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">{$t(special.words.note)}</div>
  {:else if loaded && photos.length === 0}
    <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">{$t('cmdk_no_tagged_photos')}</div>
  {:else if loaded}
    <div class="mt-3 grid grid-cols-3 gap-2">
      {#each photos as photo (photo.id)}
        <img
          src={getAssetMediaUrl({ id: photo.id, size: AssetMediaSize.Thumbnail })}
          alt=""
          class="size-[72px] rounded-md object-cover"
        />
      {/each}
    </div>
  {/if}
</div>
