<script lang="ts">
  import { cleanClass } from '$lib';
  import AssetCover from '$lib/components/sharedlinks-page/covers/AssetCover.svelte';
  import NoCover from '$lib/components/sharedlinks-page/covers/NoCover.svelte';
  import { slipCovers } from '$lib/managers/slip-covers.svelte';
  import { qrManager, specialAlbumOf } from '$lib/managers/special-albums.svelte';
  import { getAssetMediaUrl } from '$lib/utils';
  import { type AlbumResponseDto } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    album: AlbumResponseDto;
    preload?: boolean;
    class?: string;
  }

  let { album, preload = false, class: className }: Props = $props();

  let alt = $derived(album.albumName || $t('unnamed_album'));
  let thumbnailUrl = $derived(
    album.albumThumbnailAssetId ? getAssetMediaUrl({ id: album.albumThumbnailAssetId }) : null,
  );
  // Local Omarchy layer: a special album whose photos are not for looking at (QR's bank slips) is covered by its icon,
  // and so is an album whose cover is one of them (the bank apps' albums: managers/slip-covers)
  const special = $derived(specialAlbumOf(album.id));
  const iconCover = $derived(
    special?.iconCover ? special : slipCovers.isSlip(album.albumThumbnailAssetId) ? qrManager : undefined,
  );
</script>

{#if iconCover}
  <div
    class={cleanClass('ws-album-icon-cover size-full rounded-xl aspect-square', className)}
    role="img"
    aria-label={alt}
    data-testid="album-image"
  >
    <Icon icon={iconCover.icon} size="36%" aria-hidden />
  </div>
{:else if thumbnailUrl}
  <AssetCover {alt} class={className} src={thumbnailUrl} {preload} />
{:else}
  <NoCover {alt} class={className} {preload} />
{/if}
