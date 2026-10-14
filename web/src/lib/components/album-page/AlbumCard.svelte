<script lang="ts">
  import AlbumCover from '$lib/components/album-page/AlbumCover.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { getShortDateRange } from '$lib/utils/date-time';
  import { type AlbumResponseDto } from '@immich/sdk';
  import { ContextMenuButton, Icon, type MenuItems } from '@immich/ui';
  import { mdiEyeOffOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    album: AlbumResponseDto;
    showOwner?: boolean;
    showDateRange?: boolean;
    showItemCount?: boolean;
    preload?: boolean;
    contextMenuItems?: MenuItems;
    /**
     * Local Omarchy layer: hidden from my timeline (managers/album-folders). The cover turns grey and carries a "Not in
     * Photos" chip, so such an album can be told apart across the grid at a glance ("have a better visual indicator for
     * albums that are excluded from photos").
     */
    hiddenFromTimeline?: boolean;
  };

  const {
    album,
    showOwner = false,
    showDateRange = false,
    showItemCount = false,
    preload = false,
    contextMenuItems,
    hiddenFromTimeline = false,
  }: Props = $props();
</script>

<div
  class="group relative rounded-2xl border border-transparent p-5 hover:border-gray-200 hover:bg-gray-100 dark:hover:border-gray-800 dark:hover:bg-gray-900"
  data-testid="album-card"
>
  {#if contextMenuItems}
    <div
      id="icon-{album.id}"
      class="absolute inset-e-6 top-6 opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      data-testid="context-button-parent"
    >
      <ContextMenuButton
        translations={{ open_menu: $t('show_album_options') }}
        position="top-left"
        variant="filled"
        class="icon-white-drop-shadow"
        items={contextMenuItems}
      />
    </div>
  {/if}

  <div class="relative">
    <AlbumCover
      {album}
      {preload}
      class="transition-all duration-300 hover:shadow-lg {hiddenFromTimeline ? 'ws-album-cover-hidden' : ''}"
    />
    {#if hiddenFromTimeline}
      <span class="ws-hidden-chip" data-testid="album-hidden-from-timeline">
        <Icon icon={mdiEyeOffOutline} size="14" aria-hidden={true} />
        {$t('album_not_in_photos')}
      </span>
    {/if}
  </div>

  <div class="mt-4">
    <p
      class="line-clamp-2 w-full text-lg/6 font-semibold wrap-break-word text-black group-hover:text-primary dark:text-white"
      data-testid="album-name"
      title={album.albumName}
    >
      {album.albumName}
    </p>

    {#if showDateRange && album.startDate && album.endDate}
      <p class="flex text-sm capitalize dark:text-immich-dark-fg">
        {getShortDateRange(album.startDate, album.endDate)}
      </p>
    {/if}

    <span class="flex gap-2 text-sm dark:text-immich-dark-fg" data-testid="album-details">
      {#if showItemCount}
        <p>
          {$t('items_count', { values: { count: album.assetCount } })}
        </p>
      {/if}

      {#if (showOwner || album.shared) && showItemCount}
        <p>•</p>
      {/if}

      {#if showOwner}
        {@const owner = album.albumUsers[0].user}
        {#if owner.id === authManager.user.id}
          <p>{$t('owned')}</p>
        {:else}
          <p>
            {$t('shared_by_user', { values: { user: owner.name } })}
          </p>
        {/if}
      {:else if album.shared}
        <p>{$t('shared')}</p>
      {/if}
    </span>
  </div>
</div>
