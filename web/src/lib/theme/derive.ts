// Local Omarchy layer: a Gallery theme from a small palette. The same derivation ~/.local/bin/immich-omarchy-theme
// runs on the desktop's Omarchy theme (kept in step with it): a theme names its background, foreground and accent
// (and whether it is a light or a dark theme), and every surface, grey step and accent shade of both the light and
// the dark face is mixed from those in OKLab, with text and accents pushed until they read (WCAG contrast).
//
// The CSS it writes is scoped to `:root:root`, which outranks the desktop theme's `:root` in the admin Custom CSS:
// a chosen theme lies over the desktop one, and choosing "Follow desktop" simply removes it.

export type ThemeMode = 'light' | 'dark';

export type GalleryTheme = {
  format: 'gallery-theme';
  version: 1;
  id: string;
  name: string;
  author?: string;
  mode: ThemeMode;
  palette: {
    background: string;
    foreground: string;
    accent: string;
    /** a light theme's brightest surface, when it has one apart from its background */
    lighterBackground?: string;
  };
  /** Hyprland-style geometry in px; left out, the page keeps the desktop's (or the defaults) */
  geometry?: { gap?: number; radius?: number; border?: number };
  /** font family names; left out, the defaults */
  fonts?: { sans?: string; display?: string; mono?: string };
  /** a small preview image (a slice of the theme's wallpaper), as a URL or a data: URL */
  preview?: string;
};

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const h = hex.trim().replace(/^#/, '').slice(0, 6);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
};

