// Local Omarchy layer: a memory's film as a plan (DESIGN.md, Memories, The film). The owner chose "Full-screen film"
// (2026-10-16): photos fill the screen with a slow drift and soft crossfades, a title card first, the story one line
// at a time, music under it. Everything the film does is decided here, from the memory's photos, the frame's shape and
// what Curator knows, before anything plays: the title card, every shot with its time, its crossfade, how it fits the
// frame and how it drifts, the story's sentences on their photos, and the songs. The plan is plain data (numbers and
// strings, JSON as it is), so the player in the browser plays it and Curator's "Save as video" can later render the
// same film from it. Times are seconds from the film's start.

export const FILM_PLAN_VERSION = 1;

export const FILM_TIMING = {
  /** a photo's time on screen when the Memories duration preference says nothing */
  photo: 5,
  /** the title card */
  title: 5,
  /** the first photo comes up out of black */
  opening: 1.2,
  /** one shot into the next */
  fade: 1.4,
  /** with reduced motion: plain, shorter fades */
  reducedFade: 0.8,
  /** a video plays this long at most, muted, while the music carries on */
  videoMost: 8,
  videoLeast: 2,
  /** the title's words come up after the photo has begun */
  titleIn: 0.5,
  /** a sentence of the story comes after its photo (or the title's words, going) has begun */
  storyDelay: 0.8,
  /** leave enough time for the story to fade out before the next scene */
  storyOut: 0.35,
  /** a sentence needs this long at least to be read: slots shorter than it are left out */
  storyLeast: 1.5,
  /** the first song fades in, one song fades into the next, and the music fades over the film's last seconds */
  musicIn: 1.5,
  musicCross: 2,
  musicOut: 4,
} as const;

/** A photo fills the frame (cropped) when the crop keeps at least this share of it; else it is shown whole. */
export const FILL_KEEPS = 0.6;

/** The drift: a photo that fills the frame moves between these scales, a whole one breathes a little. */
const DRIFT = { wide: 1.04, near: 1.12, whole: 1.035 } as const;

/** Where the camera is: the scale over the photo filling the frame, and the photo's point (0 to 1) at its centre. */
export type FilmCamera = { scale: number; x: number; y: number };

export type FilmShot = {
  assetId: string;
  kind: 'photo' | 'video';
  /** which of the memory's photos it is (0-based), for "3/20"; -1 for a cover that is not one of them */
  index: number;
  /** the title card's photo: the cover, or the first photo with the title over it */
  opening: boolean;
  /** the photo's width over its height, as shown; null when unknown */
  ratio: number | null;
  start: number;
  /** until the next shot begins (the last: until the film ends) */
  duration: number;
  /** how long it crossfades in over the shot before (the first: out of black) */
  fade: number;
  /** on screen until then: the next shot's crossfade is over (the last: the film's end) */
  end: number;
  /** fills the frame, cropped toward its faces, or is shown whole over a blurred copy of itself */
  fit: 'fill' | 'whole';
  /** the camera at `start` and at `end`; a video holds still and plays muted from its start */
  from: FilmCamera;
  to: FilmCamera;
};

export type FilmText =
  | { kind: 'title'; text: string; line: string; start: number; end: number }
  | { kind: 'story'; text: string; start: number; end: number };

/** A song under part of the film, from the start of the song (`offset` 0), fading in and out. */
export type FilmCue = {
  trackId: string;
  title: string;
  artist: string;
  src: string;
  start: number;
  end: number;
  offset: number;
  fadeIn: number;
  fadeOut: number;
};

export type FilmPlan = {
  version: typeof FILM_PLAN_VERSION;
  memoryId: string;
  /** the frame's width over its height that fits and drifts were worked out for */
  aspect: number;
  duration: number;
  shots: FilmShot[];
  texts: FilmText[];
  music: FilmCue[];
};

export type FilmAsset = {
  id: string;
  /** Identical imported files may have different asset ids. */
  checksum?: string;
  kind: 'photo' | 'video';
  /** width over height as shown, null when unknown (then the photo is shown whole) */
  ratio: number | null;
  /** a video's length in seconds */
  seconds?: number | null;
};

/** Existing story words linked to the source media that supports them. */
export type FilmStoryCue = { text: string; assetIds: string[] };

