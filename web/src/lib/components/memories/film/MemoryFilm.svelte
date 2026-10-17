<script lang="ts">
  // Local Omarchy layer: a memory as a full-screen film (DESIGN.md, Memories, The film; the owner's "Full-screen film",
  // 2026-10-16). It plays a plan (film-plan.ts): a title card, then each photo filling the screen and drifting, or
  // shown whole over its own blurred colours where a crop would take too much, videos muted for a few seconds, the
  // story a sentence at a time on one quiet line, Curator's songs under it. Two layers crossfade (the photo on screen
  // and the next, made ready while the first one plays), so however long the memory, two photos are in the page. The
  // drift and the fades are transforms and opacity on the GPU; the script wakes only when something changes. The
  // controls fade after a few seconds and come back with the pointer, a touch or a key.
  //
  // Room (DESIGN.md, Room) plays the same film across the room, one after another: `dress="room"` sets it for three
  // metres (a far bigger title, the photo's "names · place · date" caption at the foot, bigger controls, the pointer
  // hidden, a remote's OK and Back), and `onNextFilm`/`onPreviousFilm` chain it: its end, ↓ and ↑ hand on to the film
  // after or before, the picture and the music fading to black first, where a lone film offers what to do next.
  import { locale } from '$lib/stores/preferences.store';
  import { mediaQueryManager } from '$lib/stores/media-query-manager.svelte';
  import { getAssetMediaUrl, getAssetPlaybackUrl } from '$lib/utils';
  import { musicUrl, type MemoryTrack } from '$lib/utils/curator';
  import { getAltText } from '$lib/utils/thumbnail-util';
  import { fromISODateTimeUTC, toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetMediaSize, AssetTypeEnum, type AssetResponseDto, type MemoryResponseDto } from '@immich/sdk';
  import { Icon, isModalOpen } from '@immich/ui';
  import {
    mdiChevronLeft,
    mdiChevronRight,
    mdiClose,
    mdiImageMultipleOutline,
    mdiMusicNote,
    mdiPause,
    mdiPlay,
    mdiReplay,
    mdiSkipNext,
    mdiVolumeHigh,
    mdiVolumeOff,
  } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { onMount, tick, untrack, type Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fade, fly } from 'svelte/transition';
  import { thumbhashBackdrop } from './film-backdrop';
  import { filmKeyAction, type FilmAction, type FilmDress } from './film-keys';
  import { FilmMusic } from './film-music.svelte';
  import {
    buildFilmPlan,
    filmChanges,
    filmMomentAt,
    shotFrame,
    shotOfAsset,
    splitSentences,
    storyOf,
    type FilmAsset,
    type FilmPlan,
    type FilmShot,
  } from './film-plan';

  interface Props {
    /** a memory, or any run of photos with an id of its own (Room's albums and years) */
    memory: Pick<MemoryResponseDto, 'id' | 'assets'>;
    /** the photo the address names: the film starts there (on the first photo, with its title card) and goes there
     * when the address moves on (back from the photo viewer, a photo taken out of the memory) */
    assetId: string;
    /** on screen: false while All photos or the photo viewer is up, when the film pauses and waits */
    active: boolean;
    /** the title card: the places or people, else the time, in the display face */
    name: string;
    /** "OCTOBER 2025 · 192 PHOTOS": the time and the count, in data type */
    line: string;
    /** the card's title, for the top bar and the film's name */
    title: string;
    /** Curator's cover and the faces in the photos, once its facts are in */
    cover?: string | null;
    focus?: Record<string, [number, number]>;
    /** the film plans its opening once these are in, or after a moment without them */
    settled: boolean;
    story: string | null;
    tracks: MemoryTrack[];
    /** where the photo on screen was taken ("Siem Reap, Cambodia"), when it is known */
    place?: string;
    /** a photo's time on screen, in seconds (the Memories duration preference) */
    photoSeconds?: number;
    nextMemory?: { title: string; assetId: string };
    /** the photo on screen, for the memory's own actions (the ⋮'s Remove photo, View in timeline) */
    current?: string;
    /** the memory's own buttons (the heart, the ⋮), at the top's end */
    actions?: Snippet;
    /** a line of the top bar's own, after the date (a birthday's age) */
    extra?: Snippet;
    /** 'room': dressed for a screen across the room (Room) */
    dress?: FilmDress;
    /** the photo on screen in words, "names · place · date": the room dress's caption at the foot */
    caption?: string;
    /** paused by a person (or by the tab being hidden), not before the film starts or once it has ended: Room keeps
     * the screen awake while this is false */
    paused?: boolean;
    onClose: () => void;
    /** All photos (the memory's grid); without it the film has no way there */
    onAllPhotos?: () => void;
    onNextMemory?: () => void;
    /** a film in a chain (Room): its end and ↓ hand on to the next film, ↑ to the one before */
    onNextFilm?: () => void;
    onPreviousFilm?: () => void;
  }

  let {
    memory,
    assetId,
    active,
    name,
    line,
    title,
    cover = null,
    focus,
    settled,
    story,
    tracks,
    place,
    photoSeconds = 5,
    nextMemory,
    current = $bindable(),
    actions,
    extra,
    dress = 'screen',
    caption,
    paused = $bindable(false),
    onClose,
    onAllPhotos,
    onNextMemory,
    onNextFilm,
    onPreviousFilm,
  }: Props = $props();

  /** seconds: a step by hand crossfades quickly; the controls rest this long before they fade */
  const QUICK_FADE = 0.35;
  const IDLE_MS = 3000;
  /** the opening waits this long for Curator's facts and songs before it plans without them */
  const WAIT_MS = 1200;
  /** the film waits this long at most for a photo to decode, then shows it as it is */
  const READY_MS = 6000;
  /** a film in a chain fades its picture and its music to black over this before the next one takes over */
  const HAND_ON_MS = 650;

  const reducedMotion = $derived(mediaQueryManager.reducedMotion);

  let film: HTMLElement | undefined = $state();
  // the film is fixed over the whole window, so the window's size is the frame's (and holds while the film is hidden)
  let frameWidth = $state(0);
  let frameHeight = $state(0);
  const aspect = $derived(frameWidth > 0 && frameHeight > 0 ? frameWidth / frameHeight : 0);

  let plan = $state<FilmPlan | undefined>();
  let shotIndex = $state(0);
  let playing = $state(false);
  let ended = $state(false);
  let titleShown = $state(false);
  let storyIndex = $state(-1);
  let controlsShown = $state(false);
  let waited = $state(false);
  let storyText = $derived(plan && storyIndex >= 0 ? storyOf(plan)[storyIndex]?.text : undefined);

  type Layer = { shot: FilmShot | null; key: string; z: number };
  let layers = $state<Layer[]>([
    { shot: null, key: '', z: 1 },
    { shot: null, key: '', z: 0 },
  ]);
  const layerEls: (HTMLElement | undefined)[] = $state([undefined, undefined]);
  // each layer's running animations and the promise of its photo being decoded (plain: nothing renders from them)
  const stages: { animations: Animation[]; ready?: Promise<void> }[] = [{ animations: [] }, { animations: [] }];
  let front = 0;
  let zTop = 2;
  let turn = 0;

  // the film's clock: seconds from the start, running while it plays
  let clockBase = 0;
  let clockSince = 0;
  let clockRunning = false;
  const clockTime = () => (clockRunning ? clockBase + (performance.now() - clockSince) / 1000 : clockBase);
  const clockSet = (time: number) => {
    clockBase = time;
    clockSince = performance.now();
  };
  const clockRun = () => {
    if (!clockRunning) {
      clockSince = performance.now();
      clockRunning = true;
    }
  };
  const clockStop = () => {
    if (clockRunning) {
      clockBase = clockTime();
      clockRunning = false;
    }
  };

  let wakeTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  // a film in a chain, fading to black before the next one takes over
  let leaving = $state(false);
  let handOnTimer: ReturnType<typeof setTimeout> | undefined;
  // the room dress shows the pointer while the mouse moves, and hides it again once it rests
  let pointerSeen = $state(false);
  let pointerTimer: ReturnType<typeof setTimeout> | undefined;
  let musicFading = false;
  let autoPaused = false;
  let began = false;
  let beatBpm: number | null | undefined;
  let destroyed = false;
  let followed = untrack(() => assetId);

  let music = $state<FilmMusic | undefined>();
  const song = $derived(music?.available ? music.track : undefined);
  const soundBlocked = $derived(!!music?.available && music.blocked);

  const assetsById = $derived(new Map(memory.assets.map((asset) => [asset.id, asset])));
  const filmAssets = $derived<FilmAsset[]>(
    memory.assets.map((asset) => ({
      id: asset.id,
      kind: asset.type === AssetTypeEnum.Video ? 'video' : 'photo',
      ratio: asset.width && asset.height ? asset.width / asset.height : null,
      seconds: asset.type === AssetTypeEnum.Video && asset.duration ? asset.duration / 1000 : null,
    })),
  );
  const sentences = $derived(splitSentences(story, $locale));
  const total = $derived(memory.assets.length);

  const shot = $derived(plan?.shots[shotIndex]);
  /** where the film is, for "3/20": a cover opening on its own is the film's start */
  const position = $derived(shot ? (shot.opening && shot.index !== 0 ? 0 : Math.max(0, shot.index)) : 0);
  const shownAsset = $derived<AssetResponseDto | undefined>(shot ? assetsById.get(shot.assetId) : undefined);
  const shownDate = $derived(
    shownAsset
      ? fromISODateTimeUTC(shownAsset.localDateTime).toLocaleString(DateTime.DATE_FULL, { locale: $locale })
      : '',
  );

  // what the shots were planned from when the film began: facts that come in later (a cover, the faces) and a skip
  // to another song leave the shots' times as they are, so the clock stays true
  let frozen: { cover: string | null; focus?: Record<string, [number, number]>; photoSeconds: number } | undefined;
  let musicFrom = 0;

  const makePlan = (aspectNow: number) =>
    buildFilmPlan({
      memoryId: memory.id,
      assets: filmAssets,
      aspect: aspectNow,
      cover: frozen?.cover ?? cover,
      focus: frozen?.focus ?? focus,
      title: { text: name, line },
      sentences,
      tracks: music?.available ? [...music.tracks.slice(music.index), ...music.tracks.slice(0, music.index)] : [],
      bpm: beatBpm,
      musicFrom,
      photoSeconds: frozen?.photoSeconds ?? photoSeconds,
      reducedMotion,
    });

  /** The film as "Save as video" hands it to Curator, which draws the same film into a 16:9 MP4: the shots planned
   * for that frame from what this film was planned from (its cover and faces, its photos' time), the songs from the
   * one playing, from the film's start, and the cuts on that song's beat. Nothing until the film has begun. */
  export const videoPlan = (): { plan: FilmPlan; trackId?: string } | undefined => {
    if (!plan) {
      return undefined;
    }
    const songs = music?.available ? [...music.tracks.slice(music.index), ...music.tracks.slice(0, music.index)] : [];
    const saved = buildFilmPlan({
      memoryId: memory.id,
      assets: filmAssets,
      aspect: 16 / 9,
      cover: frozen?.cover ?? cover,
      focus: frozen?.focus ?? focus,
      title: { text: name, line },
      sentences,
      tracks: songs,
      photoSeconds: frozen?.photoSeconds ?? photoSeconds,
      reducedMotion,
    });
    return { plan: saved, trackId: saved.music[0]?.trackId };
  };

  // a photo shown whole lies on its own colours, drawn from its thumbhash (film-backdrop.ts: no CSS blur under a drift)
  const backdropOf = (id: string) => thumbhashBackdrop(assetsById.get(id)?.thumbhash);

  const preview = (id: string) =>
    getAssetMediaUrl({ id, size: AssetMediaSize.Preview, cacheKey: assetsById.get(id)?.thumbhash });
  const thumbnail = (id: string) => getAssetMediaUrl({ id, cacheKey: assetsById.get(id)?.thumbhash });
  const altOf = (id: string) => {
    const asset = assetsById.get(id);
    return asset ? $getAltText(toTimelineAsset(asset)) : '';
  };

  // ---- the layers: the shot on screen and the next one, made ready under it ----

  const animate = (
    element: Element | null | undefined,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ): Animation | undefined => {
    if (!element) {
      return undefined;
    }
    if (typeof element.animate !== 'function') {
      // no Web Animations: the end state at once
      Object.assign((element as HTMLElement).style, keyframes.at(-1));
      return undefined;
    }
    return element.animate(keyframes, options);
  };

  const stopLayer = (slot: number) => {
    for (const animation of stages[slot].animations) {
      animation.cancel?.();
    }
    stages[slot].animations = [];
    const media = layerEls[slot]?.querySelector('.film-media');
    if (media instanceof HTMLVideoElement) {
      media.pause();
    }
  };

  const mediaOf = (slot: number) => layerEls[slot]?.querySelector<HTMLImageElement | HTMLVideoElement>('.film-media');

  const withTimeout = (promise: Promise<unknown>, ms: number) =>
    Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))])
      .then(() => undefined)
      .catch(() => undefined);

  const videoReady = (video: HTMLVideoElement) =>
    video.readyState >= 2
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          video.addEventListener('loadeddata', () => resolve(), { once: true });
          video.addEventListener('error', () => resolve(), { once: true });
        });

  /** Put a shot in a layer (under the one on screen) and decode it there. */
  const prepare = (slot: number, next: FilmShot, index: number) => {
    const key = `${index}:${next.assetId}`;
    const stage = stages[slot];
    if (layers[slot].key === key && stage.ready) {
      // the same photo, perhaps planned again for a new frame's shape: its fit follows, the decoded image stays
      layers[slot].shot = next;
      return stage.ready;
    }
    stopLayer(slot);
    layers[slot] = { shot: next, key, z: layers[slot].z };
    const ready = (async () => {
      await tick();
      const media = mediaOf(slot);
      if (media instanceof HTMLImageElement) {
        await withTimeout(typeof media.decode === 'function' ? media.decode() : Promise.resolve(), READY_MS);
      } else if (media instanceof HTMLVideoElement) {
        await withTimeout(videoReady(media), READY_MS / 2);
      }
    })();
    stage.ready = ready;
    return ready;
  };

  /** The photo after the next, into the browser's cache (preview size; never the original). */
  const warm = (index: number) => {
    const ahead = plan?.shots[index];
    if (ahead && ahead.kind === 'photo' && typeof Image === 'function') {
      const image = new Image();
      image.decoding = 'async';
      image.src = preview(ahead.assetId);
    }
  };

  const prepareNext = () => {
    if (!plan) {
      return;
    }
    const next = shotIndex + 1;
    const upcoming = plan.shots.at(next);
    if (upcoming) {
      void prepare(1 - front, upcoming, next);
      warm(next + 1);
    }
  };

  /** A layer's shot on screen: on top, fading in, drifting from `offset` seconds into it. */
  const show = (slot: number, next: FilmShot, fadeSeconds: number, offset = 0) => {
    if (!plan) {
      return;
    }
    stopLayer(slot);
    layers[slot].z = ++zTop;
    const frame = shotFrame(next, plan.aspect);
    const media = mediaOf(slot);
    const span = Math.max(0.1, next.end - next.start) * 1000;
    const drift = animate(media, [{ transform: frame.from }, { transform: frame.to }], {
      duration: span,
      easing: 'linear',
      fill: 'both',
    });
    if (drift && offset > 0) {
      drift.currentTime = Math.min(span, offset * 1000);
    }
    const fadeIn = animate(layerEls[slot], [{ opacity: 0 }, { opacity: 1 }], {
      duration: Math.max(0, fadeSeconds) * 1000,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    });
    stages[slot].animations = [drift, fadeIn].filter((animation): animation is Animation => !!animation);
    if (media instanceof HTMLVideoElement) {
      media.currentTime = offset;
      if (playing) {
        void media.play().catch(() => undefined);
      }
    }
    if (!playing) {
      for (const animation of stages[slot].animations) {
        animation.pause?.();
      }
    }
    const behind = front;
    front = slot;
    const token = turn;
    const settle = () => {
      if (token === turn && behind !== slot) {
        stopLayer(behind);
        prepareNext();
      }
    };
    if (fadeIn?.finished) {
      fadeIn.finished.then(settle).catch(() => undefined);
    } else {
      settle();
    }
  };

  /** Go to a shot: the position follows at once, the photo when it is ready (the film waits for it if it must). */
  const goTo = async (index: number, fadeSeconds: number) => {
    const next = plan?.shots.at(index);
    if (!next || index < 0) {
      return;
    }
    const token = ++turn;
    shotIndex = index;
    current = next.assetId;
    const slot = 1 - front;
    const ready = prepare(slot, next, index);
    // the clock waits for the photo (a step superseded by the next one leaves the waiting to that one)
    if (clockRunning) {
      clockStop();
      clearTimeout(wakeTimer);
    }
    await ready;
    if (token !== turn || destroyed) {
      return;
    }
    show(slot, next, fadeSeconds);
    if (playing && !clockRunning) {
      clockRun();
      schedule();
    }
  };

  // ---- the clock: the film wakes at its next change and nowhere else ----

  const schedule = () => {
    clearTimeout(wakeTimer);
    if (!plan || !clockRunning) {
      return;
    }
    const now = clockTime();
    const next = filmChanges(plan).find((at) => at > now + 0.005);
    if (next !== undefined) {
      wakeTimer = setTimeout(wake, Math.max(0, (next - now) * 1000));
    }
  };

  const wake = () => {
    if (!plan || destroyed) {
      return;
    }
    const moment = filmMomentAt(plan, clockTime());
    titleShown = moment.title;
    storyIndex = moment.story;
    if (moment.fading && !musicFading) {
      musicFading = true;
      music?.fadeOut(Math.max(0, (plan.duration - clockTime()) * 1000));
    }
    if (moment.ended) {
      finish();
      return;
    }
    if (moment.shot !== shotIndex) {
      void goTo(moment.shot, plan.shots[moment.shot].fade);
    }
    schedule();
  };

  const finish = () => {
    clockStop();
    clearTimeout(wakeTimer);
    if (plan) {
      clockSet(plan.duration);
    }
    ended = true;
    playing = false;
    titleShown = false;
    storyIndex = -1;
    if (!musicFading) {
      musicFading = true;
      music?.fadeOut(1500);
    }
    if (onNextFilm) {
      handOn(onNextFilm);
      return;
    }
    showControls();
  };

  /** A film in a chain hands on: the picture and the music fade to black, then the next film (or the one before)
   * takes over. */
  const handOn = (to: (() => void) | undefined) => {
    if (!to || leaving) {
      return;
    }
    leaving = true;
    music?.fadeOut(HAND_ON_MS);
    handOnTimer = setTimeout(
      () => {
        if (!destroyed) {
          to();
        }
      },
      reducedMotion ? 150 : HAND_ON_MS,
    );
  };

  const pauseLayers = () => {
    for (const slot of [0, 1]) {
      for (const animation of stages[slot].animations) {
        animation.pause?.();
      }
      const media = mediaOf(slot);
      if (media instanceof HTMLVideoElement) {
        media.pause();
      }
    }
  };

  const playLayers = () => {
    for (const stage of stages) {
      for (const animation of stage.animations) {
        animation.play?.();
      }
    }
    const media = mediaOf(front);
    if (media instanceof HTMLVideoElement) {
      void media.play().catch(() => undefined);
    }
  };

  // ---- what a person does ----

  export const pause = () => {
    if (!playing) {
      return;
    }
    playing = false;
    clockStop();
    clearTimeout(wakeTimer);
    pauseLayers();
    music?.pause();
    showControls();
  };

  const resume = () => {
    if (!plan) {
      return;
    }
    if (ended) {
      replay();
      return;
    }
    playing = true;
    clockRun();
    playLayers();
    if (!musicFading) {
      void music?.play();
    }
    schedule();
    poke();
  };

  const seek = (index: number, fadeSeconds = QUICK_FADE) => {
    if (!plan) {
      return;
    }
    const target = Math.min(Math.max(0, index), plan.shots.length - 1);
    ended = false;
    clockSet(plan.shots[target].start);
    const moment = filmMomentAt(plan, clockTime());
    titleShown = moment.title;
    storyIndex = moment.story;
    if (musicFading && !moment.fading) {
      musicFading = false;
      if (playing) {
        void music?.play();
      }
    }
    void goTo(target, fadeSeconds);
    schedule();
  };

  const next = () => {
    if (!plan) {
      return;
    }
    if (ended) {
      return;
    }
    if (shotIndex + 1 >= plan.shots.length) {
      finish();
    } else {
      seek(shotIndex + 1);
    }
  };

  const previous = () => {
    if (!plan) {
      return;
    }
    if (ended) {
      seek(plan.shots.length - 1);
      return;
    }
    seek(shotIndex - 1);
  };

  const replay = () => {
    if (!plan) {
      return;
    }
    ended = false;
    musicFading = false;
    playing = true;
    music?.restart();
    musicFrom = 0;
    clockSet(0);
    clockRun();
    titleShown = false;
    storyIndex = -1;
    void goTo(0, plan.shots[0].fade).then(() => wake());
    void music?.play();
  };

  const toggleMute = () => music?.setMuted(!music.muted);

  const nextSong = () => {
    if (!music || music.tracks.length < 2) {
      return;
    }
    music.next();
    musicFrom = clockTime();
    if (plan) {
      plan = makePlan(plan.aspect);
    }
  };

  const startSound = () => {
    void music?.play();
  };

  const run = (action: FilmAction) => {
    switch (action) {
      case 'toggle': {
        if (playing) {
          pause();
        } else {
          resume();
        }
        break;
      }
      case 'previous': {
        previous();
        break;
      }
      case 'next': {
        next();
        break;
      }
      case 'mute': {
        toggleMute();
        break;
      }
      case 'next-song': {
        nextSong();
        break;
      }
      case 'close': {
        onClose();
        break;
      }
      case 'previous-film': {
        handOn(onPreviousFilm);
        break;
      }
      case 'next-film': {
        handOn(onNextFilm);
        break;
      }
    }
  };

  /** What a key does, from outside: a host's own button (Room's Up next) hands on through the film's fade. */
  export const control = (action: FilmAction) => {
    poke();
    run(action);
  };

  // ---- the controls: there with the pointer, a touch or a key, gone after a few quiet seconds ----

  let overControls = false;

  const menuOpen = () => !!film?.querySelector(':scope [aria-expanded="true"]');

  const focusedByKeys = () => {
    try {
      return !!film?.querySelector(':scope .film-chrome :focus-visible');
    } catch {
      return false;
    }
  };

  const hideLater = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!playing || ended || overControls || menuOpen() || focusedByKeys()) {
        hideLater();
        return;
      }
      controlsShown = false;
    }, IDLE_MS);
  };

  const showControls = () => {
    controlsShown = true;
    hideLater();
  };

  const poke = () => showControls();

  // Enter on a control a person reached with the keys (Tab, a remote moving the focus) presses that control
  const pressesControl = (target: EventTarget | null) => {
    if (!(target instanceof Element) || !target.closest('button, a[href], [role="button"]')) {
      return false;
    }
    try {
      return target.matches(':focus-visible');
    } catch {
      return false;
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!active || isModalOpen()) {
      return;
    }
    const action = filmKeyAction(event, dress);
    if (!action || (event.key === 'Enter' && pressesControl(event.target))) {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        poke();
      }
      return;
    }
    if (action === 'close' && menuOpen()) {
      return;
    }
    event.preventDefault();
    poke();
    // across the room the sound a browser held back starts with the first key (a key is a press), and a remote's OK
    // does only that
    if (dress === 'room' && soundBlocked && action !== 'close') {
      startSound();
      if (action === 'toggle') {
        return;
      }
    }
    run(action);
  };

  // Space on a focused button would press it as well when the key comes up
  const onKeyUp = (event: KeyboardEvent) => {
    if (active && event.key === ' ' && filmKeyAction(event, dress) === 'toggle') {
      event.preventDefault();
    }
  };

  // a tap shows or hides the controls; a swipe steps a photo back or on
  let press: { x: number; y: number; at: number; id: number } | undefined;

  const onPointerDown = (event: PointerEvent) => {
    press = { x: event.clientX, y: event.clientY, at: performance.now(), id: event.pointerId };
  };

  const onPointerUp = (event: PointerEvent) => {
    const started = press;
    press = undefined;
    if (!started || started.id !== event.pointerId) {
      return;
    }
    const dx = event.clientX - started.x;
    const dy = event.clientY - started.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) {
        next();
      } else {
        previous();
      }
      return;
    }
    if (Math.hypot(dx, dy) < 12 && performance.now() - started.at < 600) {
      if (controlsShown) {
        controlsShown = false;
        clearTimeout(idleTimer);
      } else {
        showControls();
      }
    }
  };

  const restPointer = () => {
    clearTimeout(pointerTimer);
    pointerTimer = setTimeout(() => {
      if (overControls) {
        restPointer();
        return;
      }
      pointerSeen = false;
    }, IDLE_MS);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (active && event.pointerType === 'mouse' && (event.movementX !== 0 || event.movementY !== 0)) {
      poke();
      if (dress === 'room') {
        pointerSeen = true;
        restPointer();
      }
    }
  };

  // ---- the start, the address, the frame's shape, the story and the songs ----

  const startIndex = () => {
    if (!plan) {
      return 0;
    }
    if (memory.assets[0]?.id === assetId) {
      return 0;
    }
    return Math.max(0, shotOfAsset(plan, assetId));
  };

  const begin = async () => {
    began = true;
    beatBpm = music?.available ? (music.track?.bpm ?? null) : null;
    frozen = { cover, focus, photoSeconds };
    plan = makePlan(aspect);
    const index = startIndex();
    clockSet(plan.shots[index]?.start ?? 0);
    const moment = filmMomentAt(plan, clockTime());
    titleShown = moment.title;
    storyIndex = moment.story;
    playing = true;
    await goTo(index, index === 0 ? (plan.shots[0]?.fade ?? 0) : QUICK_FADE);
    if (destroyed || !playing) {
      return;
    }
    clockRun();
    schedule();
    if (active && !document.hidden) {
      void music?.play();
    }
  };

  onMount(() => {
    const timer = setTimeout(() => (waited = true), WAIT_MS);
    return () => {
      destroyed = true;
      clearTimeout(timer);
      clearTimeout(wakeTimer);
      clearTimeout(idleTimer);
      clearTimeout(reshapeTimer);
      clearTimeout(handOnTimer);
      clearTimeout(pointerTimer);
      stopLayer(0);
      stopLayer(1);
      music?.destroy();
    };
  });

  // the songs: when Curator's come in, the music joins the film (from the start, or from where the film is)
  $effect(() => {
    const list = tracks;
    untrack(() => {
      if (music || list.length === 0) {
        return;
      }
      music = new FilmMusic(list, musicUrl);
      if (began && plan) {
        musicFrom = clockTime();
        plan = makePlan(plan.aspect);
        if (playing && active && !document.hidden) {
          void music.play();
        }
      }
    });
  });

  $effect(() => {
    if (!began && active && aspect > 0 && memory.assets.length > 0 && (settled || waited)) {
      untrack(() => void begin());
    }
  });

  // the story and the title as they come in: the shots keep their times
  $effect(() => {
    void sentences;
    void name;
    void line;
    untrack(() => {
      if (plan) {
        plan = makePlan(plan.aspect);
        const moment = filmMomentAt(plan, clockTime());
        if (!ended) {
          titleShown = moment.title;
          storyIndex = moment.story;
        }
        schedule();
      }
    });
  });

  // the frame's shape (a turned phone, a resized window): once it has settled the fits and drifts are worked out
  // again, and the shot on screen goes on from where it is
  let reshapeTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const now = aspect;
    untrack(() => {
      clearTimeout(reshapeTimer);
      if (!plan || now <= 0 || Math.abs(now - plan.aspect) < 0.01) {
        return;
      }
      reshapeTimer = setTimeout(() => {
        if (!plan || destroyed) {
          return;
        }
        plan = makePlan(now);
        const onScreen = plan.shots[shotIndex];
        if (onScreen && layers[front].shot) {
          layers[front].shot = onScreen;
          show(front, onScreen, 0, Math.max(0, clockTime() - onScreen.start));
        }
      }, 180);
    });
  });

  // a photo taken out of the memory: the film plans again and stays on the photo it shows
  const assetKey = $derived(memory.assets.map(({ id }) => id).join(','));
  let plannedKey = untrack(() => assetKey);
  $effect(() => {
    const key = assetKey;
    untrack(() => {
      if (!plan || key === plannedKey) {
        return;
      }
      plannedKey = key;
      const onScreen = current;
      plan = makePlan(plan.aspect);
      const index = onScreen ? shotOfAsset(plan, onScreen) : -1;
      seek(index === -1 ? Math.min(shotIndex, plan.shots.length - 1) : index);
    });
  });

  // the address moved on (back from the photo viewer, a photo taken out): the film goes to that photo
  $effect(() => {
    const id = assetId;
    untrack(() => {
      if (id === followed) {
        return;
      }
      followed = id;
      if (plan && id !== current) {
        const index = shotOfAsset(plan, id);
        if (index !== -1) {
          seek(index);
        }
      }
    });
  });

  // off screen (All photos, the photo viewer) the film pauses; back on screen it plays on if it was playing
  let pausedForAway = false;
  $effect(() => {
    const on = active;
    untrack(() => {
      if (!on && playing) {
        pausedForAway = true;
        pause();
      } else if (on && pausedForAway) {
        pausedForAway = false;
        resume();
      }
    });
  });

  // a hidden tab pauses the film and its music; it plays on when the tab is back
  const onVisibility = () => {
    if (document.hidden && playing) {
      autoPaused = true;
      pause();
    } else if (!document.hidden && autoPaused) {
      autoPaused = false;
      if (active) {
        resume();
      }
    }
  };

  // the photo reaches the screen's edges on a phone with a notch: the page goes under it while the film is up
  $effect(() => {
    if (!active) {
      return;
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = meta?.content;
    if (meta && before && !before.includes('viewport-fit')) {
      meta.content = `${before}, viewport-fit=cover`;
    }
    return () => {
      if (meta && before !== undefined) {
        meta.content = before;
      }
    };
  });

  const controlsHidden = $derived(!controlsShown && playing && !ended);

  // paused by a person (or a hidden tab): Room lets the screen sleep then, and keeps it awake otherwise
  $effect(() => {
    const now = !!plan && !playing && !ended && !leaving;
    if (untrack(() => paused) !== now) {
      paused = now;
    }
  });
</script>

<svelte:window bind:innerWidth={frameWidth} bind:innerHeight={frameHeight} onpointermove={onPointerMove} />
<svelte:document onkeydown={onKeyDown} onkeyup={onKeyUp} onvisibilitychange={onVisibility} />

<section
  class="film"
  bind:this={film}
  hidden={!active}
  aria-label={title}
  data-testid="memory-film"
  data-shot={shotIndex}
  data-position={position + 1}
  data-idle={controlsHidden || undefined}
  data-playing={playing || undefined}
  data-ended={ended || undefined}
  data-sound={music?.available ? (music.playing ? 'on' : music.blocked ? 'blocked' : 'off') : undefined}
  data-dress={dress === 'room' ? 'room' : undefined}
  data-pointer={pointerSeen || undefined}
  data-leaving={leaving || undefined}
>
  <div
    class="film-stage"
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    onpointercancel={() => (press = undefined)}
    role="presentation"
  >
    {#each layers as layer, slot (slot)}
      <div class="film-layer" bind:this={layerEls[slot]} style:z-index={layer.z} data-asset-id={layer.shot?.assetId}>
        {#if layer.shot && plan}
          {@const frame = shotFrame(layer.shot, plan.aspect)}
          {#key layer.key}
            {#if !frame.fill}
              {@const backdrop = backdropOf(layer.shot.assetId)}
              {#if backdrop}
                <img class="film-backdrop" src={backdrop} alt="" aria-hidden="true" draggable="false" />
              {/if}
              <div class="film-vignette" aria-hidden="true"></div>
            {/if}
            {#if layer.shot.kind === 'video'}
              <video
                class="film-media"
                class:is-fill={frame.fill}
                style:width={frame.width}
                style:height={frame.height}
                src={getAssetPlaybackUrl({
                  id: layer.shot.assetId,
                  cacheKey: assetsById.get(layer.shot.assetId)?.thumbhash,
                })}
                poster={preview(layer.shot.assetId)}
                aria-label={altOf(layer.shot.assetId)}
                muted
                playsinline
                disablepictureinpicture
                preload="auto"
                draggable="false"
              ></video>
            {:else}
              <img
                class="film-media"
                class:is-fill={frame.fill}
                style:width={frame.width}
                style:height={frame.height}
                src={preview(layer.shot.assetId)}
                alt={altOf(layer.shot.assetId)}
                decoding="async"
                draggable="false"
              />
            {/if}
          {/key}
        {/if}
      </div>
    {/each}
  </div>

  <div
    class="film-scrim film-scrim-foot"
    class:is-lit={titleShown ||
      !!storyText ||
      ended ||
      !controlsHidden ||
      (dress === 'room' && !!caption && !!shot && !shot.opening)}
  ></div>
  <div class="film-scrim film-scrim-head" class:is-lit={!controlsHidden}></div>

  <header class="film-head film-chrome" class:is-hidden={controlsHidden}>
    <div
      class="film-pill"
      role="group"
      onpointerenter={() => (overControls = true)}
      onpointerleave={() => (overControls = false)}
    >
      <button type="button" class="film-button" aria-label={$t('close')} title={$t('close')} onclick={onClose}>
        <Icon icon={mdiClose} size="1.375rem" aria-hidden />
      </button>
    </div>
    <div class="film-where">
      <p class="film-where-name">{title}</p>
      <!-- across the room the photo's date and place are its caption, at the foot -->
      {#if dress !== 'room'}
        <p class="film-where-data" lang={$locale}>
          <span>{shownDate}{@render extra?.()}</span>{#if place}<span class="film-where-place">{place}</span>{/if}
        </p>
      {/if}
    </div>
    {#if actions}
      <div
        class="film-pill film-actions"
        role="group"
        onpointerenter={() => (overControls = true)}
        onpointerleave={() => (overControls = false)}
      >
        {@render actions()}
      </div>
    {/if}
  </header>

  <div class="film-foot">
    <div class="film-words">
      {#if ended && !onNextFilm}
        <div class="film-end" in:fade={{ duration: 400 }}>
          <p class="film-end-name">{name}</p>
          <div class="film-end-choices">
            <button type="button" class="film-choice" onclick={replay}>
              <Icon icon={mdiReplay} size="1.25rem" aria-hidden />
              <span>{$t('memories_start_over')}</span>
            </button>
            {#if nextMemory && onNextMemory}
              <button type="button" class="film-choice" onclick={onNextMemory}>
                <img class="film-choice-cover" src={thumbnail(nextMemory.assetId)} alt="" aria-hidden="true" />
                <span class="film-choice-label">
                  <span class="film-choice-kicker">{$t('next_memory')}</span>
                  <span class="film-choice-title">{nextMemory.title}</span>
                </span>
              </button>
            {/if}
            {#if onAllPhotos}
              <button type="button" class="film-choice" onclick={onAllPhotos}>
                <Icon icon={mdiImageMultipleOutline} size="1.25rem" aria-hidden />
                <span>{$t('all_photos')}</span>
              </button>
            {/if}
          </div>
        </div>
      {:else if !ended}
        {#if titleShown}
          <div
            class="film-title"
            in:fly={{ y: reducedMotion ? 0 : 14, duration: reducedMotion ? 400 : 900, delay: 100 }}
            out:fade={{ duration: 700 }}
          >
            <h1 class="film-title-name">{name}</h1>
            {#if line}
              <p class="film-title-line" lang={$locale}>{line}</p>
            {/if}
          </div>
        {/if}
        <!-- the story a sentence at a time, and across the room the photo's caption under it -->
        <div class="film-lines">
          {#key storyIndex}
            {#if storyText && !titleShown}
              <p class="film-story" lang={$locale} in:fade={{ duration: 600 }} out:fade={{ duration: 350 }}>
                {storyText}
              </p>
            {/if}
          {/key}
          <!-- the title card's photo is named by the title card; the caption comes with the next -->
          {#if dress === 'room' && caption && !titleShown && shot && !shot.opening}
            {#key caption}
              <p
                class="film-caption"
                lang={$locale}
                data-testid="memory-film-caption"
                in:fade={{ duration: 600, delay: reducedMotion ? 0 : 450 }}
                out:fade={{ duration: 300 }}
              >
                {caption}
              </p>
            {/key}
          {/if}
        </div>
      {/if}
    </div>

    <div class="film-transport film-chrome" class:is-hidden={controlsHidden && !soundBlocked}>
      {#if soundBlocked}
        <button type="button" class="film-sound-on" onclick={startSound}>
          <Icon icon={mdiMusicNote} size="1.25rem" aria-hidden />
          <span>{$t('memory_film_sound_on')}</span>
        </button>
      {/if}
      <div
        class="film-pill"
        class:is-hidden={controlsHidden}
        role="group"
        onpointerenter={() => (overControls = true)}
        onpointerleave={() => (overControls = false)}
      >
        {#if song}
          {#if (music?.tracks.length ?? 0) > 1}
            <button type="button" class="film-button film-song" title={$t('memory_film_next_song')} onclick={nextSong}>
              <Icon icon={mdiMusicNote} size="1.125rem" aria-hidden />
              <span class="film-song-name">{song.artist} – {song.title}</span>
              <Icon icon={mdiSkipNext} size="1.125rem" aria-hidden />
              <span class="sr-only">{$t('memory_film_next_song')}</span>
            </button>
          {:else}
            <span class="film-song">
              <Icon icon={mdiMusicNote} size="1.125rem" aria-hidden />
              <span class="film-song-name">{song.artist} – {song.title}</span>
            </span>
          {/if}
          <span class="film-rule" aria-hidden="true"></span>
        {/if}
        <button
          type="button"
          class="film-button"
          aria-label={$t('memory_film_previous_photo')}
          title={$t('memory_film_previous_photo')}
          onclick={previous}
        >
          <Icon icon={mdiChevronLeft} size="1.5rem" aria-hidden />
        </button>
        <button
          type="button"
          class="film-button"
          aria-label={playing ? $t('pause_memories') : $t('play_memories')}
          title={playing ? $t('pause_memories') : $t('play_memories')}
          onclick={() => run('toggle')}
        >
          <Icon icon={playing ? mdiPause : mdiPlay} size="1.5rem" aria-hidden />
        </button>
        <button
          type="button"
          class="film-button"
          aria-label={$t('memory_film_next_photo')}
          title={$t('memory_film_next_photo')}
          onclick={next}
        >
          <Icon icon={mdiChevronRight} size="1.5rem" aria-hidden />
        </button>
        <span class="film-position" data-testid="memory-film-position">
          {$t('x_of_total', {
            values: { x: (position + 1).toLocaleString($locale), total: total.toLocaleString($locale) },
          })}
        </span>
        {#if song}
          <button
            type="button"
            class="film-button"
            aria-label={music?.muted ? $t('unmute_memories') : $t('mute_memories')}
            title={music?.muted ? $t('unmute_memories') : $t('mute_memories')}
            onclick={toggleMute}
          >
            <Icon icon={music?.muted ? mdiVolumeOff : mdiVolumeHigh} size="1.375rem" aria-hidden />
          </button>
        {/if}
        {#if onAllPhotos}
          <span class="film-rule" aria-hidden="true"></span>
          <button
            type="button"
            class="film-button"
            aria-label={$t('all_photos')}
            title={$t('all_photos')}
            onclick={onAllPhotos}
          >
            <Icon icon={mdiImageMultipleOutline} size="1.375rem" aria-hidden />
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- a film in a chain goes to black before the next one takes over -->
  <div class="film-veil" class:is-on={leaving} aria-hidden="true"></div>
</section>

<style>
  .film {
    --film-gutter: clamp(1rem, 0.6rem + 1.6vw, 2.5rem);
    --film-glass-ink: rgb(255 255 255 / 0.88);
    position: fixed;
    inset: 0;
    z-index: 40;
    overflow: hidden;
    isolation: isolate;
    background: #000;
    color: #fff;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  .film[hidden] {
    display: none;
  }
  .film[data-idle] {
    cursor: none;
  }

  /* ---- the photos ---- */
  /* the stage keeps its layers' order to itself, under the scrims and the chrome */
  .film-stage {
    position: absolute;
    inset: 0;
    z-index: 0;
    isolation: isolate;
  }
  .film-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    opacity: 0;
    contain: strict;
    will-change: opacity;
  }
  .film-media {
    position: absolute;
    inset: 0;
    display: block;
    max-width: none;
    object-fit: contain;
    transform-origin: 50% 50%;
    will-change: transform;
    backface-visibility: hidden;
  }
  /* a photo that fills the frame is laid out as large as the frame's shape asks and moved from its top-left corner */
  .film-media.is-fill {
    inset: auto;
    left: 0;
    top: 0;
    object-fit: cover;
    transform-origin: 0 0;
  }
  /* a photo shown whole lies on its own colours, its thumbhash scaled up past recognition (no filter: see film-backdrop.ts) */
  .film-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    object-fit: cover;
    image-rendering: auto;
  }
  .film-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 35%, rgb(0 0 0 / 0.6) 100%);
  }

  /* ---- the scrims: the caption's black under the words, a lighter one under the top bar ---- */
  .film-scrim {
    position: absolute;
    inset-inline: 0;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transition: opacity 600ms ease;
  }
  .film-scrim.is-lit {
    opacity: 1;
  }
  .film-scrim-foot {
    bottom: 0;
    height: min(55%, 30rem);
    background: linear-gradient(to top, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.32) 35%, rgb(0 0 0 / 0.1) 70%, transparent);
  }
  .film-scrim-head {
    top: 0;
    height: 9rem;
    background: linear-gradient(to bottom, rgb(0 0 0 / 0.42), transparent);
  }

  /* ---- the chrome: thin smoked glass, as the photo viewer's ---- */
  .film-chrome {
    transition: opacity 350ms ease;
  }
  .film-chrome.is-hidden,
  .film-pill.is-hidden {
    opacity: 0;
    pointer-events: none;
  }
  .film-head {
    position: absolute;
    top: 0;
    inset-inline: 0;
    z-index: 2;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: max(var(--film-gutter), env(safe-area-inset-top, 0px))
      max(var(--film-gutter), env(safe-area-inset-right, 0px)) 0 max(var(--film-gutter), env(safe-area-inset-left, 0px));
  }
  .film-head {
    pointer-events: none;
  }
  .film-head > .film-pill {
    pointer-events: auto;
  }
  .film-where {
    flex: 1;
    min-width: 0;
    padding-top: 0.3rem;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.45);
  }
  .film-where-name {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: clamp(1.125rem, 0.95rem + 0.45vw, 1.5rem);
    font-weight: 650;
    font-stretch: 75%;
    line-height: 1.1;
    letter-spacing: -0.01em;
    word-spacing: 0.06em;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .film-where-data {
    margin-top: 0.2rem;
    overflow: hidden;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: rgb(255 255 255 / 0.76);
  }
  /* the date, then where: one line on a wide screen, two on a phone */
  .film-where-place::before {
    content: ' · ';
  }
  .film-pill {
    position: relative;
    z-index: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--ws-glass-edge);
    border-radius: var(--ws-radius);
    transition: opacity 350ms ease;
  }
  /* the glass is a layer of its own, so the ⋮'s menu (a fixed popup) is not trapped in the pill's box */
  .film-pill::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    border-radius: inherit;
    background: var(--ws-glass);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
    transition: visibility 0s;
  }
  /* hidden controls stop blurring the drifting photo under them (a blur worked out again every frame), once faded;
     the buttons stay where a screen reader and the Tab key find them */
  .film-chrome.is-hidden .film-pill::before,
  .film-pill.is-hidden::before {
    visibility: hidden;
    transition: visibility 0s linear 350ms;
  }
  .film-button,
  .film-actions :global(button),
  .film-actions :global(a) {
    display: inline-grid;
    place-items: center;
    min-width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--ws-radius);
    color: var(--film-glass-ink);
    background: transparent;
  }
  .film-button:hover:not(:disabled),
  .film-actions :global(button:hover),
  .film-actions :global(a:hover) {
    color: #fff;
    background: rgb(255 255 255 / 0.1);
  }
  .film-button:focus-visible,
  .film-actions :global(:is(button, a):focus-visible),
  .film-choice:focus-visible,
  .film-sound-on:focus-visible {
    outline: var(--ws-border) solid var(--ws-accent);
    outline-offset: 1px;
  }
  .film-button:disabled {
    cursor: default;
  }
  .film-rule {
    align-self: stretch;
    width: 1px;
    margin: 0.4rem 0.2rem;
    background: rgb(255 255 255 / 0.14);
  }
  .film-position {
    min-width: 3.5rem;
    padding: 0 0.5rem;
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: rgb(255 255 255 / 0.8);
  }
  .film-song {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.5rem;
    max-width: min(24rem, 40vw);
    padding: 0 0.65rem;
    font-size: var(--ws-text-meta);
    font-weight: 500;
  }
  .film-song-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* ---- the words: the title card, then the story a sentence at a time ---- */
  .film-foot {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 1rem 2rem;
    padding: 0 max(var(--film-gutter), env(safe-area-inset-right, 0px))
      max(calc(var(--film-gutter) * 1.4), env(safe-area-inset-bottom, 0px))
      max(var(--film-gutter), env(safe-area-inset-left, 0px));
    pointer-events: none;
  }
  .film-foot > * {
    pointer-events: auto;
  }
  .film-foot > .film-words {
    pointer-events: none;
  }
  .film-end {
    pointer-events: auto;
  }
  .film-words {
    display: grid;
    min-width: 0;
    text-shadow:
      0 1px 2px rgb(0 0 0 / 0.5),
      0 0 1.5rem rgb(0 0 0 / 0.35);
  }
  .film-words > * {
    grid-area: 1 / 1;
    align-self: end;
  }
  .film-title-name {
    max-width: 16ch;
    font-family: var(--font-display);
    font-size: clamp(2.75rem, 1.4rem + 4.6vw, 6rem);
    font-weight: 800;
    font-stretch: 75%;
    line-height: 0.9;
    letter-spacing: -0.025em;
    word-spacing: 0.06em;
    text-wrap: balance;
  }
  .film-title-line {
    margin-top: 0.85rem;
    font-family: var(--ws-font-data);
    font-size: clamp(0.8125rem, 0.6rem + 0.45vw, 1.125rem);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgb(255 255 255 / 0.84);
  }
  /* the story's sentences cross-fade in one place; across the room the photo's caption sits on the line under them */
  .film-lines {
    display: grid;
    align-items: end;
  }
  .film-lines > .film-story {
    grid-area: 1 / 1;
  }
  .film-lines > .film-caption {
    grid-area: 2 / 1;
  }
  .film-story {
    max-width: 44ch;
    font-size: clamp(1.0625rem, 0.85rem + 0.62vw, 1.625rem);
    font-weight: 450;
    line-height: 1.4;
    text-wrap: pretty;
    color: rgb(255 255 255 / 0.94);
  }
  .film-caption {
    max-width: 60ch;
    font-weight: 560;
    line-height: 1.25;
    letter-spacing: 0.005em;
    font-variant-numeric: tabular-nums;
    text-wrap: balance;
    color: rgb(255 255 255 / 0.9);
  }
  .film-lines > .film-caption:not(:first-child) {
    margin-top: 0.55em;
  }

  /* ---- a film in a chain goes to black before the next one takes over ---- */
  .film-veil {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    background: #000;
    opacity: 0;
    transition: opacity 650ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .film-veil.is-on {
    opacity: 1;
  }

  /* ---- the end: start over, the next memory, all its photos ---- */
  .film-end-name {
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 1.1rem + 2.2vw, 3.25rem);
    font-weight: 800;
    font-stretch: 75%;
    line-height: 0.95;
    letter-spacing: -0.02em;
    word-spacing: 0.06em;
    text-wrap: balance;
  }
  .film-end-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.1rem;
    text-shadow: none;
  }
  .film-choice {
    position: relative;
    z-index: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 2.75rem;
    padding: 0.35rem 0.9rem 0.35rem 0.7rem;
    border: 1px solid var(--ws-glass-edge);
    border-radius: var(--ws-radius);
    font-size: var(--ws-text-ui);
    font-weight: 600;
    color: var(--film-glass-ink);
  }
  .film-choice::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--ws-glass-strong);
    -webkit-backdrop-filter: var(--ws-glass-blur);
    backdrop-filter: var(--ws-glass-blur);
  }
  .film-choice:hover {
    color: #fff;
  }
  .film-choice:hover::before {
    background: rgb(10 10 12 / 0.78);
  }
  .film-choice-cover {
    width: 2.25rem;
    height: 2.25rem;
    object-fit: cover;
    border-radius: var(--ws-radius);
  }
  .film-choice-label {
    display: grid;
    text-align: start;
  }
  .film-choice-kicker {
    font-family: var(--ws-font-data);
    font-size: var(--ws-text-data);
    font-weight: 600;
    color: rgb(255 255 255 / 0.7);
  }
  .film-choice-title {
    max-width: 18rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .film[data-ended] .film-scrim-foot {
    height: 100%;
    background: linear-gradient(to top, rgb(0 0 0 / 0.66), rgb(0 0 0 / 0.36) 50%, rgb(0 0 0 / 0.2));
  }

  /* ---- the transport: the song, the photo before, play and pause, the next, where the film is ---- */
  .film-transport {
    display: grid;
    justify-items: end;
    gap: 0.6rem;
  }
  /* a link opened cold cannot start the sound by itself: one clear way to, which stays until it is used */
  .film-sound-on {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    padding: 0 1rem 0 0.85rem;
    border-radius: var(--ws-radius);
    background: #fff;
    color: #000;
    font-size: var(--ws-text-ui);
    font-weight: 600;
    box-shadow: 0 12px 32px -8px rgb(0 0 0 / 0.4);
  }

  /* ---- Room: the same film for a screen across the room, read from three metres (DESIGN.md, Room). Sizes follow
     the screen's shorter side (vmin), so a 1080p TV, the AORUS and a 4K TV read alike: the caption is 32px at 1080p,
     the title about 150px; the margins keep to a TV's title-safe area. The pointer is hidden until the mouse moves. */
  .film[data-dress='room'] {
    --film-gutter: clamp(1.25rem, 4.8vmin, 6.5rem);
    --room-caption: clamp(1rem, 3vmin, 4rem);
    --room-control: clamp(2.75rem, 6vmin, 8rem);
    --room-icon: clamp(1.375rem, 3.2vmin, 4.25rem);
  }
  .film[data-dress='room']:not([data-pointer]) {
    cursor: none;
  }
  .film[data-dress='room'] .film-scrim-foot {
    height: min(66%, 60rem);
    background: linear-gradient(to top, rgb(0 0 0 / 0.62), rgb(0 0 0 / 0.36) 38%, rgb(0 0 0 / 0.12) 72%, transparent);
  }
  .film[data-dress='room'] .film-scrim-head {
    height: max(9rem, 24vmin);
  }
  .film[data-dress='room'] .film-head {
    align-items: center;
    gap: clamp(0.75rem, 1.6vmin, 2rem);
  }
  .film[data-dress='room'] .film-where {
    padding-top: 0;
  }
  .film[data-dress='room'] .film-where-name {
    font-size: clamp(1.25rem, 3.4vmin, 4.5rem);
  }
  .film[data-dress='room'] .film-title-name {
    max-width: 15ch;
    font-size: clamp(3.25rem, 14vmin, 19rem);
    line-height: 0.88;
  }
  .film[data-dress='room'] .film-title-line {
    margin-top: 0.7em;
    font-size: var(--room-caption);
    letter-spacing: 0.08em;
  }
  .film[data-dress='room'] .film-story {
    max-width: 34ch;
    font-size: clamp(1.125rem, 3.9vmin, 5.25rem);
    line-height: 1.3;
  }
  .film[data-dress='room'] .film-caption {
    font-size: var(--room-caption);
  }
  .film[data-dress='room'] .film-pill {
    gap: clamp(2px, 0.3vmin, 6px);
    padding: clamp(3px, 0.4vmin, 8px);
  }
  .film[data-dress='room'] .film-button,
  .film[data-dress='room'] .film-actions :global(button),
  .film[data-dress='room'] .film-actions :global(a) {
    min-width: var(--room-control);
    height: var(--room-control);
  }
  .film[data-dress='room'] .film-pill :global(svg) {
    width: var(--room-icon);
    height: var(--room-icon);
  }
  .film[data-dress='room'] .film-rule {
    margin-block: clamp(0.4rem, 1.2vmin, 1.5rem);
  }
  .film[data-dress='room'] .film-position,
  .film[data-dress='room'] .film-song {
    font-size: clamp(0.75rem, 2.3vmin, 3rem);
  }
  .film[data-dress='room'] .film-song {
    height: var(--room-control);
    padding-inline: 0.9em;
  }
  /* beside the transport on a wide screen; a phone gives the song a row of its own */
  @media (min-width: 768px) {
    .film[data-dress='room'] .film-song {
      max-width: min(36rem, 38vw);
    }
  }
  .film[data-dress='room'] .film-song :global(svg) {
    width: 1.2em;
    height: 1.2em;
  }
  .film[data-dress='room'] .film-position {
    min-width: 5em;
  }
  .film[data-dress='room'] .film-sound-on {
    min-height: var(--room-control);
    padding-inline: 0.9em 1.1em;
    font-size: clamp(0.875rem, 2.6vmin, 3.25rem);
  }
  .film[data-dress='room'] .film-sound-on :global(svg) {
    width: var(--room-icon);
    height: var(--room-icon);
  }

  /* a phone: the words over the whole width, the controls in a row of their own under them, thumb-sized */
  @media (max-width: 767px) {
    .film-foot {
      grid-template-columns: minmax(0, 1fr);
    }
    .film-transport {
      justify-items: stretch;
    }
    .film-transport .film-pill {
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .film-sound-on {
      justify-self: start;
    }
    .film-song {
      flex: 1 1 100%;
      order: -1;
      justify-content: flex-start;
      max-width: none;
    }
    .film-song + .film-rule {
      display: none;
    }
    .film-button {
      min-width: 2.75rem;
      height: 2.75rem;
    }
    .film-title-name {
      max-width: none;
    }
    /* a phone's top bar: the photo's date and place have the room (the title card said the name) */
    .film-where-name {
      display: none;
    }
    .film-where {
      padding-top: 0;
      align-self: center;
    }
    .film-where-data > span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .film-where-place::before {
      content: none;
    }
  }
  @media (pointer: coarse) {
    .film-button,
    .film-actions :global(button),
    .film-actions :global(a) {
      min-width: 2.75rem;
      height: 2.75rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .film-scrim,
    .film-chrome,
    .film-pill,
    .film-veil {
      transition-duration: 150ms;
    }
  }
  /* what Curator makes on request waits in the bottom-left corner of the window (routes/+layout), where the film's
     words are: while the film is up it waits at the top-left instead, under the close and the title */
  :global(body:has(section.film:not([hidden])) .ws-curator-corner) {
    top: calc(max(clamp(1rem, 0.6rem + 1.6vw, 2.5rem), env(safe-area-inset-top, 0px)) + 3.75rem);
    bottom: auto;
  }
</style>
