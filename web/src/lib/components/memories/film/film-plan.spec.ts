import {
  buildFilmPlan,
  coverWindow,
  FILL_KEEPS,
  FILM_TIMING,
  filmChanges,
  filmMomentAt,
  keptShare,
  shotFrame,
  shotOfAsset,
  splitSentences,
  storyOf,
  type FilmAsset,
  type FilmCamera,
  type FilmPlanInput,
  type FilmShot,
  type FilmTrack,
} from './film-plan';

const LANDSCAPE = 16 / 9;
const PHONE = 390 / 844;

const photos = (count: number, ratio: number | null = 1.5): FilmAsset[] =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index}`, kind: 'photo', ratio }));

const plan = (overrides: Partial<FilmPlanInput> = {}) =>
  buildFilmPlan({
    memoryId: 'memory-1',
    assets: photos(3),
    aspect: LANDSCAPE,
    title: { text: 'Siem Reap', line: 'October 2025 · 192 photos' },
    ...overrides,
  });

const track = (id: string, duration: number, bpm: number | null = null): FilmTrack => ({
  id,
  title: `Song ${id}`,
  artist: 'Someone',
  duration,
  bpm,
  src: `/api/music/${id}`,
});

/** a camera's window stays inside its photo */
const isInside = (shot: FilmShot, camera: FilmCamera, aspect: number) => {
  if (shot.fit === 'whole' || !shot.ratio) {
    return camera.x === 0.5 && camera.y === 0.5;
  }
  const window = coverWindow(shot.ratio, aspect);
  const halfW = window.w / (2 * camera.scale);
  const halfH = window.h / (2 * camera.scale);
  const slack = 1e-4;
  return (
    camera.scale >= 1 &&
    camera.x >= halfW - slack &&
    camera.x <= 1 - halfW + slack &&
    camera.y >= halfH - slack &&
    camera.y <= 1 - halfH + slack
  );
};

describe('buildFilmPlan', () => {
  it('anchors reordered story sentences to their photos and leaves an unrelated video without them', () => {
    const film = plan({
      assets: [...photos(3), { id: 'evening-video', kind: 'video', ratio: 1.5, seconds: 28 }],
      sentences: ['An introduction.', 'She held up two fingers.', 'A boy sat in the rain.'],
      storyCues: [
        { text: 'She held up two fingers.', assetIds: ['p2'] },
        { text: 'A boy sat in the rain.', assetIds: ['p1'] },
      ],
    });
    const cues = storyOf(film);
    expect(cues.map(({ text }) => text)).toEqual(['A boy sat in the rain.', 'She held up two fingers.']);
    for (const [index, cue] of cues.entries()) {
      const shot = film.shots[index + 1];
      expect(cue.start).toBeGreaterThanOrEqual(shot.start + shot.fade);
      expect(cue.end + 0.35).toBeLessThanOrEqual(shot.start + shot.duration);
      expect(filmMomentAt(film, cue.start).shot).toBe(index + 1);
    }
    expect(filmMomentAt(film, film.shots[3].start + 2).story).toBe(-1);
  });

  it('does not invent scene timing when links are missing or their source photo was removed', () => {
    expect(storyOf(plan({ sentences: ['Not linked.'], storyCues: [] }))).toEqual([]);
    expect(storyOf(plan({ storyCues: [{ text: 'A removed photo.', assetIds: ['gone'] }] }))).toEqual([]);
  });

  it('shows the cover story after the title in the same shot, once, at every tempo', () => {
    for (const bpm of [null, 96, 127]) {
      const film = plan({
        cover: 'p2',
        bpm,
        storyCues: [{ text: 'The cover photo, in its proper place.', assetIds: ['p2'] }],
      });
      const cues = storyOf(film);
      expect(cues).toHaveLength(1);
      expect(filmMomentAt(film, cues[0].start).shot).toBe(0);
      expect(cues[0].start).toBeGreaterThan(film.texts[0].end);
      expect(cues[0].end).toBeLessThan(film.duration);
    }
  });

  it('opens on the first photo with the title over it, then gives every photo its time', () => {
    const film = plan();

    expect(film.shots.map(({ assetId, index, opening }) => [assetId, index, opening])).toEqual([
      ['p0', 0, true],
      ['p1', 1, false],
      ['p2', 2, false],
    ]);
    expect(film.shots[0]).toMatchObject({ start: 0, duration: FILM_TIMING.title + 5, fade: FILM_TIMING.opening });
    expect(film.shots[1]).toMatchObject({ start: 10, duration: 5, fade: FILM_TIMING.fade });
    expect(film.duration).toBe(20);
    expect(film.texts[0]).toEqual({
      kind: 'title',
      text: 'Siem Reap',
      line: 'October 2025 · 192 photos',
      start: FILM_TIMING.titleIn,
      end: FILM_TIMING.title,
    });
  });

  it("opens on Curator's cover and shows every photo exactly once", () => {
    const film = plan({ cover: 'p2' });

    expect(film.shots.map(({ assetId, opening }) => [assetId, opening])).toEqual([
      ['p2', true],
      ['p0', false],
      ['p1', false],
    ]);
    expect(film.shots[0]).toMatchObject({ index: 0, duration: FILM_TIMING.title + 5 });
    expect(shotOfAsset(film, 'p2')).toBe(0);
    expect(shotOfAsset(film, 'p0')).toBe(1);
  });

  it('removes repeated ids and identical imports, even when an identical import is the cover', () => {
    const film = plan({
      assets: [
        { ...photos(1)[0], checksum: 'same-file' },
        ...photos(2),
        { id: 'copy', kind: 'photo', ratio: 1.5, checksum: 'same-file' },
      ],
      cover: 'copy',
    });
    expect(film.shots.map(({ assetId, index }) => [assetId, index])).toEqual([
      ['copy', 0],
      ['p1', 1],
    ]);
    expect(film.duration).toBe(15);
  });

  it('opens on a cover that is not one of the photos, shown whole', () => {
    const film = plan({ cover: 'elsewhere' });

    expect(film.shots[0]).toMatchObject({ assetId: 'elsewhere', index: -1, opening: true, fit: 'whole' });
    expect(film.shots).toHaveLength(4);
  });

  it('crossfades each shot into the next and keeps it on screen until that fade is over', () => {
    const film = plan({ assets: photos(5) });

    for (const [index, shot] of film.shots.entries()) {
      const next = film.shots[index + 1];
      if (next) {
        expect(next.start).toBeCloseTo(shot.start + shot.duration);
        expect(shot.end).toBeCloseTo(next.start + next.fade);
        expect(next.fade).toBeLessThanOrEqual(next.duration / 2);
      } else {
        expect(shot.end).toBe(film.duration);
      }
    }
  });

  it('takes its time per photo from the Memories duration', () => {
    const film = plan({ photoSeconds: 8 });

    expect(film.shots[1].duration).toBe(8);
    expect(film.shots[0].duration).toBe(FILM_TIMING.title + 8);
  });

  it('fills the frame when a crop keeps most of the photo, and shows it whole when it would not', () => {
    const fits = (aspect: number, ratio: number | null) =>
      plan({ aspect, assets: [{ id: 'p0', kind: 'photo', ratio }] }).shots[0].fit;

    expect(fits(LANDSCAPE, 4 / 3)).toBe('fill');
    expect(fits(LANDSCAPE, 1)).toBe('whole');
    expect(fits(LANDSCAPE, 3 / 4)).toBe('whole');
    expect(fits(LANDSCAPE, null)).toBe('whole');
    // a phone held upright: its own 3:4 photos fill it, a landscape photo is shown whole over its blurred copy
    expect(fits(PHONE, 3 / 4)).toBe('fill');
    expect(fits(PHONE, 4 / 3)).toBe('whole');
    // the Dell, portrait
    expect(fits(1296 / 2304, 3 / 4)).toBe('fill');
    expect(fits(1296 / 2304, 3 / 2)).toBe('whole');
    expect(keptShare(4 / 3, LANDSCAPE)).toBeGreaterThan(FILL_KEEPS);
  });

  it('drifts toward the faces, zooming in and out by turns', () => {
    const film = plan({ assets: photos(2), focus: { p0: [0.8, 0.3], p1: [0.2, 0.7] } });
    const [toward, away] = film.shots;

    expect(toward.to.scale).toBeGreaterThan(toward.from.scale);
    expect(toward.to.x).toBeGreaterThan(toward.from.x);
    expect(toward.to.y).toBeLessThan(toward.from.y);
    expect(away.from.scale).toBeGreaterThan(away.to.scale);
    expect(away.from.x).toBeLessThan(away.to.x);
  });

  it('keeps every camera inside its photo', () => {
    const assets: FilmAsset[] = [0.5, 0.75, 1, 4 / 3, 1.5, 16 / 9, 2.4].map((ratio, index) => ({
      id: `p${index}`,
      kind: 'photo',
      ratio,
    }));
    const focus = Object.fromEntries(
      assets.map(({ id }, index) => [id, [index % 2, (index * 0.37) % 1] as [number, number]]),
    );
    for (const aspect of [LANDSCAPE, PHONE, 1296 / 2304, 4 / 3]) {
      for (const film of [plan({ aspect, assets, focus }), plan({ aspect, assets })]) {
        for (const shot of film.shots) {
          expect(isInside(shot, shot.from, aspect)).toBe(true);
          expect(isInside(shot, shot.to, aspect)).toBe(true);
        }
      }
    }
  });

  it('holds still with reduced motion, the crop still toward the faces, and fades plainly', () => {
    // a 4:3 photo fills a 16:9 frame with room above and below: the crop goes up toward the faces
    const film = plan({ reducedMotion: true, focus: { p1: [0.5, 0.1] }, assets: photos(3, 4 / 3) });

    for (const shot of film.shots) {
      expect(shot.to).toEqual(shot.from);
    }
    expect(film.shots[1].from.y).toBeLessThan(0.5);
    expect(film.shots[2].fade).toBe(FILM_TIMING.reducedFade);
  });

  it('plays a video muted for a few seconds, holding still', () => {
    const film = plan({
      assets: [
        ...photos(1),
        { id: 'long', kind: 'video', ratio: 16 / 9, seconds: 30 },
        { id: 'short', kind: 'video', ratio: 16 / 9, seconds: 3 },
        { id: 'unknown', kind: 'video', ratio: 16 / 9, seconds: null },
      ],
    });
    const [, long, short, unknown] = film.shots;

    expect(long).toMatchObject({ kind: 'video', duration: FILM_TIMING.videoMost });
    expect(long.to).toEqual(long.from);
    expect(short.duration).toBe(3);
    expect(unknown.duration).toBe(5);
  });

  it('puts the story a sentence at a time on the photos after the title card', () => {
    const film = plan({ assets: photos(6), sentences: ['Temples at dawn.', 'Then lunch by the river.', 'Home late.'] });
    const story = storyOf(film);

    expect(story.map(({ text }) => text)).toEqual(['Temples at dawn.', 'Then lunch by the river.', 'Home late.']);
    expect(story[0].start).toBeGreaterThanOrEqual(FILM_TIMING.title);
    for (const [index, text] of story.entries()) {
      expect(text.end).toBeGreaterThan(text.start);
      if (index > 0) {
        expect(text.start).toBeGreaterThanOrEqual(story[index - 1].end);
      }
    }
    expect(story.at(-1)!.end).toBe(film.duration);
    // a sentence begins a moment after its photo
    const starts = new Set(film.shots.map(({ start }) => start + FILM_TIMING.storyDelay));
    expect(story.slice(1).every(({ start }) => [...starts].some((at) => Math.abs(at - start) < 1e-6))).toBe(true);
  });

  it('gives a long sentence more photos than a short one', () => {
    const story = storyOf(
      plan({
        assets: photos(8),
        sentences: ['Short.', 'This one goes on for a good while about the temples, the river and the long way home.'],
      }),
    );

    expect(story[1].end - story[1].start).toBeGreaterThan(story[0].end - story[0].start);
  });

  it('puts two sentences on a photo when there are more sentences than photos', () => {
    const story = storyOf(plan({ assets: photos(2), sentences: ['One.', 'Two.', 'Three.', 'Four.'] }));

    expect(story.map(({ text }) => text)).toEqual(['One. Two.', 'Three. Four.']);
  });

  it('cuts on the beat of the first song', () => {
    const film = plan({ tracks: [track('a', 200, 100)] });
    const beat = 60 / 100;

    expect(film.shots[1].duration).toBeCloseTo(8 * beat);
    expect(film.texts[0].end).toBeCloseTo(8 * beat);
    for (const shot of film.shots) {
      expect((shot.duration / beat) % 1).toBeCloseTo(0, 5);
    }
  });

  it('keeps its cuts when a skip brings a song of another tempo', () => {
    const before = plan({ tracks: [track('a', 200, 100), track('b', 200, 140)] });
    const after = plan({ tracks: [track('b', 200, 140), track('a', 200, 100)], bpm: 100, musicFrom: 7 });

    expect(after.shots.map(({ start }) => start)).toEqual(before.shots.map(({ start }) => start));
    expect(after.music[0]).toMatchObject({ trackId: 'b', start: 7, fadeIn: FILM_TIMING.musicCross });
  });

  it('lays the songs under the film, one into the next, the music fading out at the end', () => {
    const film = plan({ assets: photos(20), tracks: [track('a', 30), track('b', 60)] });

    expect(film.music.map(({ trackId, start, end }) => [trackId, start, end])).toEqual([
      ['a', 0, 30],
      ['b', 28, 88],
      ['a', 86, film.duration],
    ]);
    expect(film.music[0].fadeIn).toBe(FILM_TIMING.musicIn);
    expect(film.music.at(-1)!.fadeOut).toBe(FILM_TIMING.musicOut);
  });

  it('is silent without songs', () => {
    expect(plan().music).toEqual([]);
  });

  it('is plain data, the same after a trip through JSON', () => {
    const film = plan({
      cover: 'p1',
      focus: { p0: [0.4, 0.4] },
      sentences: ['One.', 'Two.'],
      tracks: [track('a', 90, 120)],
      assets: [...photos(3), { id: 'v', kind: 'video', ratio: 9 / 16, seconds: 12 }],
    });

    const json = JSON.stringify(film);
    expect(JSON.parse(json)).toEqual(film);
    expect(film.version).toBe(1);
  });

  it('has nothing to play for a memory without photos', () => {
    const film = plan({ assets: [] });

    expect(film.shots).toEqual([]);
    expect(film.texts).toEqual([]);
    expect(film.duration).toBe(0);
    expect(filmMomentAt(film, 0).ended).toBe(true);
  });
});

describe('filmMomentAt', () => {
  const film = plan({ sentences: ['One.', 'Two.'], tracks: [track('a', 600)] });

  it('shows the title card first, then the story, then the end', () => {
    expect(filmMomentAt(film, 0)).toEqual({ shot: 0, title: false, story: -1, fading: false, ended: false });
    expect(filmMomentAt(film, 1)).toMatchObject({ shot: 0, title: true, story: -1 });
    expect(filmMomentAt(film, 7)).toMatchObject({ shot: 0, title: false, story: 0 });
    expect(filmMomentAt(film, 12)).toMatchObject({ shot: 1, story: 0 });
    expect(filmMomentAt(film, 17)).toMatchObject({ shot: 2, story: 1 });
    expect(filmMomentAt(film, film.duration - 1)).toMatchObject({ shot: 2, fading: true, ended: false });
    expect(filmMomentAt(film, film.duration)).toMatchObject({ ended: true });
  });

  it('wakes the player at every change and nowhere else', () => {
    const changes = filmChanges(film);

    expect(changes).toEqual([...changes].sort((a, b) => a - b));
    expect(changes).toContain(0);
    expect(changes).toContain(film.shots[1].start);
    expect(changes).toContain(film.texts[0].end);
    expect(changes).toContain(film.duration - FILM_TIMING.musicOut);
    expect(changes.at(-1)).toBe(film.duration);
  });
});

describe('shotFrame', () => {
  const shot = (overrides: Partial<FilmShot>): FilmShot => ({
    assetId: 'p0',
    kind: 'photo',
    index: 0,
    opening: false,
    ratio: 2,
    start: 0,
    duration: 5,
    fade: 1,
    end: 6,
    fit: 'fill',
    from: { scale: 1, x: 0.5, y: 0.5 },
    to: { scale: 1.1, x: 0.6, y: 0.5 },
    ...overrides,
  });

  it('lays a photo that fills the frame out as large as the frame asks, centred on the camera', () => {
    const frame = shotFrame(shot({}), LANDSCAPE);

    expect(frame).toMatchObject({ fill: true, width: '112.5%', height: '100%' });
    expect(frame.from).toBe('translate(-5.556%, 0%) scale(1)');
    expect(frame.to).toBe('translate(-21.556%, -5%) scale(1.1)');
  });

  it('scales a whole photo around its middle only', () => {
    expect(
      shotFrame(
        shot({ fit: 'whole', from: { scale: 1, x: 0.5, y: 0.5 }, to: { scale: 1.035, x: 0.5, y: 0.5 } }),
        LANDSCAPE,
      ),
    ).toEqual({
      fill: false,
      width: '100%',
      height: '100%',
      from: 'scale(1)',
      to: 'scale(1.035)',
    });
  });
});

describe('splitSentences', () => {
  it('splits a story into its sentences', () => {
    expect(splitSentences('Temples at dawn.  Then lunch by the river! Home late?', 'en')).toEqual([
      'Temples at dawn.',
      'Then lunch by the river!',
      'Home late?',
    ]);
  });

  it('has none for no story', () => {
    expect(splitSentences(null)).toEqual([]);
    expect(splitSentences(' '.repeat(3))).toEqual([]);
  });
});
