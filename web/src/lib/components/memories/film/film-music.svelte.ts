import type { MemoryTrack } from '$lib/utils/curator';

// Local Omarchy layer: the film's music (DESIGN.md, Memories, The film): songs from the owner's own library that
// Curator picked for the memory, best first, played on plain <audio> elements from Curator's origin (no crossorigin,
// so the session cookie goes with them; Web Audio would hear only silence from another origin, so the fades move the
// element's volume, which iOS keeps at full: there the music starts and stops without them). A song fades in, the next
// one follows when it ends or when skipped to, and at the film's end the music fades out. Opening a memory from its
// card is a press, so the sound may start with the film; a link opened cold may not, and the film offers to start it
// (`blocked`). iOS asks for the press on each element, and the press is long gone by the time a slow link has brought
// the day and its first photo: a page that knows a film is coming unlocks elements in the press itself
// (unlockFilmSound), and elements that have played go back to be used again, for the next song and the next film.

const FULL = 1;
// 50 ms of silence, for an element to play in the press
const SILENCE =
  'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
const SPARES = 2;

// the elements the browser has let play, free for the next song
const spares: HTMLAudioElement[] = [];
const unlocked = new WeakSet<HTMLAudioElement>();

const keepSpare = (audio: HTMLAudioElement) => {
  if (unlocked.has(audio) && spares.length < SPARES && !spares.includes(audio)) {
    spares.push(audio);
  }
};

/** Call in the press that opens a film: its songs may then start when they are ready, wherever the press has gone. */
export const unlockFilmSound = () => {
  while (spares.length < SPARES) {
    const audio = new Audio(SILENCE);
    unlocked.add(audio);
    spares.push(audio);
    void audio.play().then(
      () => {
        if (audio.getAttribute('src') === SILENCE) {
          audio.pause();
        }
      },
      () => {
        // not allowed after all: the film still offers Turn on sound
        unlocked.delete(audio);
        spares.splice(spares.indexOf(audio), 1);
      },
    );
  }
};

type Fade = { cancel: () => void };

const NO_FADE: Fade = { cancel: () => undefined };

const clampVolume = (value: number) => Math.min(1, Math.max(0, value));

/** The element's volume moved to `to` over `ms` (at once in a hidden tab, where frames stop). */
const fadeVolume = (audio: HTMLAudioElement, to: number, ms: number, done?: () => void): Fade => {
  const from = audio.volume;
  if (ms <= 0 || typeof requestAnimationFrame !== 'function' || document.hidden) {
    audio.volume = clampVolume(to);
    done?.();
    return NO_FADE;
  }
  const began = performance.now();
  let frame = 0;
  let cancelled = false;
  const step = (now: number) => {
    if (cancelled) {
      return;
    }
    const share = Math.min(1, (now - began) / ms);
    audio.volume = clampVolume(from + (to - from) * share);
    if (share < 1) {
      frame = requestAnimationFrame(step);
    } else {
      done?.();
    }
  };
  frame = requestAnimationFrame(step);
  return {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    },
  };
};

export class FilmMusic {
  /** the song playing (an index into the tracks) */
  index = $state(0);
  /** the music is meant to be heard: playing or fading in, not paused or ended */
  playing = $state(false);
  /** the browser would not start sound without a press: the film offers a way to start it */
  blocked = $state(false);
  muted = $state(false);
  /** no song would load: the film goes on silent */
  failed = $state(false);
  /** asked to play, and the song has not come yet */
  loading = $state(false);
  /** how far into the song, for its words */
  time = $state(0);

  #tracks: MemoryTrack[];
  #url: (src: string) => string;
  #audio: HTMLAudioElement | undefined;
  // what each element in use listens with, taken off when it goes back
  #listening = new WeakMap<HTMLAudioElement, AbortController>();
  // at most the song playing and the one fading out under it
  #fades: { audio: HTMLAudioElement; fade: Fade }[] = [];
  // the songs that would not load
  #broken: number[] = [];
  #destroyed = false;

  constructor(tracks: MemoryTrack[], url: (src: string) => string) {
    this.#tracks = tracks.filter((track) => track.src);
    this.#url = url;
  }

  get tracks() {
    return this.#tracks;
  }

  get track(): MemoryTrack | undefined {
    return this.#tracks[this.index];
  }

  /** there is music to play */
  get available() {
    return this.#tracks.length > 0 && !this.failed;
  }

