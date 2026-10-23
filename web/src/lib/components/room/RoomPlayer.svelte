<script lang="ts" module>
  // whether Room put the window in full screen, kept across Room's own pages (an empty Room's Play 2025 opens another)
  // so that only Room's leaving takes it out again
  let enteredFullScreen = false;
</script>

<script lang="ts">
  // Local Omarchy layer: Room (DESIGN.md, Room), the archive across the room: full screen without the shell, for the
  // AORUS when the owner sits back and later a TV's browser. It plays the film of a memory (MemoryFilm, dressed for
  // three metres) one after another: today's memories, then the albums Curator keeps for the TV once accepted, and
  // round again; or one album, or one year (room-reels.ts, room-source.ts). Space or a remote's OK pauses, ← and →
  // step a photo, ↑ and ↓ go to the film before and after, M mutes, Escape or Back leaves; the screen stays awake
  // while it plays (room-awake.ts). Music and stories are Curator's, for its owner only (curatorIsMine): a family
  // account's Room is silent. Nothing here changes anything: no hearts, no edits, no Save as video.
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import MemoryFilm from '$lib/components/memories/film/MemoryFilm.svelte';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { privateFilmMedia } from '$lib/components/memories/film/private-film-media';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { memoryFacts } from '$lib/managers/memory-facts.svelte';
  import { Route } from '$lib/route';
  import { locale } from '$lib/stores/preferences.store';
  import { memoryLaneTitle } from '$lib/utils';
  import { curator, curatorIsMine, type MemoryTrack, type Story } from '$lib/utils/curator';
  import { memoryCardCount } from '$lib/utils/memory-cards';
  import { formatMemoryTime, memoryCount, memoryFilmWords, type MemoryFilmWords } from '$lib/utils/memory-title';
  import {
    AssetTypeEnum,
    getAlbumInfo,
    getAssetInfo,
    isHttpError,
    searchAssets,
    type AssetResponseDto,
  } from '@immich/sdk';
  import { Icon, isModalOpen } from '@immich/ui';
  import { mdiClose, mdiFullscreen, mdiFullscreenExit, mdiPlay, mdiRefresh, mdiSkipNext } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { onMount, tick, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { fade } from 'svelte/transition';
  import { ScreenAwake } from './room-awake';
  import { roomOpening, wantsCamera } from './room-opening';
  import { albumReel, roomCaption, yearReel, type RoomReel, type RoomRequest, type YearFilm } from './room-reels';
  import { loadAlbumAssets, loadToday, loadYear } from './room-source';

  interface Props {
    request: RoomRequest;
  }

  let { request }: Props = $props();

  type Status = 'loading' | 'playing' | 'empty' | 'error';
  /** a film's photos, read once: a memory brings its own; an album's and a year's are asked for when they come up */
  type Held = { assets: AssetResponseDto[]; year?: YearFilm };
  type MemoryReel = Extract<RoomReel, { kind: 'memory' }>;

  /** asset details kept for the captions: the photo on screen and the next two, and what came before them */
  const INFO_KEPT = 80;
  /** the black wait says what it waits for only after this, so a quick start is just black */
  const WAIT_WORDS_MS = 700;

  let status = $state<Status>('loading');
  let reels = $state.raw<RoomReel[]>([]);
  let index = $state(0);
  // bumped when the chain comes round to the same film again (a lone album or year, played again)
  let round = $state(0);
  const held = new SvelteMap<string, Held>();
  const reading = new SvelteSet<string>();

  let film = $state<ReturnType<typeof MemoryFilm>>();
  let filmAsset = $state<string | undefined>();
  let filmPaused = $state(false);
  let fullScreen = $state(typeof document !== 'undefined' && !!document.fullscreenElement);
  let cameFromApp = false;
  let destroyed = false;

  const canFullScreen =
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function' &&
    document.fullscreenEnabled;

  // ---- the chain ----

  const holdOf = (reel: RoomReel): Held | undefined =>
    reel.kind === 'memory' ? { assets: reel.memory.assets } : held.get(reel.key);

  const read = async (reel: RoomReel) => {
    if (reel.kind === 'memory' || held.has(reel.key) || reading.has(reel.key)) {
      return;
    }
    reading.add(reel.key);
    try {
      if (reel.kind === 'album') {
        held.set(reel.key, { assets: await loadAlbumAssets(reel.album.id) });
      } else {
        const year = await loadYear(reel.year, authManager.user.id);
        held.set(reel.key, { assets: year.assets, year });
      }
    } catch {
      // a film that cannot be read is left out of the chain, as an empty one is
      held.set(reel.key, { assets: [] });
    } finally {
      reading.delete(reel.key);
    }
  };

  const start = async () => {
    status = 'loading';
    held.clear();
    let found: RoomReel[];
    try {
      if (request.kind === 'today') {
        found = await loadToday({ memories: authManager.preferences.memories.enabled, today: DateTime.now() });
        memoryFacts.request(
          found.filter((reel): reel is MemoryReel => reel.kind === 'memory').map((reel) => reel.memory.id),
        );
      } else if (request.kind === 'album') {
        const albumId = request.albumId;
        const album = await getAlbumInfo({ id: albumId }).catch((error: unknown) => {
          if (isHttpError(error) && [400, 403, 404].includes(error.status)) {
            return undefined;
          }
          throw error;
        });
        found = album ? [albumReel(album)] : [];
      } else {
        found = [yearReel(request.year)];
      }
    } catch {
      if (!destroyed) {
        status = 'error';
      }
      return;
    }
    if (destroyed) {
      return;
    }
    reels = found;
    index = 0;
    status = found.length > 0 ? 'playing' : 'empty';
  };

  const reel = $derived(status === 'playing' ? reels[index] : undefined);
  const reelHeld = $derived(reel ? holdOf(reel) : undefined);
  const filmReel = $derived(reel && reelHeld && reelHeld.assets.length > 0 ? reel : undefined);
  const filmSource = $derived(filmReel && reelHeld ? { id: filmReel.key, assets: reelHeld.assets } : undefined);
  const filmKey = $derived(filmReel ? `${filmReel.key}#${round}` : '');

  // the film on screen is read when it comes up, and the next one while it plays
  $effect(() => {
    const now = reel;
    if (!now) {
      return;
    }
    untrack(() => {
      void read(now);
      askCurator(now);
      const after = reels.length > 1 ? reels[(index + 1) % reels.length] : undefined;
      if (after && filmReel) {
        void read(after);
        askCurator(after);
      }
    });
  });

  // a film with nothing to play (an album emptied, a year without photos) leaves the chain; the next takes its place
  $effect(() => {
    const now = reel;
    const content = reelHeld;
    if (!now || !content || content.assets.length > 0) {
      return;
    }
    untrack(() => {
      reels = reels.filter(({ key }) => key !== now.key);
      if (reels.length === 0) {
        status = 'empty';
      } else if (index >= reels.length) {
        index = 0;
      }
    });
  });

  const step = (by: 1 | -1) => {
    if (reels.length === 0) {
      return;
    }
    if (reels.length === 1) {
      round++;
    }
    index = (index + by + reels.length) % reels.length;
  };
  const goNext = () => step(1);
  const goPrevious = () => step(-1);

  // ---- what Curator knows: a memory's facts, story and songs, an album's story (its owner only) ----

  const stories = new SvelteMap<string, Story | null>();
  const songs = new SvelteMap<string, MemoryTrack[]>();
  const asked = new SvelteSet<string>();

  const askCurator = (target: RoomReel) => {
    if (!curatorIsMine() || asked.has(target.key) || target.kind === 'year') {
      return;
    }
    asked.add(target.key);
    const subject = target.kind === 'memory' ? { memory: target.memory.id } : { album: target.album.id };
    curator
      .story(subject)
      .then((answer) => stories.set(target.key, answer.story ?? null))
      .catch(() => stories.set(target.key, null));
    if (target.kind === 'memory') {
      curator
        .memoryMusic(target.memory.id, 3)
        .then((answer) => songs.set(target.key, Array.isArray(answer.tracks) ? answer.tracks : []))
        .catch(() => songs.set(target.key, []));
    }
  };

  // the memory page's ⋮ hides the story and brings it back, per browser: Room keeps that choice
  const storyHidden = (() => {
    try {
      return localStorage.getItem('curator-memory-story-hidden') === '1';
    } catch {
      return false;
    }
  })();

  const settledOf = (target: RoomReel) =>
    openings.has(target.key) &&
    (target.kind !== 'memory' ||
      !curatorIsMine() ||
      (memoryFacts.settled(target.memory.id) && songs.has(target.key) && stories.has(target.key)));

  // ---- the opening: the picture under the title card, by the gate before the TV (room-opening.ts) ----

  /** of a film's photos, those asked about a camera's data at most (the first ones the gate would pass) */
  const CAMERA_ASKED = 48;
  /** the opening waits this long for Curator's cover at most */
  const COVER_PATIENCE_MS = 1000;
  const openings = new SvelteMap<string, string | null>();
  const openingAsked = new SvelteSet<string>();

  const chooseOpening = async (target: RoomReel, assets: AssetResponseDto[]) => {
    if (openingAsked.has(target.key)) {
      return;
    }
    openingAsked.add(target.key);
    const asked = assets
      .filter((asset) => wantsCamera(asset))
      .slice(0, CAMERA_ASKED)
      .map(({ id }) => id);
    const camera =
      asked.length === 0
        ? Promise.resolve(new Set<string>())
        : searchAssets({
            metadataSearchDto: {
              // the photos of my own, my partners' and the Spaces on my timeline, as Room plays them
              withSharedSpaces: true,
              filter: { or: asked.map((id) => ({ id: { eq: id } })), make: { ne: null } },
              size: asked.length,
            },
          })
            .then(({ assets: found }) => new Set(found.items.map(({ id }) => id)))
            // without it, the favourites and Live Photos still pass the gate
            .catch(() => new Set<string>());
    if (target.kind === 'memory' && curatorIsMine()) {
      let patience: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        memoryFacts.settle([target.memory.id]),
        new Promise<void>((resolve) => (patience = setTimeout(resolve, COVER_PATIENCE_MS))),
      ]);
      clearTimeout(patience);
    }
    const cover = target.kind === 'memory' ? memoryFacts.get(target.memory.id)?.cover : undefined;
    openings.set(
      target.key,
      roomOpening(assets, { cover, camera: await camera, aspect: innerWidth / Math.max(1, innerHeight) }) ?? null,
    );
  };

  // ---- what each film says: its title, the title card's name and line ----

  const countWords = (count: number, videos: boolean) =>
    $t(videos ? 'memory_video_moments_subtitle' : 'memory_assets_count', { values: { count } });

  const yearLine = (year: YearFilm | undefined) => {
    if (!year) {
      return '';
    }
    if (year.sample) {
      return $t('room_year_sample', { values: { count: year.assets.length, total: year.total } });
    }
    if (year.assets.length < year.favorites) {
      return $t('room_year_favorites_of', { values: { count: year.assets.length, total: year.favorites } });
    }
    return $t('memory_favorites_throwback_subtitle', { values: { count: year.favorites } });
  };

  const wordsOf = (target: RoomReel, content: Held | undefined): MemoryFilmWords => {
    if (target.kind === 'memory') {
      // a card of several memories stands for what they stand for together, as on the memory's own page
      return memoryFilmWords(target.memory, memoryFacts.get(target.memory.id), $locale, {
        fallbackTitle: $memoryLaneTitle,
        count: countWords,
        total: target.card
          ? memoryCardCount(target.card, (memory) => memoryCount(memory, memoryFacts.get(memory.id)))
          : undefined,
      });
    }
    const assets = content?.assets ?? [];
    const count = countWords(
      assets.length,
      assets.length > 0 && assets.every(({ type }) => type === AssetTypeEnum.Video),
    );
    if (target.kind === 'album') {
      const name = target.album.albumName;
      const time = formatMemoryTime(target.album.startDate ?? '', target.album.endDate ?? '', $locale);
      return {
        title: name,
        name,
        line: [time && !name.includes(time) ? time : '', count].filter(Boolean).join(' · '),
        count,
      };
    }
    const year = String(target.year);
    return { title: year, name: year, line: yearLine(content?.year), count };
  };

  const filmWords = $derived(filmReel ? wordsOf(filmReel, reelHeld) : undefined);
  const filmFacts = $derived(filmReel?.kind === 'memory' ? memoryFacts.get(filmReel.memory.id) : undefined);
  // a card of several memories drifts toward the faces in all of them
  const filmFocus = $derived.by(() => {
    if (filmReel?.kind !== 'memory') {
      return undefined;
    }
    const members = filmReel.card?.members;
    return members ? Object.assign({}, ...members.map(({ id }) => memoryFacts.get(id)?.focus ?? {})) : filmFacts?.focus;
  });
  const nextReel = $derived(status === 'playing' && reels.length > 1 ? reels[(index + 1) % reels.length] : undefined);
  const nextTitle = $derived(nextReel ? wordsOf(nextReel, holdOf(nextReel)).title : undefined);

  // the film on screen is given its opening once its photos are in, and the next one while it plays
  $effect(() => {
    const targets = [reel, nextReel].filter((target): target is RoomReel => !!target);
    for (const target of targets) {
      const assets = holdOf(target)?.assets;
      if (assets && assets.length > 0) {
        untrack(() => void chooseOpening(target, assets));
      }
    }
  });

  // ---- the caption: who, where and when, for the photo on screen (its details, asked once, the next two ahead) ----

  const infos = new SvelteMap<string, AssetResponseDto>();
  const infoAsked = new SvelteSet<string>();

  const askInfo = (id: string) => {
    if (infoAsked.has(id)) {
      return;
    }
    infoAsked.add(id);
    getAssetInfo({ ...authManager.params, id })
      .then((asset) => {
        infos.set(id, asset);
        // keep the last few dozen: Room runs for hours
        for (const old of infos.keys()) {
          if (infos.size <= INFO_KEPT) {
            break;
          }
          infos.delete(old);
          infoAsked.delete(old);
        }
      })
      .catch(() => infoAsked.delete(id));
  };

  $effect(() => {
    const id = filmAsset;
    const assets = reelHeld?.assets;
    if (!id || !assets) {
      return;
    }
    untrack(() => {
      askInfo(id);
      const at = assets.findIndex((asset) => asset.id === id);
      for (const ahead of assets.slice(at + 1, at + 3)) {
        askInfo(ahead.id);
      }
    });
  });

  // the story's sentence over it: the caption leaves out what that line already says (the people, the place, the day)
  let storyLine = $state<string | undefined>();
  const caption = $derived.by(() => {
    const info = filmAsset ? infos.get(filmAsset) : undefined;
    return info
      ? roomCaption(info, $locale, (count) => $t('room_caption_more', { values: { count } }), storyLine)
      : undefined;
  });

  // ---- the screen: full, awake while playing ----

  const awake = new ScreenAwake();
  $effect(() => {
    if ((status === 'loading' || status === 'playing') && !filmPaused) {
      awake.hold();
    } else {
      awake.release();
    }
  });

  const enterFullScreen = async () => {
    if (!canFullScreen || document.fullscreenElement) {
      return;
    }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      enteredFullScreen = true;
    } catch {
      // no press to allow it (a page opened cold): the button and F offer it
    }
  };

  // Room's own F and button take the window out of full screen and stay; anything else that does (the browser spends
  // the first Escape on it, before the page hears the key) is leaving Room, so one Escape leaves, as in the film
  let exitingFullScreen = false;

  const toggleFullScreen = () => {
    if (document.fullscreenElement) {
      exitingFullScreen = true;
      void document.exitFullscreen().catch(() => (exitingFullScreen = false));
    } else {
      void enterFullScreen();
    }
  };

  const onFullScreenChange = () => {
    fullScreen = !!document.fullscreenElement;
    if (fullScreen) {
      return;
    }
    const byRoom = exitingFullScreen;
    exitingFullScreen = false;
    if (enteredFullScreen) {
      enteredFullScreen = false;
      if (!byRoom) {
        leave();
      }
    }
  };

  // ---- a remote's and a keyboard's media keys: while a song plays they go to the page's media session, which
  // would pause the song alone; here they play, pause and skip the films ----

  $effect(() => {
    const session = typeof navigator === 'undefined' ? undefined : navigator.mediaSession;
    if (!session || typeof session.setActionHandler !== 'function' || !filmReel) {
      return;
    }
    const handlers: [MediaSessionAction, () => void][] = [
      [
        'play',
        () => {
          if (filmPaused) {
            film?.control('toggle');
          }
        },
      ],
      ['pause', () => film?.pause()],
      ['nexttrack', () => film?.control('next-film')],
      ['previoustrack', () => film?.control('previous-film')],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // an action this browser does not know
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // as above
        }
      }
    };
  });

  // ---- leaving: back where Room was opened from, else to what it played ----

  afterNavigate(({ from }) => {
    if (from?.url) {
      cameFromApp = true;
    }
  });

  // full screen ends with Room, not with one of Room's own pages handing on to another
  beforeNavigate(({ to }) => {
    if (to?.url.pathname !== Route.room() && enteredFullScreen) {
      enteredFullScreen = false;
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    }
  });

  // once: a browser's Escape can both end full screen and reach the page
  let left = false;
  const leave = () => {
    if (left) {
      return;
    }
    left = true;
    if (cameFromApp && history.length > 1) {
      history.back();
      return;
    }
    const home =
      request.kind === 'album'
        ? Route.viewAlbum({ id: request.albumId })
        : request.kind === 'year'
          ? Route.photos({ jump: String(request.year) })
          : Route.photos();
    void goto(home, { replaceState: true });
  };

  // ---- keys while no film is up: Escape or Back leaves, a remote's arrows move between the choices, F ----

  const inField = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');

  let section = $state<HTMLElement>();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isModalOpen() || inField(event.target)) {
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      toggleFullScreen();
      return;
    }
    if (filmReel) {
      // the film has its own keys
      return;
    }
    if (['Escape', 'GoBack', 'BrowserBack', 'XF86Back'].includes(event.key)) {
      event.preventDefault();
      leave();
      return;
    }
    const by = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    const choices = [...(section?.querySelectorAll<HTMLElement>('.room-choice') ?? [])];
    if (by && choices.length > 0) {
      event.preventDefault();
      const at = choices.indexOf(document.activeElement as HTMLElement);
      choices[(at + by + choices.length) % choices.length].focus();
    }
  };

  // the first choice takes the focus, so a remote's OK presses it
  const focusFirst = (node: HTMLElement) => {
    void tick().then(() => node.querySelector<HTMLElement>('.room-choice')?.focus({ preventScroll: true }));
  };

  // a year is a name here, not a number to group ("2,025")
  const lastYear = String(DateTime.now().year - 1);

  onMount(() => {
    void start();
    void enterFullScreen();
    return () => {
      destroyed = true;
      awake.destroy();
    };
  });
