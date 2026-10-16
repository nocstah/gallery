import type { MemoryTrack } from '$lib/utils/curator';
import { FilmMusic } from './film-music.svelte';

const track = (id: string): MemoryTrack => ({
  id,
  title: `Song ${id}`,
  artist: 'Someone',
  duration: 200,
  bpm: 100,
  src: `/api/music/${id}`,
});

const url = (src: string) => `https://curator.test${src}`;

describe('FilmMusic', () => {
  // the fades run on animation frames: the test moves the clock and runs the frames waiting
  let now = 0;
  let frames: FrameRequestCallback[] = [];
  let started: HTMLMediaElement[] = [];
  let paused: HTMLMediaElement[] = [];

  const advance = (ms: number) => {
    for (let step = 0; step < ms; step += 50) {
      now += Math.min(50, ms - step);
      const due = frames;
      frames = [];
      for (const frame of due) {
        frame(now);
      }
    }
  };

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    now = 0;
    frames = [];
    started = [];
    paused = [];
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
      frames.push(frame);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      started.push(this);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      paused.push(this);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('plays the first song from Curator, fading it in', async () => {
    const music = new FilmMusic([track('a'), track('b')], url);

    await music.play(1000);
    const [audio] = started;
    expect(audio.src).toBe('https://curator.test/api/music/a');
    expect(audio.volume).toBe(0);
    expect(music.playing).toBe(true);

    advance(500);
    expect(audio.volume).toBeCloseTo(0.5, 1);
    advance(500);
    expect(audio.volume).toBe(1);
  });

  it('fades out before it pauses', async () => {
    const music = new FilmMusic([track('a')], url);
    await music.play(0);
    const [audio] = started;

    music.pause(400);
    expect(music.playing).toBe(false);
    advance(200);
    expect(audio.volume).toBeCloseTo(0.5, 1);
    expect(paused).not.toContain(audio);
    advance(200);
    expect(audio.volume).toBe(0);
    expect(paused).toContain(audio);
  });

  it('skips to the next song, the one before fading out under it, and comes back round', async () => {
    const music = new FilmMusic([track('a'), track('b')], url);
    await music.play(0);
    const [first] = started;

    music.next();
    await flush();
    const second = started[1];
    expect(music.track?.id).toBe('b');
    expect(second.src).toBe('https://curator.test/api/music/b');
    advance(450);
    expect(first.volume).toBeCloseTo(0.5, 1);
    expect(second.volume).toBeGreaterThan(0);
    advance(1000);
    expect(first.volume).toBe(0);
    expect(paused).toContain(first);
    expect(second.volume).toBe(1);

    music.next();
    expect(music.track?.id).toBe('a');
  });

  it('fades out over the last seconds of the film', async () => {
    const music = new FilmMusic([track('a')], url);
    await music.play(0);
    const [audio] = started;

    music.fadeOut(4000);
    advance(2000);
    expect(audio.volume).toBeCloseTo(0.5, 1);
    advance(2000);
    expect(audio.volume).toBe(0);
    expect(paused).toContain(audio);
  });

  it('says when the browser wants a press before it plays sound', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('no gesture', 'NotAllowedError'));
    const music = new FilmMusic([track('a')], url);

    await music.play();
    expect(music.blocked).toBe(true);
    expect(music.playing).toBe(false);
  });

  it('mutes the song playing and the ones after it', async () => {
    const music = new FilmMusic([track('a'), track('b')], url);
    await music.play(0);

    music.setMuted(true);
    expect(started[0].muted).toBe(true);
    music.next();
    await flush();
    expect(started[1].muted).toBe(true);
  });

  it('goes on silent when no song will load', async () => {
    const music = new FilmMusic([track('a'), track('b')], url);
    await music.play(0);

    started[0].dispatchEvent(new Event('error'));
    await flush();
    expect(music.track?.id).toBe('b');
    started[1].dispatchEvent(new Event('error'));
    expect(music.failed).toBe(true);
    expect(music.available).toBe(false);
  });

  it('has nothing to play without songs', async () => {
    const music = new FilmMusic([], url);

    await music.play();
    expect(started).toEqual([]);
    expect(music.available).toBe(false);
  });
});
