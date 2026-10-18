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
  import { getAssetMediaUrl, memoryLaneTitle } from '$lib/utils';
  import { MEMORY_SECTIONS, memoryCardLine, type MemorySection } from '$lib/utils/memory-cards';
  import { memoryCover } from '$lib/utils/memory-title';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { Button, IconButton, modalManager } from '@immich/ui';
  import { mdiFilterOutline, mdiTelevisionPlay } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  type Props = {
    data: PageData;
  };

  const { data }: Props = $props();

  // Local Omarchy layer: the memories as cards (memoryManager.cards, utils/memory-cards): those that read the same are
  // one card, which plays them as one film; today's first under a heading of their own, then the earlier days' the
  // server still keeps, then the upcoming ones (generated a few days ahead) when the reader shows them. Upstream put
  // the upcoming ones first, as the server sorts them, under a body-size label.
  const SECTION_TITLES = {
    today: 'memories_today',
    earlier: 'memories_earlier',
    upcoming: 'memories_upcoming',
  } as const satisfies Record<MemorySection, string>;

  // Curator's facts title the cards, pick their covers and tell which memories read the same (memoryFacts: once per
  // memory, owner only)
  $effect(() => {
    memoryFacts.request(memoryManager.memories.map(({ id }) => id));
  });
  // the cards wait for them (a moment at most) before they are laid out, so none joins another or changes its cover
  // and title under the reader's eyes
  const ready = $derived(memoryFacts.settledAll(memoryManager.memories.map(({ id }) => id)));
  const sections = $derived(
    MEMORY_SECTIONS.map((section) => ({
      section,
      cards: memoryManager.cards.filter((card) => card.section === section),
    })).filter(({ cards }) => cards.length > 0),
  );
  // the bar counts the cards, once every memory is in
  const count = $derived(
    memoryManager.total === undefined
      ? undefined
      : ready && !memoryManager.hasNextPage
        ? memoryManager.cards.length
        : memoryManager.total,
  );

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
  description={count === undefined ? undefined : `(${count.toLocaleString($locale)})`}
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
        icon={mdiFilterOutline}
        aria-label={$t('filters')}
        onclick={handleSettings}
      />
    </div>
  {/snippet}
  {#if ready && memoryManager.cards.length > 0}
    <div class="ws-sharing">
      {#each sections as { section, cards } (section)}
        <section class="ws-sharing-section" aria-labelledby="memories-{section}" data-testid="memories-{section}">
          <h2 class="ws-sharing-heading" id="memories-{section}">
            {$t(SECTION_TITLES[section])}
            <span class="ws-inbox-meta">{cards.length.toLocaleString($locale)}</span>
          </h2>
          <div class="grid w-full grid-cols-1 gap-(--ws-gap) md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {#each cards as card (card.lead.id)}
              {@const cover = memoryCover(card.lead, memoryFacts.get(card.lead.id))}
              <MemoryCard
                class="size-full"
                item={{
                  id: card.lead.id,
                  title: $memoryLaneTitle(card.lead),
                  subtitle: memoryCardLine(card, $t, $locale),
                  href: Route.viewMemory({
                    id: card.lead.id,
                    assetId: card.assets[0].id,
                    isSaved: userPreferencesManager.memories.onlyFavorites || undefined,
                  }),
                  src: getAssetMediaUrl({ id: cover.id, cacheKey: cover.asset?.thumbhash }),
                  alt: $getAltText(toTimelineAsset(cover.asset ?? card.assets[0])),
                  isSaved: card.isSaved,
                  type: card.lead.type,
                }}
              />
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else if memoryManager.loading || !ready}
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
