import { SETTLING_ATTR } from '#lib/gallery/motion/thumbnail-lift.ts';
import {
  LIFT_FULL_BELOW_PX,
  LIFT_GALLERY_FROM_PX,
  LIFT_MARGIN_PX,
  LIFT_MAX,
  LIFT_MIN,
  LIFT_TARGET_PX,
  installTileLift,
  liftBox,
  liftOffset,
  liftScale,
} from '#lib/utils/tile-lift.ts';

const area = { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 };
const at = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

describe('liftScale', () => {
  it('grows a small photo until it is about the target on a side, by its area', () => {
    expect(Math.sqrt(liftScale(80, 80, 1000, 800) ** 2 * 80 * 80)).toBeCloseTo(LIFT_TARGET_PX);
    const portrait = liftScale(60, 80, 1000, 800);
    const panorama = liftScale(160, 60, 1000, 800);
    expect(Math.sqrt(60 * 80) * portrait).toBeCloseTo(LIFT_TARGET_PX);
    expect(Math.sqrt(160 * 60) * panorama).toBeCloseTo(LIFT_TARGET_PX);
  });

  it('never grows a photo less than Gallery does, nor past the most', () => {
    expect(liftScale(400, 300, 1000, 800)).toBe(LIFT_MIN);
    expect(liftScale(20, 20, 1000, 800)).toBe(LIFT_MAX);
  });

  it('lifts a photo the usual size as Gallery does, and blends between', () => {
    expect(liftScale(169, 224, 1000, 800)).toBe(LIFT_MIN);
    expect(liftScale(150, LIFT_GALLERY_FROM_PX, 1000, 800)).toBe(LIFT_MIN);
    const between = liftScale(120, 160, 1000, 800);
    const full = LIFT_TARGET_PX / Math.sqrt(120 * 160);
    expect(between).toBeCloseTo(LIFT_MIN + (full - LIFT_MIN) / 2);
    expect(liftScale(90, LIFT_FULL_BELOW_PX, 1000, 800)).toBeCloseTo(
      LIFT_TARGET_PX / Math.sqrt(90 * LIFT_FULL_BELOW_PX),
    );
  });

  it('never grows a photo past its scroll area', () => {
    expect(liftScale(100, 100, 216, 800)).toBeCloseTo(2);
    expect(liftScale(990, 790, 1000, 800)).toBe(1);
    expect(liftScale(0, 100, 1000, 800)).toBe(1);
  });
});

describe('liftOffset', () => {
  it('grows about the centre where there is room', () => {
    expect(liftOffset(500, 100, 0, 1200, 2)).toBe(-50);
  });

  it('keeps a photo at an edge inside the area, the margin clear', () => {
    expect(10 + liftOffset(10, 100, 0, 1200, 2.5)).toBe(LIFT_MARGIN_PX);
    expect(1090 + liftOffset(1090, 100, 0, 1200, 2.5) + 250).toBe(1200 - LIFT_MARGIN_PX);
  });

  it('leaves a photo that does not grow where it is', () => {
    expect(liftOffset(0, 900, 0, 800, 1)).toBe(0);
  });
});

describe('liftBox', () => {
  it('answers how far the photo moves and how many times it grows, the photo kept on screen', () => {
    const box = liftBox(at(0, 0, 80, 80), area);
    expect(80 * box.scale).toBeCloseTo(LIFT_TARGET_PX);
    expect(box.x).toBe(LIFT_MARGIN_PX);
    expect(box.y).toBe(LIFT_MARGIN_PX);
  });

  it('grows a large photo by Gallery’s tenth about its centre', () => {
    const box = liftBox(at(300, 300, 400, 300), area);
    expect(box.scale).toBe(LIFT_MIN);
    expect(box.x).toBeCloseTo(-20);
    expect(box.y).toBeCloseTo(-15);
  });
});

describe('installTileLift', () => {
  let uninstall: () => void;
  const tile = (width: number, height: number) => {
    const frame = document.createElement('div');
    frame.dataset.thumbnailFocusContainer = '';
    const photo = document.createElement('img');
    frame.append(photo);
    document.body.append(frame);
    frame.getBoundingClientRect = () => DOMRect.fromRect({ x: 100, y: 100, width, height });
    return { frame, photo };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    uninstall = installTileLift();
  });

  afterEach(() => {
    uninstall();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('sets the lift on the frame as the pointer comes onto it, marking one that grows a lot', () => {
    const { frame, photo } = tile(80, 80);
    photo.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const scale = Number(frame.style.getPropertyValue('--ws-lift-s'));
    expect(80 * scale).toBeCloseTo(LIFT_TARGET_PX, 0);
    expect(frame.style.getPropertyValue('--ws-lift-x')).toMatch(/px$/);
    expect(frame.dataset.wsLift).toBe('');
  });

  it('leaves the mark off a photo that lifts as Gallery’s do', () => {
    const { frame, photo } = tile(300, 240);
    frame.dataset.wsLift = '';
    photo.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(Number(frame.style.getPropertyValue('--ws-lift-s'))).toBeCloseTo(LIFT_MIN);
    expect(frame.dataset.wsLift).toBeUndefined();
  });

  it('marks a photo settling back once the pointer leaves it, not while it moves within it', () => {
    const { frame, photo } = tile(80, 80);
    photo.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: frame }));
    expect(frame.hasAttribute(SETTLING_ATTR)).toBe(false);
    photo.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(frame.hasAttribute(SETTLING_ATTR)).toBe(true);
    vi.runAllTimers();
    expect(frame.hasAttribute(SETTLING_ATTR)).toBe(false);
  });
});
