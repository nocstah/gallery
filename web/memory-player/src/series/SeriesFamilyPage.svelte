<script lang="ts">
  // Local Omarchy layer: the family page of "A memory a day, from the beginning" (Curator's
  // docs/memory-series-design.md, section 4), the second page of the public player, at /days/<key>/. Phone first and
  // calm, on the link page's neutral faces (style.css): the series' name and what it is in one line, the newest memory
  // large (its cover, title and line, the day it came: "Today", "Yesterday", else the weekday and the date in the
  // reader's language) with Play and All photos, then the earlier days as rows, and Earlier for the 14 before them.
  // Play is the film Kioku plays (MemoryFilm), full screen, from that day's routes, its dates the month and year only;
  // as Room chains its films, the day before follows when it ends. All photos is the day's grid: a photo opens the film
  // from it, a clip plays whole with its sound. Before day 1 the page says when the first memory comes. A password, an
  // ended page and a list that would not load say so in the shared memory's own words. Nothing is cached: every Play
  // and All photos asks for the day afresh, so a memory taken off is gone at once.
  import { unlockFilmSound } from '../../../src/lib/components/memories/film/film-music.svelte';
  import MemoryFilm from '../../../src/lib/components/memories/film/MemoryFilm.svelte';
  import { daysFromToday, seriesDate, seriesLongDate } from '../../../src/lib/gallery/series/series-days';
  import { Icon, LoadingSpinner } from '@immich/ui';
  import { mdiImageMultipleOutline, mdiPlay, mdiRefresh } from '@mdi/js';
  import { onMount, tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import SeriesFamilyClip from './SeriesFamilyClip.svelte';
  import SeriesFamilyGrid from './SeriesFamilyGrid.svelte';
  import {
    enterFullscreen,
    familyDayKey,
    familyPage,
    filmAssets,
    leaveFullscreen,
    offersHomeScreen,
    putHomeScreenHintAway,
    type FamilyListDay,
    type SeriesDay,
  } from './series-family';

  type Props = {
    /** the key in the page's address, encoded for a path */
    linkKey: string;
    /** the reader's language, for the days and dates */
    reader?: string;
  };

  let { linkKey, reader = navigator.language }: Props = $props();

  const page = familyPage(linkKey);

  // the list
  let status = $state<'loading' | 'ready' | 'password' | 'ended' | 'failed'>('loading');
  let name = $state('');
  let language = $state('en');
  let firstDay = $state<string | null>(null);
  let days = $state<FamilyListDay[]>([]);
  let more = $state(false);
  let earlier = $state<'idle' | 'loading' | 'failed'>('idle');
  /** the day being asked for, for Play or All photos: its buttons wait */
  let opening = $state<number>();
  /** the day that would not load: it says so under its buttons */
  let failedDay = $state<number>();
  // the password
  let password = $state('');
  let unlocking = $state(false);
  let unlockFailed = $state<'password' | 'load'>();

  // over the list: the film, the grid and a clip, in the order they were opened; back goes to the one under
  type View = 'film' | 'grid' | 'clip';
  let stack = $state<View[]>([]);
  let open = $state<SeriesDay>();
  let filmAsset = $state('');
  let clipAsset = $state<string>();
  let reducedMotion = $state(false);
  let homeScreen = $state(offersHomeScreen());

  const view = $derived(stack.at(-1));
  const newest = $derived(days.at(0));
  const earlierDays = $derived(days.slice(1));
  const alt = (asset: { type: string }) => $t(asset.type === 'VIDEO' ? 'video' : 'image');
  const media = $derived(open ? page.media(open.n, alt) : undefined);
  const assets = $derived(open ? filmAssets(open) : []);
  // the day before the open one follows its film, as Room's films follow each other
  const before = $derived.by(() => {
    const at = open ? days.findIndex(({ n }) => n === open?.n) : -1;
    return at === -1 ? undefined : days[at + 1];
  });

  const dayWords = (day: string) => {
    const key = familyDayKey(day);
    return key ? $t(key) : seriesDate(day, reader);
  };
  const firstComes = $derived(
    status === 'ready' && days.length === 0 && !!firstDay && daysFromToday(firstDay) >= 0 ? firstDay : undefined,
  );

  const load = async () => {
    status = 'loading';
    earlier = 'idle';
    failedDay = undefined;
    stack = [];
    try {
      const answer = await page.index();
      if ('state' in answer) {
        status = answer.state;
        return;
      }
      ({ name, language, first_day: firstDay, days, more } = answer.data);
      if (name) {
        document.title = name;
      }
      status = 'ready';
    } catch {
      status = 'failed';
    }
  };

  const loadEarlier = async () => {
    const oldest = days.at(-1);
    if (!oldest || earlier === 'loading') {
      return;
    }
    earlier = 'loading';
    try {
      const answer = await page.index(oldest.n);
      if ('state' in answer) {
        earlier = 'idle';
        status = answer.state;
        return;
      }
      const known = new Set(days.map(({ n }) => n));
      days = [...days, ...answer.data.days.filter(({ n }) => !known.has(n))];
      more = answer.data.more;
      earlier = 'idle';
    } catch {
      earlier = 'failed';
    }
  };

  /** a day's film and photos, asked for afresh; a day gone (taken off, or the page ended) has the list asked again */
  const fetchDay = async (n: number): Promise<SeriesDay | undefined> => {
    failedDay = undefined;
    try {
      const answer = await page.day(n);
      if (!('state' in answer)) {
        if (answer.data.assets.length > 0) {
          return answer.data;
        }
        failedDay = n;
      } else if (answer.state === 'password') {
        status = 'password';
      } else {
        await load();
      }
    } catch {
      failedDay = n;
    }
  };

  // the button that opened the film or the grid has the focus again once the list is back
  let opener: HTMLElement | undefined;
  $effect(() => {
    if (view === undefined && opener) {
      const focused = opener;
      opener = undefined;
      void tick().then(() => focused.focus({ preventScroll: true }));
    }
  });

  const openDay = async (n: number, then: (day: SeriesDay) => void) => {
    if (opening !== undefined) {
      return;
    }
    opening = n;
    const from = document.activeElement;
    try {
      const day = await fetchDay(n);
      if (day) {
        opener = from instanceof HTMLElement && from !== document.body ? from : undefined;
        open = day;
        then(day);
      }
    } finally {
      opening = undefined;
    }
  };

  // here, in the press: the day and its first photo may take seconds, and a browser allows sound and all of the screen
  // only from a press
  const pressedFilm = () => {
    unlockFilmSound();
    enterFullscreen();
  };

  const play = async (n: number) => {
    pressedFilm();
    await openDay(n, (day) => {
      filmAsset = day.assets[0].id;
      stack = ['film'];
    });
    if (view !== 'film') {
      leaveFullscreen();
    }
  };

  const allPhotos = (n: number) => openDay(n, () => (stack = ['grid']));

  /** a view on top: the one already open under it comes back up, the rest go */
  const show = (next: View) => {
    const at = stack.indexOf(next);
    stack = at === -1 ? [...stack, next] : stack.slice(0, at + 1);
  };
  const back = () => (stack = stack.slice(0, -1));

  // from the grid: a clip on its own with its sound, a photo in the film from that photo
  const fromGrid = (id: string) => {
    if (open?.assets.find((asset) => asset.id === id)?.type === 'VIDEO') {
      clipAsset = id;
      show('clip');
      return;
    }
    pressedFilm();
    filmAsset = id;
    show('film');
  };

  const playFromGrid = () => {
    if (open) {
      pressedFilm();
      filmAsset = open.assets[0].id;
      show('film');
    }
  };

  // the film ended (or a person moved on from its last photo): the day before plays next, through black
  const playBefore = async () => {
    const next = before;
    if (!next) {
      return;
    }
    const day = await fetchDay(next.n);
    if (day) {
      open = day;
      filmAsset = day.assets[0].id;
      stack = ['film'];
    } else {
      stack = [];
    }
  };

  const unlock = async (event: SubmitEvent) => {
    event.preventDefault();
    unlocking = true;
    unlockFailed = undefined;
    try {
      if (await page.login(password)) {
        password = '';
        stack = [];
        await load();
      } else {
        unlockFailed = 'password';
      }
    } catch {
      unlockFailed = 'load';
    } finally {
      unlocking = false;
    }
  };

  onMount(() => {
    void load();
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => (reducedMotion = query.matches);
    change();
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  });

  // all of the screen is the film's: back under it, the page has its browser again
  $effect(() => {
    if (view !== 'film') {
      leaveFullscreen();
    }
  });

  // the list holds still under the film, the grid and a clip
  $effect(() => {
    if (!view) {
      return;
    }
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = overflow;
    };
  });