const rgbToHex = (c: Rgb) =>
  '#' +
  c
    .map((x) =>
      Math.round(Math.max(0, Math.min(1, x)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const gam = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

const toLab = (c: Rgb): Rgb => {
  const [r, g, b] = c.map((value) => lin(value));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const fromLab = ([L, a, b]: Rgb): Rgb => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => gam(Math.max(0, x))) as Rgb;
};

/** t = 0 gives a, t = 1 gives b, mixed in OKLab */
export const mix = (a: string, b: string, t: number) => {
  const x = toLab(hexToRgb(a));
  const y = toLab(hexToRgb(b));
  return rgbToHex(fromLab([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb));
};

const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((value) => lin(value));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** c moved in lightness away from `against` until it reaches `target` contrast */
const pushContrast = (c: string, against: string, target: number) => {
  const lab = toLab(hexToRgb(c));
  const step = luminance(against) > 0.18 ? -0.01 : 0.01;
  while (contrast(rgbToHex(fromLab(lab)), against) < target && lab[0] > 0 && lab[0] < 1) {
    lab[0] += step;
  }
  return rgbToHex(fromLab(lab));
};

const triple = (hex: string) =>
  hexToRgb(hex)
    .map((x) => Math.round(x * 255))
    .join(' ');
const rgba = (hex: string, alpha: number) => `rgb(${triple(hex)} / ${alpha})`;

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
// each step's place on the light (0) to dark (1) ramp
const POSITIONS = [0, 0.035, 0.08, 0.14, 0.45, 0.56, 0.66, 0.76, 0.85, 0.925, 1];

type Face = {
  surface: string;
  text: string;
  chrome: string;
  gray: string;
  border: string;
  muted: string;
  accent: string;
  onAccent: string;
  scale: string[];
};
type Ramp = Record<number, string>;

const build = (theme: GalleryTheme) => {
  const { background: bg, foreground: fg, accent } = theme.palette;
  const lightTheme = theme.mode === 'light';
  const [hi, lo] = lightTheme ? [theme.palette.lighterBackground ?? bg, fg] : [fg, bg];
  const ramp: Ramp = Object.fromEntries(STEPS.map((s, i) => [s, mix(hi, lo, POSITIONS[i])]));

  const face = (mode: ThemeMode): Face => {
    const surface = mode === 'light' ? (lightTheme ? bg : ramp[50]) : lightTheme ? ramp[950] : bg;
    const text = mode === 'light' ? (lightTheme ? fg : ramp[950]) : lightTheme ? ramp[50] : fg;
    const acc = pushContrast(accent, surface, 5.2); // headroom for accent text on tinted chips
    const scale =
      mode === 'light'
        ? [
            ...[0.92, 0.8, 0.62, 0.42, 0.2].map((t) => mix(acc, '#ffffff', t)),
            acc,
            ...[0.18, 0.34, 0.5, 0.65, 0.8].map((t) => mix(acc, '#000000', t)),
          ]
        : [
            ...[0.86, 0.72, 0.56, 0.38, 0.18].map((t) => mix(acc, surface, t)),
            acc,
            ...[0.2, 0.4, 0.6, 0.76, 0.9].map((t) => mix(acc, '#ffffff', t)),
          ];
    return {
      surface,
      text,
      chrome: mix(surface, text, 0.045),
      gray: mix(surface, text, 0.1),
      border: mix(surface, text, 0.14),
      muted: pushContrast(mix(surface, text, 0.55), surface, 4.6),
      accent: acc,
      onAccent: contrast(surface, acc) >= 4.5 ? surface : text,
      scale,
    };
  };
  const light = face('light');
  const dark = face('dark');

  // light-face grey steps are used as body text on the surface: keep them readable, the ramp still monotonic
  const lightRamp = { ...ramp };
  lightRamp[400] = pushContrast(ramp[400], light.surface, 4.6);
  lightRamp[500] = mix(lightRamp[400], ramp[800], 0.25);
  lightRamp[600] = mix(lightRamp[400], ramp[800], 0.5);
  const darkRamp = { ...ramp };
  darkRamp[400] = pushContrast(ramp[400], ramp[900], 4.6);
  darkRamp[300] = mix(darkRamp[400], ramp[50], 0.4);
  return { light, dark, lightRamp, darkRamp };
};

const faceVars = (f: Face, ramp: Ramp, flip = false) => {
  const steps = flip ? [...STEPS].reverse() : STEPS;
  return [
    `--immich-ui-light:${f.surface}`,
    `--immich-ui-dark:${f.text}`,
    `--immich-ui-gray:${f.gray}`,
    `--immich-ui-muted:${f.muted}`,
    `--immich-ui-default-border:${f.border}`,
    `--gallery-chrome:${f.chrome}`,
    `--omarchy-on-accent:${f.onAccent}`,
    `--omarchy-accent:${f.accent}`,
    ...STEPS.map((s, i) => `--immich-ui-primary-${s}:${f.scale[i]}`),
    ...STEPS.map((s, i) => `--color-gray-${s}:${ramp[steps[i]]}`),
  ];
};

const legacyVars = (light: Face, dark: Face) => [
  `--immich-primary:${triple(light.accent)}`,
  `--immich-dark-primary:${triple(dark.accent)}`,
  `--immich-bg:${triple(light.surface)}`,
  `--immich-fg:${triple(light.text)}`,
  `--immich-dark-bg:${triple(dark.surface)}`,
  `--immich-dark-fg:${triple(dark.text)}`,
  `--immich-dark-gray:${triple(dark.gray)}`,
  '--font-heading:var(--font-display)',
];

const FONT = /^[\w .-]{1,60}$/;

/** The theme's stylesheet, scoped to outrank the desktop theme. */
export const themeCss = (theme: GalleryTheme) => {
  const { light, dark, lightRamp, darkRamp } = build(theme);
  const join = (vars: string[]) => vars.join(';\n  ');
  const panelDark = [
    ...faceVars(dark, darkRamp, true),
    `--immich-primary:${triple(dark.accent)}`,
    `--immich-fg:${triple(dark.text)}`,
    `--immich-bg:${triple(dark.surface)}`,
    `--color-white:${dark.surface}`,
    `--color-black:${dark.text}`,
  ];
  const geometry: string[] = [];
  const g = theme.geometry ?? {};
  if (g.gap !== undefined) {
    geometry.push(`--ws-gap:${g.gap}px`);
  }
  if (g.radius !== undefined) {
    geometry.push(`--ws-radius:${g.radius}px`);
  }
  if (g.border !== undefined) {
    geometry.push(`--ws-border:${Math.max(1, g.border)}px`);
  }
  const fonts = theme.fonts ?? {};
  if (fonts.sans && FONT.test(fonts.sans)) {
    geometry.push(`--font-sans:'${fonts.sans}', ui-sans-serif, system-ui, sans-serif`);
  }
  if (fonts.display && FONT.test(fonts.display)) {
    geometry.push(`--font-display:'${fonts.display}', ui-sans-serif, sans-serif`);
  }
  if (fonts.mono && FONT.test(fonts.mono)) {
    geometry.push(`--omarchy-font-mono:'${fonts.mono}'`);
  }
  return `/* Gallery theme: ${theme.name.replaceAll('*/', '')} */
:root:root, :root:root.light {
  ${join([...faceVars(light, lightRamp), ...legacyVars(light, dark)])};
}
:root:root.dark {
  ${join([...faceVars(dark, darkRamp), ...legacyVars(light, dark)])};
}
${geometry.length > 0 ? `:root:root {\n  ${join(geometry)};\n}\n` : ''}
:root:root ::selection { background: ${rgba(light.accent, 0.24)}; }
:root:root.dark ::selection { background: ${rgba(dark.accent, 0.32)}; }
:root:root.light #detail-panel {
  ${join(panelDark)};
}
`;
};

/** The colours a theme card shows: surface, text, accent and the gray border, for the face it is made for. */
export const swatches = (theme: GalleryTheme) => {
  const { light, dark } = build(theme);
  const face = theme.mode === 'light' ? light : dark;
  return { surface: face.surface, text: face.text, accent: face.accent, border: face.border, chrome: face.chrome };
};

// ---- checking a theme from outside (an installed file or a URL) ----

const HEX = /^#[\da-f]{6}$/i;
const ID = /^[a-z\d][a-z\d-]{0,63}$/;

/** A theme read from a file or a URL, checked field by field: only colours, numbers and plain names pass, so a
 * theme can change how Gallery looks and nothing else. Throws with what is wrong. */
export const parseTheme = (data: unknown): GalleryTheme => {
  if (!data || typeof data !== 'object') {
    throw new Error('not a theme file');
  }
  const t = data as Record<string, unknown>;
  const palette = (t.palette ?? {}) as Record<string, unknown>;
  if (t.format !== 'gallery-theme' || t.version !== 1) {
    throw new Error('not a Gallery theme (format "gallery-theme", version 1)');
  }
  if (typeof t.id !== 'string' || !ID.test(t.id)) {
    throw new Error('the id must be lower-case letters, digits and dashes');
  }
  if (typeof t.name !== 'string' || t.name.length === 0 || t.name.length > 60) {
    throw new Error('the name must be 1-60 characters');
  }
  if (t.mode !== 'light' && t.mode !== 'dark') {
    throw new Error('the mode must be "light" or "dark"');
  }
  for (const key of ['background', 'foreground', 'accent']) {
    if (typeof palette[key] !== 'string' || !HEX.test(palette[key] as string)) {
      throw new Error(`palette.${key} must be a colour like #1d1720`);
    }
  }
  if (palette.lighterBackground !== undefined && !HEX.test(String(palette.lighterBackground))) {
    throw new Error('palette.lighterBackground must be a colour like #fbf6fc');
  }
  const theme: GalleryTheme = {
    format: 'gallery-theme',
    version: 1,
    id: t.id,
    name: t.name,
    mode: t.mode,
    palette: {
      background: palette.background as string,
      foreground: palette.foreground as string,
      accent: palette.accent as string,
      ...(!!palette.lighterBackground && { lighterBackground: String(palette.lighterBackground) }),
    },
  };
  if (typeof t.author === 'string') {
    theme.author = t.author.slice(0, 60);
  }
  const geometry = t.geometry as Record<string, unknown> | undefined;
  if (geometry && typeof geometry === 'object') {
    theme.geometry = {};
    for (const key of ['gap', 'radius', 'border'] as const) {
      const value = geometry[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 64) {
        theme.geometry[key] = Math.round(value);
      }
    }
  }
  const fonts = t.fonts as Record<string, unknown> | undefined;
  if (fonts && typeof fonts === 'object') {
    theme.fonts = {};
    for (const key of ['sans', 'display', 'mono'] as const) {
      const value = fonts[key];
      if (typeof value === 'string' && FONT.test(value)) {
        theme.fonts[key] = value;
      }
    }
  }
  // a preview may only be an image: a data: URL of an image type, or a same-site path
  if (
    typeof t.preview === 'string' &&
    (/^data:image\/(webp|png|jpeg);base64,[\w+/=]+$/.test(t.preview) || /^\/themes\/[\w.-]+$/.test(t.preview))
  ) {
    theme.preview = t.preview;
  }
  return theme;
};
