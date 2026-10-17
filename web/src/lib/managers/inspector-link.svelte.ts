import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';

// Local Omarchy layer: the inspector, a second window (on the owner's portrait Dell, beside the AORUS that holds the
// grid) that shows the photo the main window points at, large, with its details (routes/inspector). The two windows
// talk over a BroadcastChannel (same browser profile, same origin), so following the pointer costs no server round
// trip: the main window says which photo (under the pointer or the keyboard focus, the last one selected, the one open
// in the viewer) and the inspector asks Gallery for that photo's details alone. A main window says nothing until an
// inspector has said hello, and stops once none has been heard from for a few seconds, so with no inspector open a
// photo under the pointer costs one assignment.

export const INSPECTOR_CHANNEL = 'gallery-inspector';
/** The inspector's window name for window.open: opening it again finds the same window. */
export const INSPECTOR_WINDOW = 'gallery-inspector';
/** Where the inspector's document title starts. The owner's Hyprland rule sends a window whose title starts with this
 * to the Dell, so it is a name, never translated. */
export const INSPECTOR_TITLE = 'Gallery inspector';
/** The popup's size where nothing places it (the Hyprland rule maximizes it on the Dell): portrait, like the Dell. */
export const INSPECTOR_FEATURES = 'popup,width=820,height=1180';

export const INSPECTOR_TIMING = {
  /** the pointer rests this long on a photo before the inspector hears of it, so a sweep over the grid says nothing */
  settleMs: 150,
  /** how often an inspector says it is still there */
  heartbeatMs: 2000,
  /** an inspector not heard from for this long is gone (a hidden window's timers run once a minute at most) */
  aliveMs: 6000,
  /** how long an inspector waits for the main window to say it went somewhere, before it opens a tab instead */
  ackMs: 600,
};
export type InspectorTiming = typeof INSPECTOR_TIMING;

/** What the inspector needs to start on a photo before its details arrive. */
export type InspectorSubject = {
  id: string;
  /** the photo's thumbhash, which is also the cache key of its preview */
  thumbhash: string | null;
  /** width / height, when known */
  ratio: number | null;
  video: boolean;
};

/** What a main window points at: the photo open in its viewer, else the last of its selection, else the last photo
 * pointed at, which stays while the pointer is on nothing. */
export type InspectorPick =
  | { kind: 'none' }
  | { kind: 'pointer' | 'viewer'; subject: InspectorSubject }
  | { kind: 'selection'; subject: InspectorSubject; count: number };
export type InspectorShownPick = Exclude<InspectorPick, { kind: 'none' }>;

