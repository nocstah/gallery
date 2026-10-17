// Local Omarchy layer: Room keeps the screen awake while it plays (DESIGN.md, Room). The Screen Wake Lock API where
// the browser has it, on a secure page (localhost, https); the browser lets go of the lock whenever the page is hidden,
// and it is taken again when the page is back. Where there is no such API (a TV's browser over plain http, an older
// WebKit) or the lock is refused, a quiet fallback: a tiny black video, silent and out of sight, loops while Room
// plays, which keeps many such browsers from dimming the screen. Released, both stop.

type Lock = { released: boolean; release: () => Promise<void> };
type LockApi = { request: (type: 'screen') => Promise<Lock> };

const lockApi = (): LockApi | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { wakeLock?: LockApi }).wakeLock;

export class ScreenAwake {
  #wanted = false;
  #lock: Lock | undefined;
  #asking = false;
  #listening = false;
  #video: HTMLVideoElement | undefined;

  /** how the screen is being kept awake now */
  get mode(): 'lock' | 'video' | 'none' {
    if (this.#lock && !this.#lock.released) {
      return 'lock';
    }
    return this.#video && !this.#video.paused ? 'video' : 'none';
  }

  /** Keep the screen awake until released (again after the page was hidden). */
  hold() {
    this.#wanted = true;
    if (!this.#listening) {
      this.#listening = true;
      document.addEventListener('visibilitychange', this.#onVisibility);
    }
    void this.#take();
  }

  /** Let the screen sleep again. */
  release() {
    this.#wanted = false;
    const lock = this.#lock;
    this.#lock = undefined;
    if (lock && !lock.released) {
      void lock.release().catch(() => undefined);
    }
    this.#video?.pause();
  }

  destroy() {
    this.release();
    if (this.#listening) {
      this.#listening = false;
      document.removeEventListener('visibilitychange', this.#onVisibility);
    }
    this.#video?.remove();
    this.#video = undefined;
  }

  #onVisibility = () => {
    if (!document.hidden) {
      void this.#take();
    }
  };

  async #take() {
    if (!this.#wanted || document.hidden || this.#asking || (this.#lock && !this.#lock.released)) {
      return;
    }
    const api = lockApi();
    if (api && typeof api.request === 'function') {
      this.#asking = true;
      try {
        const lock = await api.request('screen');
        if (this.#wanted) {
          this.#lock = lock;
          this.#video?.pause();
        } else {
          void lock.release().catch(() => undefined);
        }
        return;
      } catch {
        // refused (a policy, a battery saver): the video instead
      } finally {
        this.#asking = false;
      }
    }
    if (this.#wanted) {
      this.#play();
    }
  }

  #play() {
    if (!this.#video) {
      const video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.tabIndex = -1;
      video.dataset.testid = 'room-awake';
      Object.assign(video.style, {
        position: 'fixed',
        left: '0',
        bottom: '0',
        width: '1px',
        height: '1px',
        opacity: '0.01',
        pointerEvents: 'none',
      });
      for (const [type, src] of [
        ['video/webm', VIDEO_WEBM],
        ['video/mp4', VIDEO_MP4],
      ]) {
        const source = document.createElement('source');
        source.type = type;
        source.src = src;
        video.append(source);
      }
      document.body.append(video);
      this.#video = video;
    }
    void this.#video.play()?.catch(() => undefined);
  }
}

// two seconds of black, 32px square, without sound (ffmpeg's lavfi colour source; H.264 baseline and VP8)
const VIDEO_MP4 =
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAl50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABgW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUFzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMSBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAe/+EAFmdCwB7ZCWwEQAAAAwBAAAADAQPFi5IBAAZoy4BlEyAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAKpAAAAAAAAAAYc3R0cwAAAAAAAAABAAAABAAAIAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAABAAAAAEAAAAkc3RzegAAAAAAAAAAAAAABAAAAogAAAALAAAACwAAAAsAAAAUc3RjbwAAAAAAAAABAAADYwAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjMuMS4xMDEAAAAIZnJlZQAAArFtZGF0AAACcgYF//9u3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOi0zOi0zIGFuYWx5c2U9MHgxOjB4MTExIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0yLjAwOjAuNzAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS00IHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0yIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj01MS4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4yMACAAAAADmWIhAXznJigACF/J114AAAAB0GaOAvnOWAAAAAHQZpUAvnOWAAAAAdBmmAVznLA';
const VIDEO_WEBM =
  'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAI6EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEyTbuMU6uEHFO7a1OsggIk7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAn0AAAAAAABZUrmvXrgEAAAAAAABO14EBc8WIX17Ar1VGPJ2cgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QdzWUA4JCwgSC6gSCagQJVsIRVuYEBVe6BAOwBAAAAAAAAAgAAElTDZ/pzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAxc3PVY8CLY8WIX17Ar1VGPJ1nyKBFo4dFTkNPREVSRIeTTGF2YzYzLjEuMTAxIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDIuMDAwMDAwMDAwAB9DtnXu54EAo6SBAACAMAIAnQEqIAAgAABHCIWFiIWEiAICAAeQ88nA/v+rUICjlYEB9ACxAQAPEfwAGAAYWC/0AAhwAKOVgQPoALEBAA8R/AAYABhYL/QACHAAo5WBBdwAsQEADxH8ABgAGFgv9AAIcAAcU7trkbuPs4EAt4r3gQHxggGx8IED';
