import { cubicBezier, readDesktopMotion } from '$lib/utils/desktop-motion';

const TOKENS = [
  '--ws-open-ms',
  '--ws-close-ms',
  '--ws-close-scale',
  '--ws-close-ease',
  '--ws-workspace-ms',
  '--ws-workspace-shift',
  '--ws-workspace-fade',
];

describe('cubicBezier', () => {
  it('runs from 0 to 1', () => {
    const ease = cubicBezier(0.22, 1, 0.36, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-0.5)).toBe(0);
    expect(ease(2)).toBe(1);
  });

  it('is the straight line for linear', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const t of [0.1, 0.37, 0.5, 0.9]) {
      expect(linear(t)).toBeCloseTo(t, 4);
    }
  });

  it("matches the browser's ease", () => {
    // CSS ease is cubic-bezier(0.25, 0.1, 0.25, 1); half way through time it is about 80% of the way
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });

  it('only ever moves forward on an ease-out', () => {
    const rise = cubicBezier(0.16, 1, 0.3, 1);
    let last = 0;
    for (let step = 1; step <= 50; step++) {
      const value = rise(step / 50);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
    // most of the way there early, as the desktop's snap curve is
    expect(rise(0.25)).toBeGreaterThan(0.7);
  });
});

describe('readDesktopMotion', () => {
  afterEach(() => {
    for (const name of TOKENS) {
      document.documentElement.style.removeProperty(name);
    }
  });

  it("falls back to the owner's desktop when the theme hook has not run", () => {
    const motion = readDesktopMotion();

    expect(motion.open).toMatchObject({ duration: 550, scale: 0.92 });
    expect(motion.close).toMatchObject({ duration: 350, scale: 0.92 });
    expect(motion.move.duration).toBe(400);
    expect(motion.workspace).toMatchObject({ duration: 500, shift: 0.2, fade: true });
    expect(motion.workspace.ease).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  });

  it("reads the desktop's own animations from the hook's tokens", () => {
    const root = document.documentElement.style;
    root.setProperty('--ws-close-ms', '200ms');
    root.setProperty('--ws-close-scale', '0.8');
    root.setProperty('--ws-close-ease', 'cubic-bezier(0, 0, 1, 1)');
    root.setProperty('--ws-workspace-shift', '100%');
    root.setProperty('--ws-workspace-fade', '0');

    const motion = readDesktopMotion();

    expect(motion.close.duration).toBe(200);
    expect(motion.close.scale).toBe(0.8);
    expect(motion.close.easing(0.3)).toBeCloseTo(0.3, 4);
    expect(motion.workspace).toMatchObject({ shift: 1, fade: false });
  });

  it('takes an animation the desktop has off as 0ms', () => {
    document.documentElement.style.setProperty('--ws-open-ms', '0ms');
    document.documentElement.style.setProperty('--ws-workspace-ms', '0ms');

    const motion = readDesktopMotion();

    expect(motion.open.duration).toBe(0);
    expect(motion.workspace.duration).toBe(0);
  });
});