export type InspectorMessage =
  /** an inspector is there (when it opens, then every heartbeat); a main window answers a new one with its state */
  | { type: 'hello'; inspector: string }
  | { type: 'bye'; inspector: string }
  /** an inspector asks one main window (`to`) to go to a page of its own */
  | { type: 'navigate'; inspector: string; to: string; url: string; nonce: string }
  /** a main window's pick; `at` is when it last changed, so the most recently used window wins */
  | { type: 'state'; source: string; at: number; pick: InspectorPick }
  | { type: 'navigated'; source: string; to: string; nonce: string }
  /** a main window closes the inspectors (Shift+I again, the View menu's switch) */
  | { type: 'close' };

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36)}`;

export const subjectOfTimelineAsset = (asset: TimelineAsset): InspectorSubject => ({
  id: asset.id,
  thumbhash: asset.thumbhash,
  ratio: asset.ratio || null,
  video: asset.isVideo,
});

export const subjectOfAsset = (asset: AssetResponseDto): InspectorSubject => ({
  id: asset.id,
  thumbhash: asset.thumbhash,
  ratio: asset.width && asset.height ? asset.width / asset.height : null,
  video: asset.type === AssetTypeEnum.Video,
});

const pickKey = (pick: InspectorPick) =>
  pick.kind === 'none' ? 'none' : `${pick.kind}:${pick.subject.id}:${pick.kind === 'selection' ? pick.count : ''}`;

/** A path inside Gallery (never another origin, never a script URL). */
export const isGalleryPath = (url: string) => url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');

type Pointed = TimelineAsset | InspectorSubject;
const asSubject = (pointed: Pointed): InspectorSubject =>
  'isVideo' in pointed ? subjectOfTimelineAsset(pointed) : pointed;

export type InspectorFeedOptions = {
  /** the photo open in the viewer, if any */
  viewer?: () => InspectorSubject | undefined;
  /** while a selection exists, its last photo and how many there are */
  selection?: () => { subject: InspectorSubject; count: number } | undefined;
  /** go to a page of this window (an album the inspector names) */
  navigate?: (url: string) => void;
  channel?: () => BroadcastChannel;
  timing?: Partial<InspectorTiming>;
};

/**
 * The main window's side: it tells the inspectors what it points at. The photo under the pointer is said once the
 * pointer has rested on it (`settleMs`), a change of the viewer or the selection after the same rest, and an inspector
 * that says hello for the first time hears the pick at once.
 */
export class InspectorFeed {
  /** an inspector has been heard from lately: only then does this window say anything */
  listening = $state(false);
  /** this window, as the inspectors know it */
  readonly source = newId();

  #options: InspectorFeedOptions = {};
  #timing: InspectorTiming = INSPECTOR_TIMING;
  #channel?: BroadcastChannel;
  // the inspectors heard from and when: bookkeeping, nothing on screen follows it (listening does)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #inspectors = new Map<string, number>();
  /** the photo pointed at last: kept while the pointer is on nothing, and while nobody listens (for a new inspector) */
  #pointed?: Pointed;
  /** the photo under the pointer that has not rested there long enough yet */
  #candidate?: Pointed;
  #timer?: ReturnType<typeof setTimeout>;
  #said = '';
  #changedAt = 0;
  #opened: Window | null = null;

  start(options: InspectorFeedOptions = {}) {
    this.stop();
    this.#options = options;
    this.#timing = { ...INSPECTOR_TIMING, ...options.timing };
    this.#channel = options.channel?.() ?? new BroadcastChannel(INSPECTOR_CHANNEL);
    this.#channel.addEventListener('message', this.#onMessage);
  }

  stop() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#candidate = undefined;
    this.#channel?.removeEventListener('message', this.#onMessage);
    this.#channel?.close();
    this.#channel = undefined;
    this.#inspectors.clear();
    this.#said = '';
    this.listening = false;
  }

  /** A photo came under the pointer or took the keyboard focus. */
  point(asset: TimelineAsset) {
    this.#changedAt = Date.now();
    if (!this.listening) {
      // nobody to tell: just remember it, so an inspector opened now starts on it
      this.#pointed = asset;
      return;
    }
    this.#candidate = asset;
    this.#schedule();
  }

  /** The pointer or the focus left a photo: one it only passed over is never said. */
  unpoint(id: string) {
    if (this.#candidate?.id === id) {
      this.#candidate = undefined;
    }
  }

  /** The viewer or the selection changed. */
  changed() {
    this.#changedAt = Date.now();
    if (this.listening) {
      this.#schedule();
    }
  }

  /** Whether an inspector is open: heard from lately, or opened by this window and not closed since. */
  isInspectorOpen() {
    return this.#prune() || (!!this.#opened && !this.#opened.closed);
  }

  /** Forget inspectors not heard from lately (the View menu asks before it shows the switch). */
  refresh() {
    this.#prune();
  }

  open() {
    const url = `/inspector?from=${encodeURIComponent(this.source)}`;
    // window.open
    this.#opened = open(url, INSPECTOR_WINDOW, INSPECTOR_FEATURES);
  }

  close() {
    this.#post({ type: 'close' });
    this.#opened?.close();
    this.#opened = null;
    this.#inspectors.clear();
    this.listening = false;
  }

  /** Shift+I and the View menu: a closed inspector opens, an open one closes (it lives on another screen, so taking
   * the focus away from the grid would only get in the way of the keys). */
  toggle() {
    if (this.isInspectorOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  #schedule() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (this.#candidate) {
        this.#pointed = this.#candidate;
        this.#candidate = undefined;
      }
      this.#say();
    }, this.#timing.settleMs);
  }

  #pick(): InspectorPick {
    const viewer = this.#options.viewer?.();
    if (viewer) {
      // the photo the viewer shows last stays the one pointed at once it closes, rather than the tile it opened from
      this.#pointed = viewer;
      return { kind: 'viewer', subject: viewer };
    }
    const selection = this.#options.selection?.();
    if (selection) {
      return { kind: 'selection', subject: selection.subject, count: selection.count };
    }
    return this.#pointed ? { kind: 'pointer', subject: asSubject(this.#pointed) } : { kind: 'none' };
  }

  /** Say the pick if it changed (`again`: to a new inspector, even if not). */
  #say(again = false) {
    if (!this.#prune()) {
      return;
    }
    const pick = this.#pick();
    const key = pickKey(pick);
    if (key === this.#said && !again) {
      return;
    }
    this.#said = key;
    this.#post({ type: 'state', source: this.source, at: this.#changedAt || Date.now(), pick });
  }

  /** Whether any inspector is still there; one not heard from within `aliveMs` is gone. */
  #prune() {
    const now = Date.now();
    for (const [id, seen] of this.#inspectors) {
      if (now - seen > this.#timing.aliveMs) {
        this.#inspectors.delete(id);
      }
    }
    const listening = this.#inspectors.size > 0;
    if (this.listening !== listening) {
      this.listening = listening;
    }
    if (!listening) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
      this.#said = '';
    }
    return listening;
  }

  #post(message: InspectorMessage) {
    this.#channel?.postMessage(message);
  }

  #onMessage = (event: MessageEvent<InspectorMessage>) => {
    const message = event.data;
    switch (message?.type) {
      case 'hello': {
        const seen = this.#inspectors.get(message.inspector);
        const known = seen !== undefined && Date.now() - seen <= this.#timing.aliveMs;
        this.#inspectors.set(message.inspector, Date.now());
        if (!this.listening) {
          this.listening = true;
        }
        if (!known) {
          this.#say(true);
        }
        break;
      }
      case 'bye': {
        this.#inspectors.delete(message.inspector);
        this.#prune();
        break;
      }
      case 'navigate': {
        if (message.to !== this.source || !isGalleryPath(message.url)) {
          return;
        }
        this.#options.navigate?.(message.url);
        this.#post({ type: 'navigated', source: this.source, to: message.inspector, nonce: message.nonce });
        break;
      }
      default: {
        // what the main windows say (their state, an answer, close) is for the inspectors
        break;
      }
    }
  };
}

/** The main window's feed (one per window), started by the user pages' layout (components/inspector/InspectorFeed). */
export const inspectorFeed = new InspectorFeed();

export type InspectorFollowerOptions = {
  channel?: () => BroadcastChannel;
  timing?: Partial<InspectorTiming>;
  /** a main window closed the inspector */
  onClose?: () => void;
};

/**
 * The inspector's side: it says hello (and keeps saying it, as a heartbeat), keeps the most recent pick any main window
 * said, and asks the main window to go to a page.
 */
export class InspectorFollower {
  /** what a main window points at, the most recently changed one winning; never 'none', so a window pointing at
   * nothing leaves the last photo where it is */
  latest = $state.raw<{ source: string; at: number; pick: InspectorShownPick }>();
  readonly id = newId();

  #channel?: BroadcastChannel;
  #timing: InspectorTiming = INSPECTOR_TIMING;
  #heartbeat?: ReturnType<typeof setInterval>;
  #onClose?: () => void;
  // the navigations waiting for their answer: bookkeeping, nothing on screen follows it
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #waiting = new Map<string, () => void>();

  start(options: InspectorFollowerOptions = {}) {
    this.stop();
    this.#timing = { ...INSPECTOR_TIMING, ...options.timing };
    this.#onClose = options.onClose;
    this.#channel = options.channel?.() ?? new BroadcastChannel(INSPECTOR_CHANNEL);
    this.#channel.addEventListener('message', this.#onMessage);
    this.#hello();
    this.#heartbeat = setInterval(() => this.#hello(), this.#timing.heartbeatMs);
    globalThis.document?.addEventListener('visibilitychange', this.#onVisibility);
  }

  stop() {
    if (!this.#channel) {
      return;
    }
    this.#post({ type: 'bye', inspector: this.id });
    clearInterval(this.#heartbeat);
    this.#heartbeat = undefined;
    globalThis.document?.removeEventListener('visibilitychange', this.#onVisibility);
    this.#channel.removeEventListener('message', this.#onMessage);
    this.#channel.close();
    this.#channel = undefined;
    for (const done of this.#waiting.values()) {
      done();
    }
    this.#waiting.clear();
  }

  /** Ask the main window that said the pick to go to `url`; false when no main window answered in time. */
  navigate(url: string): Promise<boolean> {
    const to = this.latest?.source;
    if (!to || !this.#channel || !isGalleryPath(url)) {
      return Promise.resolve(false);
    }
    const nonce = newId();
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(nonce);
        resolve(false);
      }, this.#timing.ackMs);
      this.#waiting.set(nonce, () => {
        clearTimeout(timer);
        this.#waiting.delete(nonce);
        resolve(true);
      });
      this.#post({ type: 'navigate', inspector: this.id, to, url, nonce });
    });
  }

  #hello() {
    this.#post({ type: 'hello', inspector: this.id });
  }

  #post(message: InspectorMessage) {
    this.#channel?.postMessage(message);
  }

  // a window hidden for long has its timers slowed to once a minute, and the main windows stop telling it things; it
  // says hello the moment it shows again, and a main window answers a returning inspector as a new one
  #onVisibility = () => {
    if (document.visibilityState === 'visible') {
      this.#hello();
    }
  };

  #onMessage = (event: MessageEvent<InspectorMessage>) => {
    const message = event.data;
    switch (message?.type) {
      case 'state': {
        // one window's messages arrive in the order it sent them; `at` only decides between two windows
        const { source, at, pick } = message;
        if (pick.kind !== 'none' && (!this.latest || source === this.latest.source || at >= this.latest.at)) {
          this.latest = { source, at, pick };
        }
        break;
      }
      case 'navigated': {
        if (message.to === this.id) {
          this.#waiting.get(message.nonce)?.();
        }
        break;
      }
      case 'close': {
        this.#onClose?.();
        break;
      }
      default: {
        // what the inspectors say (hello, bye, navigate) is for the main windows
        break;
      }
    }
  };
}