export type FilmTrack = {
  id: string;
  title: string;
  artist: string;
  /** seconds */
  duration: number;
  bpm: number | null;
  src: string;
};

export type FilmPlanInput = {
  memoryId: string;
  assets: FilmAsset[];
  /** the frame's width over its height */
  aspect: number;
  /** the title card's photo (Curator's cover), else the first photo */
  cover?: string | null;
  /** the faces' centre in each photo (0 to 1), for the drift */
  focus?: Record<string, [number, number]>;
  title: { text: string; line: string };
  /** the story, a sentence at a time (splitSentences) */
  sentences?: string[];
  /** When provided, only source-linked sentences are shown. An empty list deliberately has no scene text. */
  storyCues?: FilmStoryCue[];
  /** the songs, the one to play first first */
  tracks?: FilmTrack[];
  /** the tempo the cuts follow (the first song's when the film began; a skip keeps it, so the shots keep their
   * times); left out, the first song's */
  bpm?: number | null;
  /** where the songs begin (the film's start; later when a skip starts the next song) */
  musicFrom?: number;
  /** a photo's time on screen */
  photoSeconds?: number;
  reducedMotion?: boolean;
};

const round = (value: number, places = 3) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The share of a photo's width and height a frame shows when the photo fills it (object-fit: cover). */
export const coverWindow = (ratio: number, aspect: number) =>
  ratio >= aspect ? { w: aspect / ratio, h: 1 } : { w: 1, h: ratio / aspect };

/** The share of a photo a frame of this shape keeps when the photo fills it. */
export const keptShare = (ratio: number, aspect: number) => (ratio >= aspect ? aspect / ratio : ratio / aspect);

const fitOf = (ratio: number | null, aspect: number): FilmShot['fit'] =>
  ratio && ratio > 0 && keptShare(ratio, aspect) >= FILL_KEEPS ? 'fill' : 'whole';

/** A song's beat in seconds, when its tempo is one a cut can follow. */
const beatOf = (bpm: number | null | undefined) => (bpm && bpm >= 50 && bpm <= 220 ? 60 / bpm : undefined);

/** Seconds on the beat: the nearest whole number of beats (`down`: not past the time, for a video's length). */
const onBeat = (seconds: number, beat: number | undefined, down = false) => {
  if (!beat) {
    return seconds;
  }
  const beats = down ? Math.floor(seconds / beat + 1e-6) : Math.round(seconds / beat);
  return Math.max(1, beats) * beat;
};

/** A song's length in seconds: Curator says seconds; a value only milliseconds could mean is read as those. */
const trackSeconds = (track: FilmTrack) => {
  const value = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0;
  return value > 36_000 ? value / 1000 : value;
};

/** The camera kept inside the photo: at a scale the frame shows a window of it, which may not leave the photo. */
const inside = (camera: FilmCamera, window: { w: number; h: number }): FilmCamera => {
  const halfW = window.w / (2 * camera.scale);
  const halfH = window.h / (2 * camera.scale);
  return {
    scale: round(camera.scale, 4),
    x: round(clamp(camera.x, halfW, 1 - halfW), 4),
    y: round(clamp(camera.y, halfH, 1 - halfH), 4),
  };
};

const mix = (a: number, b: number, share: number) => a + (b - a) * share;

/**
 * How a shot moves: a photo that fills the frame zooms in toward its faces or out from them, every other shot the
 * other way; without faces it zooms on its middle with a small pan, again alternating. A whole photo breathes in or
 * out a little; a video holds still. Reduced motion: no drift at all, the crop still toward the faces.
 */