</script>

<svelte:document onkeydown={onKeyDown} onfullscreenchange={onFullScreenChange} />

<section class="room" bind:this={section} aria-label={$t('room')} data-testid="room" data-status={status}>
  {#if filmReel && filmSource && filmWords}
    {#key filmKey}
      <MemoryFilm
        media={privateFilmMedia}
        language={$locale}
        reducedMotion={mediaQueryManager.reducedMotion}
        bind:this={film}
        bind:current={filmAsset}
        bind:paused={filmPaused}
        bind:storyLine
        memory={filmSource}
        assetId={filmSource.assets[0].id}
        active
        dress="room"
        name={filmWords.name}
        line={filmWords.line}
        title={filmWords.title}
        cover={openings.get(filmReel.key) ?? filmFacts?.cover}
        focus={filmFocus}
        settled={settledOf(filmReel)}
        story={storyHidden ? null : (stories.get(filmReel.key)?.text ?? null)}
        storyCues={filmReel.kind === 'memory'
          ? storyHidden
            ? []
            : (stories.get(filmReel.key)?.cues ?? [])
          : undefined}
        tracks={songs.get(filmReel.key) ?? []}
        photoSeconds={authManager.preferences.memories.duration}
        {caption}
        onClose={leave}
        onNextFilm={goNext}
        onPreviousFilm={goPrevious}
      >
        {#snippet actions()}
          {#if nextTitle}
            <button
              type="button"
              class="room-next"
              title={$t('up_next')}
              data-testid="room-next"
              onclick={() => film?.control('next-film')}
            >
              <span class="room-next-words">
                <span class="room-next-label">{$t('up_next')}</span>
                <span class="room-next-title">{nextTitle}</span>
              </span>
              <Icon icon={mdiSkipNext} size="1.5rem" aria-hidden />
            </button>
          {/if}
          {#if canFullScreen}
            {#if nextTitle}
              <span class="room-rule" aria-hidden="true"></span>
            {/if}
            <button
              type="button"
              aria-label={fullScreen
                ? $t('media_chrome.exit_fullscreen_mode')
                : $t('media_chrome.enter_fullscreen_mode')}
              title={fullScreen ? $t('media_chrome.exit_fullscreen_mode') : $t('media_chrome.enter_fullscreen_mode')}
              onclick={toggleFullScreen}
            >
              <Icon icon={fullScreen ? mdiFullscreenExit : mdiFullscreen} size="1.5rem" aria-hidden />
            </button>
          {/if}
        {/snippet}
      </MemoryFilm>
    {/key}
  {:else}
    <div class="room-stage">
      <header class="room-head">
        <div class="room-pill">
          <button type="button" class="room-button" aria-label={$t('close')} title={$t('close')} onclick={leave}>
            <Icon icon={mdiClose} size="1.5rem" aria-hidden />
          </button>
        </div>
      </header>

      {#if status === 'empty' || status === 'error'}
        <div class="room-words" data-testid="room-empty" in:fade={{ duration: 400 }}>
          {#if status === 'error'}
            <h1 class="room-title">{$t('room_error_title')}</h1>
          {:else if request.kind === 'album'}
            <h1 class="room-title">{$t('room_album_empty_title')}</h1>
            <p class="room-body">{$t('room_album_empty_body')}</p>
          {:else if request.kind === 'year'}
            <h1 class="room-title">{$t('room_year_empty_title', { values: { year: String(request.year) } })}</h1>
          {:else}
            <h1 class="room-title">{$t('room_empty_title')}</h1>
            <p class="room-body">{curatorIsMine() ? $t('room_empty_body') : $t('room_empty_body_family')}</p>
          {/if}
          <div class="room-choices" use:focusFirst>
            {#if status === 'error'}
              <button type="button" class="room-choice is-primary" onclick={() => void start()}>
                <Icon icon={mdiRefresh} size="1.5rem" aria-hidden />
                <span>{$t('retry')}</span>
              </button>
            {:else if request.kind === 'today'}
              <!-- in place of this Room, so leaving the year's goes back where Room was opened from -->
              <a class="room-choice is-primary" href={Route.room({ year: lastYear })} data-sveltekit-replacestate>
                <Icon icon={mdiPlay} size="1.5rem" aria-hidden />
                <span>{$t('room_play_year_short', { values: { year: lastYear } })}</span>
              </a>
              {#if curatorIsMine()}
                <a class="room-choice" href="/inbox">{$t('room_empty_inbox')}</a>
              {/if}
            {/if}
            <button type="button" class="room-choice" onclick={leave}>{$t('close')}</button>
          </div>
        </div>
      {:else}
        <!-- black first: the line comes only if the wait goes on -->
        <p class="room-wait" in:fade={{ duration: 600, delay: WAIT_WORDS_MS }}>{$t('room_loading')}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* the room is black, as the film is: the photos are the only light in it */
  .room {
    --room-gutter: clamp(1.25rem, 4.8vmin, 6.5rem);
    --room-control: clamp(2.75rem, 6vmin, 8rem);
    --room-icon: clamp(1.375rem, 3.2vmin, 4.25rem);
    position: fixed;
    inset: 0;
    z-index: 40;
    background: #000;
    color: #fff;
  }
  .room-stage {
    position: absolute;
    inset: 0;
    display: grid;
    align-items: end;
    padding: max(var(--room-gutter), env(safe-area-inset-top, 0px))
      max(var(--room-gutter), env(safe-area-inset-right, 0px))
      max(calc(var(--room-gutter) * 1.4), env(safe-area-inset-bottom, 0px))
      max(var(--room-gutter), env(safe-area-inset-left, 0px));
  }
  .room-head {
    position: absolute;
    top: max(var(--room-gutter), env(safe-area-inset-top, 0px));
    left: max(var(--room-gutter), env(safe-area-inset-left, 0px));
  }
  /* the film's own glass: thin smoked, one hairline */
  .room-pill {
    display: flex;
    padding: clamp(3px, 0.4vmin, 8px);
    border: 1px solid var(--ws-glass-edge);
    border-radius: var(--ws-radius);
    background: var(--ws-glass);
  }
  .room-button {
    display: inline-grid;
    place-items: center;
    min-width: var(--room-control);
    height: var(--room-control);
    border-radius: var(--ws-radius);
    color: rgb(255 255 255 / 0.88);
  }
  .room-button:hover {
    color: #fff;
    background: rgb(255 255 255 / 0.1);
  }
  .room-pill :global(svg),
  .room-choice :global(svg) {
    width: var(--room-icon);
    height: var(--room-icon);
  }

  /* ---- nothing to play, or Gallery not answering: words at the foot, as the title card sits ---- */
  .room-words {
    max-width: min(72rem, 100%);
  }
  .room-title {
    max-width: 16ch;
    font-family: var(--font-display);
    font-size: clamp(2.5rem, 9vmin, 12rem);
    font-weight: 800;
    font-stretch: 75%;
    line-height: 0.92;
    letter-spacing: -0.02em;
    word-spacing: 0.06em;
    text-wrap: balance;
  }
  .room-body {
    max-width: 40ch;
    margin-top: 0.9em;
    font-size: clamp(1.0625rem, 3vmin, 4rem);
    font-weight: 450;
    line-height: 1.35;
    text-wrap: pretty;
    color: rgb(255 255 255 / 0.8);
  }
  .room-choices {
    display: flex;
    flex-wrap: wrap;
    gap: clamp(0.5rem, 1.4vmin, 1.75rem);
    margin-top: clamp(1.25rem, 4vmin, 5rem);
  }
  .room-choice {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    min-height: var(--room-control);
    padding: 0 1.1em;
    border: 1px solid rgb(255 255 255 / 0.22);
    border-radius: var(--ws-radius);
    font-size: clamp(0.9375rem, 2.6vmin, 3.25rem);
    font-weight: 600;
    color: rgb(255 255 255 / 0.9);
    background: rgb(255 255 255 / 0.04);
    text-decoration: none;
  }
  .room-choice:hover {
    color: #fff;
    background: rgb(255 255 255 / 0.12);
  }
  /* the next step, white on the black room: with no photo here, nothing it could outshine (over a film, Turn on sound
     is the film's strong glass instead) */
  .room-choice.is-primary {
    padding-inline: 0.9em 1.2em;
    border-color: #fff;
    background: #fff;
    color: #000;
  }
  .room-choice.is-primary:hover {
    background: color-mix(in oklab, #fff 85%, var(--ws-accent));
  }
  .room-choice:focus-visible,
  .room-button:focus-visible,
  .room-next:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 3px;
  }

  /* waiting for the first film: black, then one quiet line */
  .room-wait {
    font-family: var(--ws-font-data);
    font-size: clamp(0.75rem, 2.3vmin, 3rem);
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgb(255 255 255 / 0.6);
  }

  /* ---- in the film's top bar: what comes next (a press goes there), and full screen. The film lays out its own
     buttons there as square icon cells (.film-actions button), so the Up next row names their group to win over that
     (a descendant, not a child: the button reaches the film as a snippet, whose parent Svelte cannot see) ---- */
  :global(.film-actions) .room-next {
    display: inline-flex;
    align-items: center;
    gap: 0.6em;
    max-width: min(38rem, 42vw);
    padding-inline: 0.8em 0.6em;
    text-align: start;
  }
  .room-next-words {
    display: grid;
    min-width: 0;
    line-height: 1.15;
  }
  .room-next-label {
    font-family: var(--ws-font-data);
    font-size: clamp(0.75rem, 1.8vmin, 2.25rem);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(255 255 255 / 0.7);
  }
  .room-next-title {
    overflow: hidden;
    font-size: clamp(0.875rem, 2.4vmin, 3rem);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .room-rule {
    align-self: stretch;
    width: 1px;
    margin-block: clamp(0.4rem, 1.2vmin, 1.5rem);
    background: rgb(255 255 255 / 0.14);
  }

  /* what Curator makes on request (photo books, saved films) waits in a corner of the shell's pages: not on the TV */
  :global(body:has(section.room) .ws-curator-corner) {
    display: none;
  }
</style>
