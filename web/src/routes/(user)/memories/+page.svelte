<script lang="ts">
  import { scrollMemory } from '$lib/actions/scroll-memory';
  import LoadingSpinner from '$lib/components/shared-components/LoadingSpinner.svelte';
  import UserPageLayout from '$lib/components/layouts/UserPageLayout.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { memoryManager } from '$lib/managers/memory-manager.svelte';
  import { userPreferencesManager } from '$lib/managers/user-preferences-manager.svelte';
  import MemoryCard from '$lib/components/memories/MemoryCard.svelte';
  import MemoriesSettingsModal from '$lib/modals/MemoriesSettingsModal.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { memoryFacts } from '$lib/managers/memory-facts.svelte';
  import { getAssetMediaUrl, getMemoryCardSubtitle, memoryLaneTitle } from '$lib/utils';
  import { memoryCover } from '$lib/utils/memory-title';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import type { MemoryResponseDto } from '@immich/sdk';
  import { Button, IconButton, modalManager } from '@immich/ui';
  import { mdiTelevisionPlay, mdiTune } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  const { data }: Props = $props();

  // memories are generated a few days ahead of time, and sorted by `showAt`, so the ones that have
  // not been shown yet come first
  const isUpcoming = (memory: MemoryResponseDto) => !!memory.showAt && new Date(memory.showAt).getTime() > Date.now();
  const upcomingCount = $derived(memoryManager.memories.filter((memory) => isUpcoming(memory)).length);
  const hasUpcoming = $derived(upcomingCount > 0);

  // Local Omarchy layer: Curator's facts title the cards and pick their covers (memoryFacts: once per memory, owner only)
  $effect(() => {
    memoryFacts.request(memoryManager.memories.map(({ id }) => id));
  });

  const handleSettings = async () => {
    const settings = await modalManager.show(MemoriesSettingsModal);
    if (!settings) {
      return;
    }

    userPreferencesManager.memories = settings;
    await memoryManager.applyPreferences();
  };
</script>

<UserPageLayout
  title={data.meta.title}
  description={memoryManager.total === undefined ? undefined : `(${memoryManager.total.toLocaleString($locale)})`}
  use={[[scrollMemory, { routeStartsWith: Route.memories() }]]}
>
  {#snippet buttons()}
    <div class="flex place-items-center gap-2">
      <!-- Local Omarchy layer: today's memories across the room, full screen (components/room) -->
      <Button
        href={Route.room()}
        leadingIcon={mdiTelevisionPlay}
        variant="ghost"
        size="small"
        color="secondary"
        title={$t('room_play')}
        aria-label={$t('room_play')}
        data-testid="memories-room"
      >
        <span class="ws-action-label">{$t('room')}</span>
      </Button>
      <IconButton
        shape="round"
        color="secondary"
        variant="ghost"
        indicator={userPreferencesManager.hasMemoryPreferences() ? 'primary' : undefined}
        icon={mdiTune}
        aria-label={$t('filters')}
        onclick={handleSettings}
      />
    </div>
  {/snippet}
  {#if memoryManager.memories.length > 0}
    <div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {#if hasUpcoming}
        <div class="col-span-full outline-none">{$t('memories_upcoming')}</div>
      {/if}
      {#each memoryManager.memories as memory, index (memory.id)}
        {#if hasUpcoming && index === upcomingCount}
          <div class="col-span-full outline-none">{$t('memories_current')}</div>
        {/if}
        <!-- Local Omarchy layer: a card waits for Curator's facts (a moment, memoryFacts) before it shows its cover and
             title, so it never swaps them under the reader's eyes -->
        {@const ready = memoryFacts.settled(memory.id)}
        {@const cover = memoryCover(memory, memoryFacts.get(memory.id))}
        <MemoryCard
          class="size-full"
          item={{
            id: memory.id,
            title: ready ? $memoryLaneTitle(memory) : '',
            subtitle: ready ? getMemoryCardSubtitle(memory, $t, $locale) : '',
            href: Route.viewMemory({
              id: memory.id,
              assetId: memory.assets[0].id,
              isSaved: userPreferencesManager.memories.onlyFavorites || undefined,
            }),
            src: ready ? getAssetMediaUrl({ id: cover.id, cacheKey: cover.asset?.thumbhash }) : '',
            alt: $getAltText(toTimelineAsset(cover.asset ?? memory.assets[0])),
            isSaved: memory.isSaved,
            type: memory.type,
          }}
        />
      {/each}
    </div>
  {:else if memoryManager.loading}
    <div class="flex items-center justify-center py-16">
      <LoadingSpinner size="giant" />
    </div>
  {:else}
    <!-- Local Omarchy layer: an empty Memories page says why, and offers the next step. -->
    <div class="ws-empty" data-testid="memories-empty">
      <h2 class="ws-empty-title">{$t('memories_empty_title')}</h2>
      <p class="ws-empty-body">{$t('memories_empty_body')}</p>
      <div class="ws-empty-actions">
        <button type="button" class="ws-empty-action" onclick={handleSettings}>{$t('memories_empty_settings')}</button>
        {#if authManager.authenticated && authManager.user.isAdmin}
          <a class="ws-empty-link" href={Route.queues()}>{$t('memories_empty_queues')}</a>
        {/if}
      </div>
    </div>
  {/if}
</UserPageLayout>