const driftOf = (
  kind: FilmShot['kind'],
  fit: FilmShot['fit'],
  ratio: number | null,
  aspect: number,
  focus: [number, number] | undefined,
  ordinal: number,
  reducedMotion: boolean,
): { from: FilmCamera; to: FilmCamera } => {
  if (fit === 'whole' || !ratio) {
    const still = { scale: 1, x: 0.5, y: 0.5 };
    if (reducedMotion || kind === 'video') {
      return { from: still, to: still };
    }
    const breathed = { ...still, scale: DRIFT.whole };
    return ordinal % 2 === 0 ? { from: still, to: breathed } : { from: breathed, to: still };
  }
  const window = coverWindow(ratio, aspect);
  const target = focus
    ? { x: clamp(focus[0], 0, 1), y: clamp(focus[1], 0, 1) }
    : { x: 0.5 + (ordinal % 4 < 2 ? -0.04 : 0.04), y: 0.46 };
  if (reducedMotion || kind === 'video') {
    const still = inside({ scale: 1, ...(focus ? target : { x: 0.5, y: 0.5 }) }, window);
    return { from: still, to: still };
  }
  const wide = inside(
    { scale: DRIFT.wide, x: mix(0.5, target.x, focus ? 0.3 : 0), y: mix(0.5, target.y, focus ? 0.3 : 0) },
    window,
  );
  const near = inside({ scale: DRIFT.near, ...target }, window);
  return ordinal % 2 === 0 ? { from: wide, to: near } : { from: near, to: wide };
};

/** The story a sentence at a time, in the locale's own sense of a sentence. */
export const splitSentences = (story: string | null | undefined, locale?: string): string[] => {
  const text = story?.replaceAll(/\s+/g, ' ').trim();
  if (!text) {
    return [];
  }
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
    return [...segmenter.segment(text)].map(({ segment }) => segment.trim()).filter(Boolean);
  }
  return text
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

type Slot = { start: number; end: number };

/**
 * The story's sentences on the shots after the title card: each sentence over as many shots as its length asks (a
 * long one stays over two photos), one at a time; when there are more sentences than shots, a shot takes two.
 */
const storyTexts = (sentences: string[], slots: Slot[]): FilmText[] => {
  if (sentences.length === 0 || slots.length === 0) {
    return [];
  }
  const groups: string[] = [];
  if (sentences.length > slots.length) {
    for (let slot = 0; slot < slots.length; slot++) {
      const from = Math.round((sentences.length * slot) / slots.length);
      const to = Math.round((sentences.length * (slot + 1)) / slots.length);
      groups.push(sentences.slice(from, to).join(' '));
    }
    return groups.map((text, slot) => ({ kind: 'story', text, start: slots[slot].start, end: slots[slot].end }));
  }
  // cut the slots among the sentences by their length, at least one slot each
  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0) || 1;
  const cuts = [0];
  let read = 0;
  for (let index = 0; index < sentences.length - 1; index++) {
    read += sentences[index].length;
    const ideal = Math.round((slots.length * read) / total);
    const least = cuts[index] + 1;
    const most = slots.length - (sentences.length - 1 - index);
    cuts.push(clamp(ideal, least, most));
  }
  cuts.push(slots.length);
  return sentences.map((text, index) => ({
    kind: 'story',
    text,
    start: slots[cuts[index]].start,
    end: slots[cuts[index + 1] - 1].end,
  }));
};

/** The songs under the film: the first from `from`, each into the next when it ends before the film does. */
const musicCues = (tracks: FilmTrack[], from: number, duration: number): FilmCue[] => {
  const playable = tracks.filter((track) => track.src);
  const cues: FilmCue[] = [];
  let at = clamp(from, 0, duration);
  for (let index = 0; playable.length > 0 && at < duration - 0.5 && index < 64; index++) {
    const track = playable[index % playable.length];
    const length = trackSeconds(track);
    if (length > 0 && length < FILM_TIMING.musicCross * 2) {
      // a song too short to fade in and out is left out (and one that keeps being too short ends the music)
      if (playable.every((candidate) => trackSeconds(candidate) < FILM_TIMING.musicCross * 2)) {
        break;
      }
      continue;
    }
    const end = length > 0 ? Math.min(duration, at + length) : duration;
    const last = end >= duration - 1e-6;
    cues.push({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      src: track.src,
      start: round(at),
      end: round(end),
      offset: 0,
      fadeIn: cues.length === 0 && at === 0 ? FILM_TIMING.musicIn : FILM_TIMING.musicCross,
      fadeOut: last ? Math.min(FILM_TIMING.musicOut, end - at) : FILM_TIMING.musicCross,
    });
    if (last) {
      break;
    }
    at = end - FILM_TIMING.musicCross;
  }
  return cues;
};

const videoSeconds = (seconds: number | null | undefined, photoSeconds: number) => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return photoSeconds;
  }
  return clamp(Math.min(seconds, FILM_TIMING.videoMost), Math.min(FILM_TIMING.videoLeast, seconds), seconds);
};

