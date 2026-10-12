// Local Omarchy layer: which theme Gallery wears in this browser. "Follow Omarchy" (the default) leaves the colours to
// the admin Custom CSS that ~/.local/bin/immich-omarchy-theme writes from the desktop's theme, so Gallery changes with
// the desktop; a chosen theme lies over it (lib/theme/derive.ts) and stays whatever the desktop does.
//
// The built-in themes are files in /themes (static/themes, made from the Omarchy themes by
// tools/export-omarchy-themes.py); installed ones, from a file or a URL, are kept in this browser with the choice.
// The chosen theme's CSS is kept too, so app.html can put it in place before the first paint.
import { ThemePreference, themeManager as colourMode } from '@immich/ui';
import { parseTheme, themeCss, type GalleryTheme } from '$lib/theme/derive';

export const FOLLOW_OMARCHY = 'omarchy';
const CHOICE = 'gallery.theme';
const CSS = 'gallery.theme.css';
const INSTALLED = 'gallery.themes.installed';
const STYLE_ID = 'ws-user-theme';

export type ThemeEntry = { theme: GalleryTheme; builtIn: boolean };

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // private window or storage blocked: the choice lasts for this page only
  }
};

class ThemeManager {
  /** the chosen theme's id, or FOLLOW_OMARCHY */
  current = $state<string>(FOLLOW_OMARCHY);
  builtIn = $state<GalleryTheme[]>([]);
  installed = $state<GalleryTheme[]>([]);
  #loaded = false;

  constructor() {
    this.current = read(CHOICE) ?? FOLLOW_OMARCHY;
    try {
      const saved = JSON.parse(read(INSTALLED) ?? '[]') as unknown[];
      this.installed = saved.flatMap((item) => {
        try {
          return [parseTheme(item)];
        } catch {
          return [];
        }
      });
    } catch {
      this.installed = [];
    }
  }

  get all(): ThemeEntry[] {
    return [
      ...this.installed.map((theme) => ({ theme, builtIn: false })),
      ...this.builtIn.map((theme) => ({ theme, builtIn: true })),
    ];
  }

  find(id: string) {
    return this.all.find((entry) => entry.theme.id === id)?.theme;
  }

  /** The built-in list, once. */
  async load() {
    if (this.#loaded) {
      return;
    }
    this.#loaded = true;
    try {
      const response = await fetch('/themes/index.json', { cache: 'no-cache' });
      const list = (await response.json()) as unknown[];
      this.builtIn = list.flatMap((item) => {
        try {
          return [parseTheme(item)];
        } catch {
          return [];
        }
      });
    } catch {
      this.builtIn = [];
    }
  }

  /** Wear a theme (or follow Omarchy again), now and on every later visit in this browser. */
  choose(id: string) {
    const theme = id === FOLLOW_OMARCHY ? undefined : this.find(id);
    this.current = theme ? id : FOLLOW_OMARCHY;
    write(CHOICE, theme ? id : null);
    const css = theme ? themeCss(theme) : null;
    write(CSS, css);
    apply(css);
    // light or dark comes with the choice: following Omarchy, from the desktop (the page's prefers-color-scheme, which
    // Omarchy flips with its theme); a chosen theme, from the theme. Without this a light/dark picked once (Shift+T,
    // the View menu) outlived every later choice, and Omarchy's dark palette was drawn in its light face.
    colourMode.setPreference(
      theme ? (theme.mode === 'light' ? ThemePreference.Light : ThemePreference.Dark) : ThemePreference.System,
    );
  }

  /** Add a theme from a file's text or a fetched URL; returns it. An installed theme with the same id is replaced. */
  install(data: unknown) {
    const theme = parseTheme(data);
    this.installed = [theme, ...this.installed.filter((t) => t.id !== theme.id)];
    write(INSTALLED, JSON.stringify(this.installed));
    if (this.current === theme.id) {
      this.choose(theme.id);
    }
    return theme;
  }

  uninstall(id: string) {
    this.installed = this.installed.filter((t) => t.id !== id);
    write(INSTALLED, JSON.stringify(this.installed));
    if (this.current === id) {
      this.choose(FOLLOW_OMARCHY);
    }
  }

  /** A theme's file, to share or keep. */
  file(theme: GalleryTheme) {
    return new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
  }
}

/** Put the theme's CSS in place (last in <head>, after the admin Custom CSS), or take it away. */
export const apply = (css: string | null) => {
  let style = document.querySelector<HTMLStyleElement>(`style#${STYLE_ID}`);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
  }
  style.textContent = css;
  document.head.append(style); // (re)appended: it must come after anything the page adds later
};

export const galleryThemes = new ThemeManager();
