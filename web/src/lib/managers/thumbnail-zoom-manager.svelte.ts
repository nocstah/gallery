// Local Omarchy layer: Mac-Photos-style thumbnail zoom for the timeline, and the day-label toggle.
// One scale per form factor (desktop / narrow), multiplied onto the timeline's base row height and
// remembered per browser. Ctrl+wheel and trackpad pinch (which browsers deliver as Ctrl+wheel) zoom
// continuously; + / - step and 0 resets; TimelineWorkspaces renders a slider bound to `scale`.
import { browser } from '$app/environment';

const STORAGE_KEY = 'omarchy-thumbnail-zoom';
export const ZOOM_MIN = 0.45;
export const ZOOM_MAX = 3.1;
const STEPS = [0.45, 0.6, 0.75, 1, 1.25, 1.55, 1.9, 2.4, 3.1];

type Mode = 'desktop' | 'narrow';
type Stored = Record<Mode, number>;

const clamp = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

const load = (): Stored => {
  if (browser) {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
      if (parsed) {
        return { desktop: clamp(parsed.desktop ?? 1), narrow: clamp(parsed.narrow ?? 1) };
      }
    } catch {
      /* corrupted or unavailable: fall through to defaults */
    }
  }
  return { desktop: 1, narrow: 1 };
};

const DAY_LABELS_KEY = 'omarchy-day-labels';
const COMPACT_KEY = 'omarchy-compact';
const EXPAND_STACKS_KEY = 'omarchy-expand-stacks';
const COMPACT_SPACING = 2;
const loadDayLabels = () => {
  if (browser) {
    try {
      return localStorage.getItem(DAY_LABELS_KEY) === 'on';
    } catch {
      /* unavailable */
    }
  }
  // off by default: one continuous grid like Mac Photos; the month header carries the date
  return false;
};

class ThumbnailZoomManager {
  #scales = $state<Stored>(load());
  #dayLabels = $state(loadDayLabels());
  #expandStacks = $state(
    browser
      ? (() => {
          try {
            return localStorage.getItem(EXPAND_STACKS_KEY) === 'on';
          } catch {
            return false;
          }
        })()
      : false,
  );
  #compact = $state(
    browser
      ? (() => {
          try {
            return localStorage.getItem(COMPACT_KEY) === 'on';
          } catch {
            return false;
          }
        })()
      : false,
  );
  mode = $state<Mode>('desktop');

  get dayLabels() {
    return this.#dayLabels;
  }

  set dayLabels(value: boolean) {
    this.#dayLabels = value;
    if (browser) {
      try {
        localStorage.setItem(DAY_LABELS_KEY, value ? 'on' : 'off');
      } catch {
        /* storage unavailable */
      }
    }
  }

  get scale() {
    return this.#scales[this.mode];
  }

  set scale(value: number) {
    this.#scales[this.mode] = clamp(value);
    if (browser) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#scales));
      } catch {
        /* storage unavailable: the zoom still applies for this session */
      }
    }
  }

  /** Show every photo of a stack in the timeline instead of only its cover. */
  get expandStacks() {
    return this.#expandStacks;
  }

  set expandStacks(value: boolean) {
    this.#expandStacks = value;
    if (browser) {
      try {
        localStorage.setItem(EXPAND_STACKS_KEY, value ? 'on' : 'off');
      } catch {
        /* storage unavailable */
      }
    }
  }

  get compact() {
    return this.#compact;
  }

  set compact(value: boolean) {
    this.#compact = value;
    if (browser) {
      try {
        localStorage.setItem(COMPACT_KEY, value ? 'on' : 'off');
      } catch {
        /* storage unavailable */
      }
    }
  }

  /**
   * Photo spacing for a desktop gap. Like Mac Photos, the seams tighten as thumbnails shrink: the full
   * gap from the default size up, easing down to ~1px at the smallest size. Compact pins the tight seam.
   */
  spacingFor(gap: number) {
    const shrink = Math.min(1, Math.max(0, (this.scale - ZOOM_MIN) / (1 - ZOOM_MIN)));
    const auto = Math.max(1, Math.round(gap * (0.1 + 0.9 * shrink)));
    return this.#compact ? Math.min(auto, COMPACT_SPACING) : auto;
  }

  step(direction: 1 | -1) {
    const current = this.scale;
    const next =
      direction > 0 ? STEPS.find((value) => value > current + 0.01) : STEPS.findLast((value) => value < current - 0.01);
    this.scale = next ?? (direction > 0 ? ZOOM_MAX : ZOOM_MIN);
  }

  reset() {
    this.scale = 1;
  }
}

export const thumbnailZoomManager = new ThumbnailZoomManager();

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]') !== null;

/** Wires Ctrl+wheel / pinch on the timeline's scroll container and + / - / 0 on the window. */
export const attachThumbnailZoom = (element: HTMLElement) => {
  let pending = 0;
  let frame = 0;

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) {
      return;
    }
    // stop the browser's page zoom; this gesture belongs to the photos
    event.preventDefault();
    // a mouse wheel notch is ~100px, a pinch frame a few px: one exponential curve serves both
    pending += event.deltaY;
    if (!frame) {
      frame = requestAnimationFrame(() => {
        thumbnailZoomManager.scale = thumbnailZoomManager.scale * Math.exp(-pending * 0.0025);
        pending = 0;
        frame = 0;
      });
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) {
      return;
    }
    if (document.querySelector('#immich-asset-viewer')) {
      return;
    }
    if (event.key === '+' || event.key === '=') {
      thumbnailZoomManager.step(1);
    } else if (event.key === '-' || event.key === '_') {
      thumbnailZoomManager.step(-1);
    } else if (event.key === '0') {
      thumbnailZoomManager.reset();
    } else {
      return;
    }
    event.preventDefault();
  };

  element.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeydown);
  return () => {
    element.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeydown);
    if (frame) {
      cancelAnimationFrame(frame);
    }
  };
};