/** The film of a memory: its title card, its shots in order, the story on them and the songs under them. */
export const buildFilmPlan = (input: FilmPlanInput): FilmPlan => {
  const aspect = input.aspect > 0 && Number.isFinite(input.aspect) ? input.aspect : 16 / 9;
  const reducedMotion = !!input.reducedMotion;
  const photoSeconds = clamp(input.photoSeconds ?? FILM_TIMING.photo, 2, 30);
  const beat = beatOf(input.bpm === undefined ? input.tracks?.[0]?.bpm : input.bpm);
  const titleSeconds = onBeat(FILM_TIMING.title, beat);
  const fade = reducedMotion ? FILM_TIMING.reducedFade : FILM_TIMING.fade;

  type Entry = { asset: FilmAsset; index: number; opening: boolean; seconds: number };
  const entries: Entry[] = [];
  const seenIds = new Set<string>();
  const seenChecksums = new Set<string>();
  const cover = input.assets.find(({ id }) => id === input.cover);
  const ordered = cover ? [cover, ...input.assets] : input.assets;
  const assets = ordered.filter((asset) => {
    const duplicate = seenIds.has(asset.id) || (!!asset.checksum && seenChecksums.has(asset.checksum));
    seenIds.add(asset.id);
    if (asset.checksum) {
      seenChecksums.add(asset.checksum);
    }
    return !duplicate;
  });
  const separateCover = !!input.cover && !cover && assets.length > 0;
  if (separateCover) {
    entries.push({
      asset: { id: input.cover!, kind: 'photo', ratio: null },
      index: -1,
      opening: true,
      seconds: titleSeconds,
    });
  }
  // The cover gets time for its title and its scene in one shot, then each remaining photo appears once.
  for (const [index, asset] of assets.entries()) {
    const seconds =
      asset.kind === 'video'
        ? onBeat(videoSeconds(asset.seconds, photoSeconds), beat, true)
        : onBeat(photoSeconds, beat);
    const opening = !separateCover && index === 0;
    entries.push({ asset, index, opening, seconds: opening ? titleSeconds + seconds : seconds });
  }

  const shots: FilmShot[] = [];
  let start = 0;
  for (const [ordinal, entry] of entries.entries()) {
    const shotFade =
      ordinal === 0 ? Math.min(FILM_TIMING.opening, entry.seconds / 2) : Math.min(fade, entry.seconds / 2);
    const fit = fitOf(entry.asset.ratio, aspect);
    const drift = driftOf(
      entry.asset.kind,
      fit,
      entry.asset.ratio,
      aspect,
      input.focus?.[entry.asset.id],
      ordinal,
      reducedMotion,
    );
    shots.push({
      assetId: entry.asset.id,
      kind: entry.asset.kind,
      index: entry.index,
      opening: entry.opening,
      ratio: entry.asset.ratio && entry.asset.ratio > 0 ? round(entry.asset.ratio, 4) : null,
      start: round(start),
      duration: round(entry.seconds),
      fade: round(shotFade),
      end: 0,
      fit,
      ...drift,
    });
    start += entry.seconds;
  }
  const duration = round(start);
  for (const [ordinal, shot] of shots.entries()) {
    const next = shots[ordinal + 1];
    shot.end = next ? round(next.start + next.fade) : duration;
  }

  const texts: FilmText[] = [];
  const titleEnd = round(Math.min(titleSeconds, duration));
  if (shots.length > 0 && input.title.text) {
    texts.push({
      kind: 'title',
      text: input.title.text,
      line: input.title.line,
      start: FILM_TIMING.titleIn,
      end: titleEnd,
    });
  }
  // the story's slots: each shot's time after the title card, a sentence coming a moment after its photo (or the
  // title's words) began
  const slots = shots
    .map((shot) => ({
      start: round(Math.max(shot.start, titleEnd) + FILM_TIMING.storyDelay),
      end: round(shot.start + shot.duration),
    }))
    .filter((slot) => slot.end - slot.start >= FILM_TIMING.storyLeast);
  if (input.storyCues === undefined) {
    texts.push(...storyTexts(input.sentences ?? [], slots));
  } else {
    for (const shot of shots) {
      const text = input.storyCues
        .filter((cue) => cue.assetIds.includes(shot.assetId))
        .map((cue) => cue.text.trim())
        .filter(Boolean)
        .join(' ');
      // Wait until the incoming picture is visible; finish the text's fade before the next scene starts.
      const start = round(
        Math.max(shot.start + Math.max(shot.fade, FILM_TIMING.storyDelay), titleEnd + FILM_TIMING.storyDelay),
      );
      const end = round(shot.start + shot.duration - FILM_TIMING.storyOut);
      if (text && end - start >= FILM_TIMING.storyLeast) {
        texts.push({ kind: 'story', text, start, end });
      }
    }
  }

  return {
    version: FILM_PLAN_VERSION,
    memoryId: input.memoryId,
    aspect: round(aspect, 4),
    duration,
    shots,
    texts,
    music: musicCues(input.tracks ?? [], input.musicFrom ?? 0, duration),
  };
};

