<script lang="ts">
  import { goto } from '$app/navigation';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import { shortcuts } from '$lib/actions/shortcut';
  import ActionMenuItem from '$lib/components/ActionMenuItem.svelte';
  import BirthdayConfetti from '$lib/components/memories/BirthdayConfetti.svelte';
  import MemoryFilm from '$lib/components/memories/film/MemoryFilm.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/ButtonContextMenu.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/MenuOption.svelte';
  import GalleryViewer from '$lib/components/shared-components/gallery-viewer/GalleryViewer.svelte';
  import ArchiveAction from '$lib/components/timeline/actions/ArchiveAction.svelte';
  import ChangeDate from '$lib/components/timeline/actions/ChangeDateAction.svelte';
  import ChangeDescription from '$lib/components/timeline/actions/ChangeDescriptionAction.svelte';
  import ChangeLocation from '$lib/components/timeline/actions/ChangeLocationAction.svelte';
  import DeleteAssets from '$lib/components/timeline/actions/DeleteAssetsAction.svelte';
  import DownloadAction from '$lib/components/timeline/actions/DownloadAction.svelte';
  import FavoriteAction from '$lib/components/timeline/actions/FavoriteAction.svelte';
  import AssetSelectControlBar from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import { assetMultiSelectManager } from '$lib/managers/asset-multi-select-manager.svelte';
  import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { filmVideos } from '$lib/managers/film-video-manager.svelte';
  import { memoryFacts } from '$lib/managers/memory-facts.svelte';
  import { memoryManager } from '$lib/managers/memory-manager.svelte';
  import type { Viewport } from '$lib/managers/timeline-manager/types';
  import { Route } from '$lib/route';
  import { getAssetBulkActions } from '$lib/services/asset.service';
  import { locale } from '$lib/stores/preferences.store';
  import { handlePromiseError, memoryLaneTitle } from '$lib/utils';
  import { curator, curatorIsMine, type MemoryTrack } from '$lib/utils/curator';
  import { memoryCardCount } from '$lib/utils/memory-cards';
  import { memoryCount, memoryFilmWords } from '$lib/utils/memory-title';
  import { fromISODateTimeUTC, toTimelineAsset } from '$lib/utils/timeline-util';
  import { type AssetResponseDto, getAssetInfo, MemoryType } from '@immich/sdk';
  import { ActionButton, CommandPaletteDefaultProvider, Icon, IconButton } from '@immich/ui';
  import {
    mdiCardsOutline,
    mdiClose,
    mdiDotsVertical,
    mdiHeart,
    mdiHeartOutline,
    mdiImageMinusOutline,
    mdiImageSearch,
    mdiMovieOpenOutline,
    mdiPlay,
    mdiSelectAll,
    mdiTextBoxOutline,
    mdiTextBoxRemoveOutline,
  } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';

  // Local Omarchy layer: a memory's page is its film (MemoryFilm, DESIGN.md, Memories), full screen over the shell
  // as the photo viewer is, and All photos, its photos as a grid under a slim bar, from which a photo opens in the
  // viewer. Upstream's framed player (a progress bar of segments, the memories before and after at its sides, the
  // story in a box over the photo) is gone; its ⋮, its heart and View in timeline stay, in the film's top bar, and the
  // ⋮ adds Save as video for Curator's owner.

  const current = $derived(memoryManager.current);
  const memoryId = $derived(current?.memory.id);

  // All photos instead of the film: a page opened on the photo viewer goes back to the grid it came from
  let showGrid = $state(untrack(() => assetViewerManager.isViewing));
  let film = $state<ReturnType<typeof MemoryFilm>>();
  // the photo the film shows (it starts on the address's)
  let filmAsset = $state<string | undefined>(untrack(() => current?.asset.id));

  let shownMemory = untrack(() => memoryId);
  $effect(() => {
    const id = memoryId;
    untrack(() => {
      if (id && id !== shownMemory) {
        // another memory (the next one from the film's end, one removed): its own film, from its start
        shownMemory = id;
        showGrid = false;
        filmAsset = current?.asset.id;
      }
    });
  });

  // ---- what Curator knows of it: the facts, the story, the songs (its owner only: curatorIsMine) ----

  // every memory's facts: they tell which memories share a card (utils/memory-cards), and one batch asks for them all
  $effect(() => {
    memoryFacts.request(memoryManager.memories.map(({ id }) => id));
  });
  const facts = $derived(memoryId ? memoryFacts.get(memoryId) : undefined);
  // Local Omarchy layer: a card of several memories plays their photos as one film, which drifts toward the faces in
  // all of them and stands for what they stand for together
  const members = $derived(current?.card.members ?? []);
  const focus = $derived(
    members.length > 1 ? Object.assign({}, ...members.map(({ id }) => memoryFacts.get(id)?.focus ?? {})) : facts?.focus,
  );
  const total = $derived(
    current && members.length > 1
      ? memoryCardCount(current.card, (memory) => memoryCount(memory, memoryFacts.get(memory.id)))
      : undefined,
  );

  const STORY_HIDDEN = 'curator-memory-story-hidden';
  const readStoryHidden = () => {
    try {
      return localStorage.getItem(STORY_HIDDEN) === '1';
    } catch {
      return false;
    }
  };
  let storyHidden = $state(readStoryHidden());
  const setStoryHidden = (hidden: boolean) => {
    storyHidden = hidden;
    try {
      if (hidden) {
        localStorage.setItem(STORY_HIDDEN, '1');
      } else {
        localStorage.removeItem(STORY_HIDDEN);
      }
    } catch {
      // storage refused (a private window): the choice lasts while the page is open
    }
  };

  // each answer is kept with the memory it answers, so a film never takes the one before's story or songs
  let told = $state<{ memoryId: string; text: string | null }>();
  let songs = $state<{ memoryId: string; tracks: MemoryTrack[] }>();

  $effect(() => {
    const id = memoryId;
    if (!id || !curatorIsMine()) {
      return;
    }
    let live = true;
    curator
      .story({ memory: id })
      .then((answer) => {
        if (live) {
          told = { memoryId: id, text: answer.story?.text ?? null };
        }
      })
      .catch(() => {
        if (live) {
          told = { memoryId: id, text: null };
        }
      });
    curator
      .memoryMusic(id, 3)
      .then((answer) => {
        if (live) {
          songs = { memoryId: id, tracks: Array.isArray(answer.tracks) ? answer.tracks : [] };
        }
      })
      .catch(() => {
        if (live) {
          songs = { memoryId: id, tracks: [] };
        }
      });
    return () => {
      live = false;
    };
  });

  const story = $derived(told && told.memoryId === memoryId ? told.text : null);
  const tracks = $derived(songs && songs.memoryId === memoryId ? songs.tracks : []);
  const settled = $derived(
    !memoryId ||
      !curatorIsMine() ||
      (memoryFacts.settledAll(members.map(({ id }) => id)) &&
        memoryFacts.settled(memoryId) &&
        songs?.memoryId === memoryId),
  );

  // ---- its title: facts, place and time (utils/memory-title, as Room says them) ----

  const words = $derived(
    current
      ? memoryFilmWords(current.memory, facts, $locale, {
          fallbackTitle: $memoryLaneTitle,
          count: (count, videos) =>
            $t(videos ? 'memory_video_moments_subtitle' : 'memory_assets_count', { values: { count } }),
          total,
        })
      : undefined,
  );
  const cardTitle = $derived(words?.title ?? '');
  const filmName = $derived(words?.name ?? '');
  const countText = $derived(words?.count ?? '');
  const filmLine = $derived(words?.line ?? '');

  // ---- the photo on screen: where it was taken, and the way to it in the timeline ----

  let filmAssetInfo = $state<AssetResponseDto>();
  $effect(() => {
    const id = filmAsset;
    if (!id) {
      return;
    }
    let live = true;
    getAssetInfo({ ...authManager.params, id })
      .then((asset) => {
        if (live) {
          filmAssetInfo = asset;
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  });
  const shownInfo = $derived(filmAssetInfo && filmAssetInfo.id === filmAsset ? filmAssetInfo : undefined);
  const place = $derived(
    [shownInfo?.exifInfo?.city, shownInfo?.exifInfo?.country].filter(Boolean).join(', ') || undefined,
  );

  // #1047: a memory can hold a photo the viewer only reaches through a Space. The personal timeline
  // carries such a photo only while that membership is shown in the timeline, so sending every jump
  // to /photos scrolled to the right date and showed nothing. `resolvedSpaceId` is set by the server
  // exactly for an asset the viewer does not own but reaches through a space they belong to.
  const viewInTimelineHref = (asset: AssetResponseDto) => {
    const at = asset.stack?.primaryAssetId ?? asset.id;
    return asset.resolvedSpaceId ? Route.viewSpace({ id: asset.resolvedSpaceId }, { at }) : Route.photos({ at });
  };

  const birthdayAge = $derived.by(() => {
    if (current?.memory.type !== MemoryType.Birthday) {
      return;
    }
    const asset = current.memory.assets.find(({ id }) => id === filmAsset);
    if (!asset) {
      return;
    }
    const age = fromISODateTimeUTC(asset.localDateTime).year - current.memory.data.year;
    return age >= 0 ? age : undefined;
  });

  // ---- the memory's own actions ----

  // the actions on "the photo" act on the one the film shows: the address is put on it first
  const syncTo = async (assetId: string | undefined) => {
    const href = assetId && current && current.asset.id !== assetId ? current.getAssetHref(assetId) : undefined;
    if (href) {
      await goto(href, { replaceState: true, noScroll: true, keepFocus: true });
    }
  };

  // Local Omarchy layer: both removals can be taken back (the toast's Undo, the bar's history, Ctrl+Z; managers/memory-
  // manager), and they are offered only for the account's own memories, the only ones Gallery lets it change
  const removable = $derived(current ? memoryManager.removable(current.card) : false);
  const photoRemovable = $derived(current && filmAsset ? memoryManager.removable(current.card, filmAsset) : false);

  const removePhoto = async () => {
    await syncTo(filmAsset);
    await memoryManager.deleteCurrentAsset(cardTitle);
  };

  // Save as video (Curator's owner, once Curator says it saves films): the film's own plan and the song playing, drawn
  // into an MP4 by Curator; the corner panel follows it and the browser saves "<title>.mp4" (managers/film-video-manager)
  const saveAsVideo = () => {
    const saved = film?.videoPlan();
    if (current && saved) {
      filmVideos.start({ memoryId: current.memory.id, ...saved, title: cardTitle }, cardTitle);
    }
  };

  const close = () => goto(memoryManager.memoriesHref);

  const showAllPhotos = () => {
    showGrid = true;
    window.scrollTo({ top: 0 });
  };

  const handleSelectAll = () =>
    assetMultiSelectManager.selectAssets(current?.memory.assets.map((a) => toTimelineAsset(a)) || []);

  const handleHideAssets = (ids: string[]) => handlePromiseError(memoryManager.hideAssets(ids));

  let gridWidth = $state(0);
  let viewportHeight = $state(0);
  let gridBarHeight = $state(0);
  const galleryViewport: Viewport = $derived({ height: viewportHeight, width: gridWidth });

  $effect(() => {
    if (current) {
      return;
    }

    handlePromiseError(goto(memoryManager.memoriesHref, { replaceState: true, noScroll: true }));
  });
</script>

<svelte:window bind:innerHeight={viewportHeight} />
<svelte:document
  use:shortcuts={showGrid && !assetViewerManager.isViewing && !assetMultiSelectManager.selectionActive
    ? [{ shortcut: { key: 'Escape' }, onShortcut: () => close() }]
    : []}
/>

<section
  id="memory-viewer"
  data-sveltekit-noscroll
  class="dark w-full"
  use:scrollMemoryClearer={{ routeStartsWith: Route.memories() }}
>
  {#if current}
    {#key current.memory.id}
      {#if current.memory.type === MemoryType.Birthday && !showGrid}
        <div class="pointer-events-none fixed inset-x-0 -top-12 z-50 flex h-screen justify-center overflow-hidden">
          <BirthdayConfetti
            x={[-5, 5]}
            y={[0, 0.1]}
            delay={[0, 1500]}
            duration={4000}
            amount={200}
            fallDistance="100vh"
          />
        </div>
      {/if}

      <MemoryFilm
        bind:this={film}
        bind:current={filmAsset}
        memory={current.memory}
        assetId={current.asset.id}
        active={!showGrid && !assetViewerManager.isViewing}
        name={filmName}
        line={filmLine}
        title={cardTitle}
        cover={facts?.cover}
        {focus}
        {settled}
        story={storyHidden ? null : story}
        {tracks}
        {place}
        photoSeconds={authManager.preferences.memories.duration}
        nextMemory={current.nextMemory}
        onClose={close}
        onAllPhotos={showAllPhotos}
        onNextMemory={current.nextMemory ? () => goto(current.nextMemory!.href) : undefined}
      >
        {#snippet actions()}
          <IconButton
            icon={current.memory.isSaved ? mdiHeart : mdiHeartOutline}
            shape="round"
            variant="ghost"
            color="secondary"
            aria-label={current.memory.isSaved ? $t('unfavorite') : $t('favorite')}
            onclick={() => memoryManager.toggleCurrentMemorySaved()}
          />
          {#if shownInfo}
            <IconButton
              href={viewInTimelineHref(shownInfo)}
              icon={mdiImageSearch}
              aria-label={$t('view_in_timeline')}
              color="secondary"
              variant="ghost"
              shape="round"
            />
          {/if}
          <!-- Local Omarchy layer: no ⋮ with nothing in it (another account's memory, no story, no video) -->
          {#if removable || photoRemovable || filmVideos.available || story}
            <ButtonContextMenu
              icon={mdiDotsVertical}
              title={$t('menu')}
              onclick={() => {
                film?.pause();
                void syncTo(filmAsset);
              }}
              direction="left"
              size="medium"
              align="bottom-right"
            >
              {#if removable}
                <MenuOption
                  onClick={() => memoryManager.deleteCurrentMemory(cardTitle)}
                  text={$t('remove_memory')}
                  icon={mdiCardsOutline}
                />
              {/if}
              {#if photoRemovable}
                <MenuOption
                  onClick={() => removePhoto()}
                  text={$t('remove_photo_from_memory')}
                  icon={mdiImageMinusOutline}
                />
              {/if}
              {#if filmVideos.available}
                <MenuOption
                  onClick={() => saveAsVideo()}
                  text={$t('memory_film_save_video')}
                  icon={mdiMovieOpenOutline}
                />
              {/if}
              {#if story}
                <MenuOption
                  onClick={() => setStoryHidden(!storyHidden)}
                  text={storyHidden ? $t('ai_story_show') : $t('ai_story_hide')}
                  icon={storyHidden ? mdiTextBoxOutline : mdiTextBoxRemoveOutline}
                />
              {/if}
            </ButtonContextMenu>
          {/if}
        {/snippet}
        {#snippet extra()}
          {#if birthdayAge !== undefined}
            {` · ${$t('birthday_memory_age', { values: { age: birthdayAge } })}`}
          {/if}
        {/snippet}
      </MemoryFilm>
    {/key}

    {#if showGrid}
      <!-- All photos: the memory's photos as a grid, under a slim bar with the way back into the film -->
      <div class="memory-grid">
        {#if assetMultiSelectManager.selectionActive}
          <div class="dark sticky top-0 z-1">
            <AssetSelectControlBar>
              {@const Actions = getAssetBulkActions($t)}
              <CommandPaletteDefaultProvider name={$t('assets')} actions={Object.values(Actions)} />

              <ActionButton action={Actions.CreateSharedLink} />
              <IconButton
                shape="round"
                color="secondary"
                variant="ghost"
                aria-label={$t('select_all')}
                icon={mdiSelectAll}
                onclick={handleSelectAll}
              />

              <!-- Local Omarchy layer: Add to album by its name, the ink primary, as on Photos -->
              <span class="ws-primary-action ws-select-labelled contents"
                ><ActionButton action={Actions.AddToAlbum} type="button" /></span
              >

              <FavoriteAction removeFavorite={assetMultiSelectManager.isAllFavorite} />

              <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
                <DownloadAction menuItem />
                <ChangeDate menuItem />
                <ChangeDescription menuItem />
                <ChangeLocation menuItem />
                <ArchiveAction
                  menuItem
                  unarchive={assetMultiSelectManager.isAllArchived}
                  onArchive={handleHideAssets}
                />
                <ActionMenuItem action={Actions.Tag} />
                <DeleteAssets menuItem onAssetDelete={handleHideAssets} />
              </ButtonContextMenu>
            </AssetSelectControlBar>
          </div>
        {:else}
          <header class="memory-grid-bar" bind:clientHeight={gridBarHeight}>
            <IconButton
              shape="round"
              variant="ghost"
              color="secondary"
              icon={mdiClose}
              aria-label={$t('close')}
              onclick={close}
            />
            <div class="memory-grid-title">
              <h1>{cardTitle}</h1>
              <p lang={$locale}>{countText}</p>
            </div>
            <button type="button" class="memory-grid-play" onclick={() => (showGrid = false)}>
              <Icon icon={mdiPlay} size="1.25rem" aria-hidden />
              <span>{$t('play')}</span>
            </button>
          </header>
        {/if}

        <div id="gallery-memory" class="memory-grid-photos" bind:clientWidth={gridWidth}>
          <GalleryViewer
            assets={current.memory.assets}
            viewerAssets={current.viewerAssets}
            viewport={galleryViewport}
            assetInteraction={assetMultiSelectManager}
            slidingWindowOffset={gridBarHeight}
            arrowNavigation={false}
            enableGrouping
          />
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  /* the theme's own dark ground, as the photo viewer's islands take it */
  .memory-grid {
    min-height: 100dvh;
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    padding-inline: max(0.5rem, env(safe-area-inset-left, 0px)) max(0.5rem, env(safe-area-inset-right, 0px));
  }
  /* the bar: the way out, the memory's name and count, and Play back into the film (ink inverted: the action) */
  .memory-grid-bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    padding: 0.4rem 0;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--ws-hairline);
    background: var(--immich-ui-light);
  }
  .memory-grid-title {
    flex: 1;
    min-width: 0;
  }
  .memory-grid-title h1 {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: var(--ws-text-bar);
    font-weight: 650;
    font-stretch: 75%;
    line-height: 1.1;
    letter-spacing: -0.01em;
    word-spacing: 0.06em;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .memory-grid-title p {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--immich-ui-muted);
  }
  .memory-grid-play {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.95rem 0.5rem 0.75rem;
    border-radius: var(--ws-radius);
    background: var(--immich-ui-dark);
    color: var(--immich-ui-light);
    font-size: var(--ws-text-ui);
    font-weight: 600;
  }
  .memory-grid-play:hover {
    background: color-mix(in oklab, var(--immich-ui-dark) 85%, var(--ws-accent));
  }
  .memory-grid-play:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }
  .memory-grid-photos {
    padding-bottom: 2rem;
  }
</style>