</script>

{#snippet actions(day: FamilyListDay, titleId: string)}
  <div class="family-actions">
    {#if failedDay === day.n}
      <p class="family-failed" role="alert">{$t('memory_share_load_failed')}</p>
    {/if}
    <button
      type="button"
      class="memory-play"
      disabled={opening !== undefined}
      aria-describedby={titleId}
      onclick={() => play(day.n)}
    >
      {#if opening === day.n}
        <LoadingSpinner size="small" />
      {:else}
        <Icon icon={mdiPlay} size="20" aria-hidden />
      {/if}
      {$t('memory_series_play')}
    </button>
    <button
      type="button"
      class="family-quiet"
      disabled={opening !== undefined}
      aria-describedby={titleId}
      onclick={() => allPhotos(day.n)}
    >
      <Icon icon={mdiImageMultipleOutline} size="20" aria-hidden />
      {$t('all_photos')}
    </button>
  </div>
{/snippet}

{#if status === 'ready'}
  <main class="family" inert={!!view} aria-busy={opening !== undefined || undefined} data-testid="series-family-page">
    <header class="family-head">
      <h1 class="family-name" lang={language}>{name}</h1>
      <p class="family-about">{$t('memory_series_page_line')}</p>
    </header>

    {#if newest}
      <article class="family-newest" data-testid="series-family-newest" data-n={newest.n}>
        <!-- the cover plays too, for a finger; Play is the button a keyboard and a screen reader have -->
        <button
          type="button"
          class="family-newest-cover"
          tabindex="-1"
          aria-hidden="true"
          disabled={opening !== undefined}
          onclick={() => play(newest.n)}
        >
          <img src={page.photo(newest.n, newest.cover, 'preview')} alt="" draggable="false" />
        </button>
        <div class="family-newest-words">
          <p class="family-when" data-testid="series-family-when">{dayWords(newest.day)}</p>
          <h2 class="family-newest-title" id="family-day-{newest.n}" lang={language}>{newest.title}</h2>
          {#if newest.line}
            <p class="family-line" lang={language}>{newest.line}</p>
          {/if}
          {@render actions(newest, `family-day-${newest.n}`)}
        </div>
      </article>
    {:else if firstComes}
      <p class="family-first" data-testid="series-family-first">
        {$t('memory_series_first_on', { values: { date: seriesLongDate(firstComes, reader) } })}
      </p>
    {/if}

    {#if homeScreen}
      <p class="family-home-screen" data-testid="series-family-home-screen">
        <span>{$t('memory_series_home_screen')}</span>
        <button
          type="button"
          class="family-home-screen-away"
          onclick={() => {
            homeScreen = false;
            putHomeScreenHintAway();
          }}
        >
          {$t('close')}
        </button>
      </p>
    {/if}

    {#if earlierDays.length > 0}
      <ol class="family-days">
        {#each earlierDays as day (day.n)}
          <li class="family-day" data-testid="series-family-day" data-n={day.n}>
            <button
              type="button"
              class="family-day-cover"
              tabindex="-1"
              aria-hidden="true"
              disabled={opening !== undefined}
              onclick={() => play(day.n)}
            >
              <img src={page.photo(day.n, day.cover, 'thumbnail')} alt="" loading="lazy" draggable="false" />
            </button>
            <div class="family-day-words">
              <p class="family-when" data-testid="series-family-when">{dayWords(day.day)}</p>
              <h3 class="family-day-title" id="family-day-{day.n}" lang={language}>{day.title}</h3>
              {#if day.line}
                <p class="family-line" lang={language}>{day.line}</p>
              {/if}
            </div>
            {@render actions(day, `family-day-${day.n}`)}
          </li>
        {/each}
      </ol>
    {/if}

    {#if more}
      <div class="family-more">
        <button type="button" class="family-quiet" disabled={earlier === 'loading'} onclick={loadEarlier}>
          {$t(earlier === 'loading' ? 'loading' : 'memory_series_earlier')}
        </button>
      </div>
    {/if}
    {#if earlier === 'failed'}
      <p class="family-failed" role="alert">{$t('memory_share_load_failed')}</p>
    {/if}
  </main>

  {#if open && media}
    {#if stack.includes('film')}
      <div hidden={view !== 'film'}>
        {#key open.n}
          <MemoryFilm
            {media}
            language={open.language}
            {reducedMotion}
            memory={{ id: `series-day-${open.n}`, assets }}
            assetId={filmAsset}
            active={view === 'film'}
            name={open.title}
            line={open.line}
            title={open.title}
            cover={open.cover}
            focus={open.focus}
            settled
            story={null}
            tracks={open.tracks}
            photoSeconds={open.photoSeconds}
            dates="month"
            onClose={back}
            onAllPhotos={() => show('grid')}
            onNextFilm={before ? playBefore : undefined}
          />
        {/key}
      </div>
    {/if}
    {#if stack.includes('grid')}
      <SeriesFamilyGrid
        day={open}
        {media}
        shown={view === 'grid' || view === 'clip'}
        active={view === 'grid'}
        onBack={back}
        onPlay={playFromGrid}
        onOpen={fromGrid}
      />
    {/if}
    {#if view === 'clip' && clipAsset}
      <SeriesFamilyClip src={media.video(clipAsset)} poster={media.preview(clipAsset)} onClose={back} />
    {/if}
  {/if}
{:else}
  <main class="memory-access" data-testid="series-family-access" data-state={status}>
    {#if status === 'password'}
      <form onsubmit={unlock}>
        <h1>{$t('memory_share_password_title')}</h1>
        <label for="family-password">{$t('password')}</label>
        <input
          id="family-password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
          disabled={unlocking}
        />
        <button type="submit" class="memory-play" disabled={unlocking}>
          {$t(unlocking ? 'loading' : 'memory_share_unlock')}
        </button>
      </form>
      {#if unlockFailed}
        <p role="alert">
          {$t(unlockFailed === 'password' ? 'memory_share_password_failed' : 'memory_share_load_failed')}
        </p>
      {/if}
    {:else if status === 'ended'}
      <h1>{$t('memory_share_unavailable_title')}</h1>
      <p>{$t('memory_share_unavailable')}</p>
    {:else if status === 'failed'}
      <p role="alert">{$t('memory_share_load_failed')}</p>
      <button type="button" class="memory-play" onclick={load}>
        <Icon icon={mdiRefresh} size="20" aria-hidden />
        {$t('retry')}
      </button>
    {:else}
      <p role="status">{$t('loading')}</p>
    {/if}
  </main>
{/if}

<style>
  /* one column on the ground, a phone's width to a reading width, inside the screen's safe edges */
  .family {
    width: min(100%, 60rem);
    margin-inline: auto;
    padding: max(1.75rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      max(3rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  }
  .family-head {
    padding-bottom: 1.75rem;
  }
  .family-name {
    font: 800 clamp(2rem, 1.4rem + 3vw, 3.5rem) / 1.05 var(--ws-font-display);
    text-wrap: balance;
  }
  .family-about {
    max-width: 40ch;
    margin-top: 0.5rem;
    color: var(--public-memory-muted);
    line-height: 1.5;
  }
  /* the newest memory: its cover large, its words under it on a phone and beside it on a wider screen */
  .family-newest {
    display: grid;
    gap: 1rem;
    padding-bottom: 1.75rem;
    border-bottom: 1px solid var(--public-memory-hairline);
  }
  .family-newest-cover,
  .family-day-cover {
    display: block;
    overflow: hidden;
    border-radius: var(--ws-radius);
    background: var(--public-memory-hairline);
  }
  .family-newest-cover {
    width: 100%;
    aspect-ratio: 4 / 3;
  }
  .family-newest-cover img,
  .family-day-cover img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .family-when,
  .family-line {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-meta);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--public-memory-muted);
  }
  .family-newest-title {
    margin-top: 0.35rem;
    font: 750 clamp(1.5rem, 1.2rem + 1.5vw, 2.25rem) / 1.15 var(--ws-font-display);
    text-wrap: balance;
  }
  .family-line {
    margin-top: 0.35rem;
  }
  .family-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  /* the quiet action beside Play: ink on the ground inside a hairline */
  .family-quiet {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 48px;
    padding: 0.65rem 1.1rem;
    border-radius: var(--ws-radius);
    box-shadow: inset 0 0 0 1px var(--public-memory-boundary);
    color: var(--public-memory-ink);
    font-weight: 600;
  }
  .family-quiet:hover {
    background: var(--public-memory-hairline);
  }
  /* the earlier days: a row each, split by hairlines edge to edge */
  .family-days {
    list-style: none;
  }
  .family-day {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: 0.25rem 1rem;
    padding-block: 1rem;
    border-bottom: 1px solid var(--public-memory-hairline);
  }
  .family-day-cover {
    width: 5rem;
    aspect-ratio: 1;
  }
  .family-day-words {
    min-width: 0;
  }
  .family-day-title {
    margin-top: 0.2rem;
    font: 700 1.125rem / 1.25 var(--ws-font-display);
    text-wrap: balance;
  }
  .family-day .family-actions {
    grid-column: 2;
    margin-top: 0.5rem;
  }
  .family-more {
    margin-top: 1.5rem;
  }
  .family-home-screen {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1.5rem;
    padding: 0.75rem 1rem;
    border-radius: var(--ws-radius);
    box-shadow: inset 0 0 0 1px var(--public-memory-boundary);
    color: var(--public-memory-ink);
    line-height: 1.5;
  }
  .family-home-screen-away {
    flex: none;
    min-height: 44px;
    padding-inline: 0.5rem;
    font-weight: 600;
    text-decoration: underline;
  }
  .family-first,
  .family-failed {
    max-width: 40ch;
    line-height: 1.5;
  }
  .family-failed {
    margin-top: 1rem;
    font-weight: 500;
  }
  /* a day that would not load says so over its own buttons */
  .family-actions .family-failed {
    flex-basis: 100%;
    margin-top: 0;
  }
  @media (min-width: 48rem) {
    .family-newest {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      align-items: end;
      gap: 1.5rem;
    }
    .family-newest-cover {
      aspect-ratio: 3 / 2;
    }
    .family-day {
      grid-template-columns: 7rem minmax(0, 1fr) auto;
      align-items: center;
      gap: 1rem 1.5rem;
    }
    .family-day-cover {
      width: 7rem;
    }
    .family-day .family-actions {
      grid-column: auto;
      margin-top: 0;
    }
  }
</style>
