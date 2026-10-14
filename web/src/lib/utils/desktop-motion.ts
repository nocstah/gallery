// Local Omarchy layer: the desktop's own motion, for animations written in script. The theme hook
// (~/.local/bin/immich-omarchy-theme) reads Hyprland's animations (windowsIn/Out/Move, fadeIn, workspaces) into the
// --ws-* motion tokens beside the geometry, and styles/omarchy-world.css keeps the owner's values as fallbacks and uses
// the tokens in CSS directly. Svelte transitions and Web Animations need numbers and easing functions, so this reads
// the same tokens. A duration of 0 means the desktop has that animation off.

export type Easing = (t: number) => number;

type Curve = [number, number, number, number];

/** A CSS cubic-bezier() as an easing function, solved the way browsers do (Newton's method, then bisection). */
export const cubicBezier = (x1: number, y1: number, x2: number, y2: number): Easing => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x: number) => {
    let t = x;
    for (let index = 0; index < 8; index++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) {
        return t;
      }
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) {
        break;
      }
      t -= error / slope;
    }
    let low = 0;
    let high = 1;
    t = x;
    for (let index = 0; index < 40; index++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-6) {
        break;
      }
      if (x > value) {
        low = t;
      } else {
        high = t;
      }
      t = (low + high) / 2;
    }
    return t;
  };

  return (t: number) => {
    if (t <= 0) {
      return 0;
    }
    if (t >= 1) {
      return 1;
    }
    return sampleY(solveX(t));
  };
};

export type WindowMotion = { duration: number; easing: Easing; scale: number };
export type MoveMotion = { duration: number; easing: Easing };
export type WorkspaceMotion = { duration: number; easing: Easing; ease: string; shift: number; fade: boolean };
export type DesktopMotion = {
  open: WindowMotion;
  fadeIn: MoveMotion;
  close: WindowMotion;
  move: MoveMotion;
  workspace: WorkspaceMotion;
};

const CURVE = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/;

// the owner's Hyprland values (2026-10-15), as in omarchy-world.css :root
const FALLBACK = {
  open: { ms: 550, curve: [0.22, 1, 0.36, 1] as Curve, scale: 0.92 },
  fadeIn: { ms: 400, curve: [0.25, 0.1, 0.25, 1] as Curve },
  close: { ms: 350, curve: [0.38, 0, 0.2, 1] as Curve, scale: 0.92 },
  move: { ms: 400, curve: [0.16, 1, 0.3, 1] as Curve },
  workspace: { ms: 500, curve: [0.16, 1, 0.3, 1] as Curve, shift: 0.2, fade: true },
};

const toCurve = (value: string, fallback: Curve): Curve => {
  const match = CURVE.exec(value);
  if (!match) {
    return fallback;
  }
  const points = match.slice(1).map(Number) as Curve;
  return points.every((point) => Number.isFinite(point)) ? points : fallback;
};

/** a token's number without its unit ('550ms', '20%', '0.92'); an unwritten (empty) token takes the fallback */
const toNumber = (value: string, fallback: number) => {
  const number = value === '' ? NaN : Number(value.replace(/(ms|%)$/, ''));
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};

const css = ([x1, y1, x2, y2]: Curve) => `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;

/** The desktop's motion as the tokens on the page say it now (the hook's values, else the fallbacks). */
export const readDesktopMotion = (): DesktopMotion => {
  const style = typeof document === 'undefined' ? undefined : getComputedStyle(document.documentElement);
  const token = (name: string) => style?.getPropertyValue(`--ws-${name}`).trim() ?? '';
  const windowFrom = (name: string, fallback: { ms: number; curve: Curve; scale: number }): WindowMotion => ({
    duration: toNumber(token(`${name}-ms`), fallback.ms),
    easing: cubicBezier(...toCurve(token(`${name}-ease`), fallback.curve)),
    scale: Math.min(1, toNumber(token(`${name}-scale`), fallback.scale)),
  });
  const moveFrom = (name: string, fallback: { ms: number; curve: Curve }): MoveMotion => ({
    duration: toNumber(token(`${name}-ms`), fallback.ms),
    easing: cubicBezier(...toCurve(token(`${name}-ease`), fallback.curve)),
  });
  const workspaceCurve = toCurve(token('workspace-ease'), FALLBACK.workspace.curve);
  const shift = token('workspace-shift');
  const fade = token('workspace-fade');
  return {
    open: windowFrom('open', FALLBACK.open),
    fadeIn: moveFrom('fade-in', FALLBACK.fadeIn),
    close: windowFrom('close', FALLBACK.close),
    move: moveFrom('move', FALLBACK.move),
    workspace: {
      duration: toNumber(token('workspace-ms'), FALLBACK.workspace.ms),
      easing: cubicBezier(...workspaceCurve),
      ease: css(workspaceCurve),
      shift: Math.min(1, toNumber(shift, FALLBACK.workspace.shift * 100) / 100),
      fade: fade === '' ? FALLBACK.workspace.fade : fade !== '0',
    },
  };
};

const FRESH_MS = 5000;
let cached: { at: number; motion: DesktopMotion } | undefined;

/** readDesktopMotion, read again at most every few seconds: day sections and tiles ask for it as they are made */
export const desktopMotion = (): DesktopMotion => {
  const now = Date.now();
  if (!cached || now - cached.at > FRESH_MS) {
    cached = { at: now, motion: readDesktopMotion() };
  }
  return cached.motion;
};