  #fade(audio: HTMLAudioElement, to: number, ms: number, done?: () => void) {
    for (const running of this.#fades) {
      if (running.audio === audio) {
        running.fade.cancel();
      }
    }
    this.#fades = this.#fades.filter((entry) => entry.audio !== audio);
    const entry = { audio, fade: NO_FADE };
    this.#fades.push(entry);
    entry.fade = fadeVolume(audio, to, ms, () => {
      this.#fades = this.#fades.filter((other) => other !== entry);
      done?.();
    });
  }

  #element(index: number) {
    const audio = spares.pop() ?? new Audio();
    const listening = new AbortController();
    this.#listening.set(audio, listening);
    const { signal } = listening;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.muted = this.muted;
    audio.src = this.#url(this.#tracks[index].src);
    audio.addEventListener(
      'timeupdate',
      () => {
        if (audio === this.#audio) {
          this.time = audio.currentTime;
        }
      },
      { signal },
    );
    audio.addEventListener(
      'ended',
      () => {
        if (audio === this.#audio && this.playing) {
          this.#switchTo(this.#nextPlayable(), 0);
        }
      },
      { signal },
    );
    audio.addEventListener(
      'error',
      () => {
        if (audio === this.#audio) {
          this.loading = false;
          if (!this.#broken.includes(this.index)) {
            this.#broken.push(this.index);
          }
          if (this.#broken.length >= this.#tracks.length) {
            this.failed = true;
            this.playing = false;
          } else if (this.playing) {
            this.#switchTo(this.#nextPlayable(), 0);
          }
        }
      },
      { signal },
    );
    return audio;
  }

  #nextPlayable() {
    for (let step = 1; step <= this.#tracks.length; step++) {
      const index = (this.index + step) % this.#tracks.length;
      if (!this.#broken.includes(index)) {
        return index;
      }
    }
    return this.index;
  }

  /** Empty, and free for the next song if the browser has let it play. */
  #release(audio: HTMLAudioElement) {
    this.#listening.get(audio)?.abort();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    keepSpare(audio);
  }

  #retire(audio: HTMLAudioElement | undefined, ms: number) {
    if (!audio) {
      return;
    }
    this.#fade(audio, 0, ms, () => this.#release(audio));
  }

  #switchTo(index: number, fadeOutMs: number) {
    this.#retire(this.#audio, fadeOutMs);
    this.index = index;
    this.#audio = this.#element(index);
    if (this.playing) {
      this.playing = false;
      void this.play();
    }
  }

  /** Start bringing the song before it is asked for. */
  prepare() {
    if (this.available && !this.#destroyed && !this.#audio) {
      this.#audio = this.#element(this.index);
      this.#audio.load();
    }
  }

  /** The song playing now (or the first) from where it is, fading in. */
  async play(fadeMs = 1500) {
    if (!this.available || this.#destroyed) {
      return;
    }
    this.#audio ??= this.#element(this.index);
    const audio = this.#audio;
    this.playing = true;
    this.loading = true;
    try {
      await audio.play();
    } catch (error) {
      if (audio !== this.#audio) {
        return;
      }
      this.loading = false;
      if ((error as Error)?.name === 'NotAllowedError') {
        this.blocked = true;
        this.playing = false;
      }
      // an AbortError is a pause that came first; a song that cannot play says so with its error event
      return;
    }
    if (audio !== this.#audio || this.#destroyed) {
      return;
    }
    unlocked.add(audio);
    this.loading = false;
    if (!this.playing) {
      // paused while it was starting
      audio.pause();
      return;
    }
    this.blocked = false;
    this.#fade(audio, FULL, fadeMs);
  }

  /** Quietly stop (the film paused, or ended). */
  pause(fadeMs = 400) {
    this.playing = false;
    const audio = this.#audio;
    if (audio) {
      this.#fade(audio, 0, fadeMs, () => {
        if (!this.playing) {
          audio.pause();
        }
      });
    }
  }

  /** The film's last seconds: the music fades out over them and stops. */
  fadeOut(ms: number) {
    this.pause(Math.max(0, ms));
  }

  /** The next of the songs, the one playing fading out under it. */
  next() {
    if (!this.available || this.#tracks.length < 2) {
      return;
    }
    const wasPlaying = this.playing;
    this.#retire(this.#audio, 900);
    this.index = this.#nextPlayable();
    this.#audio = this.#element(this.index);
    if (wasPlaying) {
      this.playing = false;
      void this.play(1200);
    }
  }

  /** From the start of the first song again (the film starts over). */
  restart() {
    this.#retire(this.#audio, 300);
    this.#audio = undefined;
    this.index = this.#broken.includes(0) ? this.#nextPlayable() : 0;
    this.playing = false;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.#audio) {
      this.#audio.muted = muted;
    }
  }

  destroy() {
    this.#destroyed = true;
    this.playing = false;
    this.loading = false;
    for (const { fade } of this.#fades) {
      fade.cancel();
    }
    this.#fades = [];
    if (this.#audio) {
      this.#release(this.#audio);
      this.#audio = undefined;
    }
  }
}