/** What is on screen at a moment of the film: the shot, whether the title shows, the story's text, the end. */
export type FilmMoment = {
  /** the shot that has begun last (it may still be fading in over the one before) */
  shot: number;
  title: boolean;
  /** the story text showing (an index into the plan's story texts), -1 for none */
  story: number;
  /** the music is fading out over the film's last seconds */
  fading: boolean;
  ended: boolean;
};

export const storyOf = (plan: FilmPlan) =>
  plan.texts.filter((text): text is Extract<FilmText, { kind: 'story' }> => text.kind === 'story');

const EPSILON = 1e-3;

export const filmMomentAt = (plan: FilmPlan, time: number): FilmMoment => {
  let shot = 0;
  for (const [index, candidate] of plan.shots.entries()) {
    if (candidate.start <= time + EPSILON) {
      shot = index;
    }
  }
  const title = plan.texts.some((text) => text.kind === 'title' && text.start <= time + EPSILON && time < text.end);
  const story = storyOf(plan).findIndex((text) => text.start <= time + EPSILON && time < text.end);
  const lastCue = plan.music.at(-1);
  return {
    shot,
    title,
    story,
    fading: !!lastCue && time >= plan.duration - lastCue.fadeOut - EPSILON && time < plan.duration,
    ended: plan.shots.length === 0 || time >= plan.duration - EPSILON,
  };
};

/** Every moment something changes on screen, in order: the player wakes at these and nowhere else. */
export const filmChanges = (plan: FilmPlan): number[] => {
  const times = new Set<number>();
  for (const shot of plan.shots) {
    times.add(shot.start);
  }
  for (const text of plan.texts) {
    times.add(text.start);
    times.add(text.end);
  }
  const lastCue = plan.music.at(-1);
  if (lastCue) {
    times.add(round(plan.duration - lastCue.fadeOut));
  }
  times.add(plan.duration);
  return [...times].filter((time) => time >= 0 && time <= plan.duration).sort((a, b) => a - b);
};

/** The one shot that shows this photo. */
export const shotOfAsset = (plan: FilmPlan, assetId: string) =>
  plan.shots.findIndex((shot) => shot.assetId === assetId);

const percent = (value: number) => `${round(value, 3)}%`;

/**
 * A shot as CSS for the player: how big the photo is laid out (a share of the frame) and its transform at the start
 * and at the end, origin at its top-left corner, so the drift is a transform and an opacity only, on the GPU. A photo
 * that fills the frame is laid out as large as the frame's shape asks of it and moved so the camera's point sits in the
 * middle; a whole photo is the frame's size (object-fit: contain) and only scales, around its middle.
 */
export const shotFrame = (shot: FilmShot, aspect: number) => {
  if (shot.fit === 'whole' || !shot.ratio) {
    return {
      fill: false,
      width: '100%',
      height: '100%',
      from: `scale(${shot.from.scale})`,
      to: `scale(${shot.to.scale})`,
    };
  }
  const window = coverWindow(shot.ratio, aspect);
  const transform = (camera: FilmCamera) =>
    `translate(${percent((window.w / 2 - camera.scale * camera.x) * 100)}, ${percent((window.h / 2 - camera.scale * camera.y) * 100)}) scale(${camera.scale})`;
  return {
    fill: true,
    width: percent(100 / window.w),
    height: percent(100 / window.h),
    from: transform(shot.from),
    to: transform(shot.to),
  };
};
