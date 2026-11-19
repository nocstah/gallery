import type { TimelineManager } from '#lib/managers/timeline-manager/timeline-manager.svelte.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTimelineTopVisibleAnchor, retryOnAnimationFrames, scrollTimelineToTemporalAnchor } from './timeline-anchor';

function buildManager(timelineManager: Partial<TimelineManager>) {
  return timelineManager as TimelineManager;
}

describe('scrollTimelineToTemporalAnchor', () => {
  it('scrolls to matching representative year bucket when grouping month', () => {
    const scrollTo = vi.fn();
    let scrollTop = 0;
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [
        { date: { year: 2015 }, top: 120, height: 296, rowTop: 120, rowHeight: 296 },
      ] as TimelineManager['timelineBuckets'],
      viewportHeight: 600,
      maxScroll: 1200,
      get scrollTop() {
        return scrollTop;
      },
      scrollTo: vi.fn((top: number) => {
        scrollTo(top);
        scrollTop = top;
      }),
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(120);
  });

  it('scrolls to matching representative month bucket when grouping month', () => {
    const scrollTo = vi.fn();
    let scrollTop = 0;
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [
        { date: { year: 2015, month: 8 }, top: 240, height: 296, rowTop: 240, rowHeight: 296 },
      ] as TimelineManager['timelineBuckets'],
      viewportHeight: 600,
      maxScroll: 1200,
      get scrollTop() {
        return scrollTop;
      },
      scrollTo: vi.fn((top: number) => {
        scrollTo(top);
        scrollTop = top;
      }),
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015, month: 8 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(240);
  });

  it('scrolls to detailed month container in day mode', () => {
    const scrollTo = vi.fn();
    let scrollTop = 0;
    const timelineManager = buildManager({
      grouping: 'day',
      months: [{ yearMonth: { year: 2015, month: 8 }, top: 360, height: 240 }] as TimelineManager['months'],
      viewportHeight: 600,
      maxScroll: 1200,
      get scrollTop() {
        return scrollTop;
      },
      scrollTo: vi.fn((top: number) => {
        scrollTo(top);
        scrollTop = top;
      }),
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015, month: 8 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(360);
  });

  it('does not report success when the scroll position remains outside the target month', () => {
    const scrollTo = vi.fn();
    const timelineManager = buildManager({
      grouping: 'day',
      months: [{ yearMonth: { year: 2015, month: 8 }, top: 1200, height: 240 }] as TimelineManager['months'],
      viewportHeight: 600,
      maxScroll: 2000,
      scrollTop: 0,
      scrollTo,
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2015, month: 8 });

    expect(didScroll).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith(1200);
  });

  it('returns false and does not scroll when target not loaded', () => {
    const scrollTo = vi.fn();
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [{ date: { year: 2015, month: 8 }, top: 240 }] as TimelineManager['timelineBuckets'],
      scrollTo,
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2016, month: 8 });

    expect(didScroll).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls a month-precision anchor to the matching year bucket when grouping year', () => {
    const scrollTo = vi.fn();
    let scrollTop = 0;
    const timelineManager = buildManager({
      grouping: 'year',
      timelineBuckets: [
        { date: { year: 2017 }, top: 480, height: 296, rowTop: 480, rowHeight: 296 },
      ] as TimelineManager['timelineBuckets'],
      viewportHeight: 600,
      maxScroll: 2000,
      get scrollTop() {
        return scrollTop;
      },
      scrollTo: vi.fn((top: number) => {
        scrollTo(top);
        scrollTop = top;
      }),
    });

    const didScroll = scrollTimelineToTemporalAnchor(timelineManager, { year: 2017, month: 11 });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(480);
  });

  it("scrolls a year opened into its months to the top of the year's row, its name included", () => {
    // a phone: the year's months on three lines under its name, December (first in the timeline's order) on the last
    const scrollTo = vi.fn();
    let scrollTop = 0;
    const timelineManager = buildManager({
      grouping: 'month',
      timelineBuckets: [
        { date: { year: 2015, month: 12 }, top: 900, height: 86, rowTop: 696, rowHeight: 310 },
        { date: { year: 2015, month: 1 }, top: 732, height: 86, rowTop: 696, rowHeight: 310 },
      ] as TimelineManager['timelineBuckets'],
      viewportHeight: 700,
      maxScroll: 4000,
      get scrollTop() {
        return scrollTop;
      },
      scrollTo: vi.fn((top: number) => {
        scrollTo(top);
        scrollTop = top;
      }),
    });

    expect(scrollTimelineToTemporalAnchor(timelineManager, { year: 2015 })).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(696);
  });
});

describe('getTimelineTopVisibleAnchor', () => {
  it('returns the month at the top of the viewport in day grouping', () => {
    const timelineManager = buildManager({
      isInitialized: true,
      grouping: 'day',
      scrollTop: 400,
      months: [
        { yearMonth: { year: 2026, month: 2 }, top: 0, height: 300 },
        { yearMonth: { year: 2017, month: 11 }, top: 300, height: 300 },
      ] as TimelineManager['months'],
    });

    expect(getTimelineTopVisibleAnchor(timelineManager)).toEqual({ year: 2017, month: 11 });
  });

  it('returns the month bucket at the top in month grouping', () => {
    const timelineManager = buildManager({
      isInitialized: true,
      grouping: 'month',
      scrollTop: 350,
      timelineBuckets: [
        { date: { year: 2026, month: 2 }, top: 0, height: 296 },
        { date: { year: 2020, month: 8 }, top: 296, height: 296 },
      ] as TimelineManager['timelineBuckets'],
    });

    expect(getTimelineTopVisibleAnchor(timelineManager)).toEqual({ year: 2020, month: 8 });
  });

  it('returns a year-only anchor at the top in year grouping', () => {
    const timelineManager = buildManager({
      isInitialized: true,
      grouping: 'year',
      scrollTop: 350,
      timelineBuckets: [
        { date: { year: 2026 }, top: 0, height: 296 },
        { date: { year: 2020 }, top: 296, height: 296 },
      ] as TimelineManager['timelineBuckets'],
    });

    expect(getTimelineTopVisibleAnchor(timelineManager)).toEqual({ year: 2020 });
  });

  it('returns undefined when scrolled within the top section above the first month (day grouping)', () => {
    // The first month starts at topSectionHeight (e.g. below the memories strip); a scrollTop above
    // it means the top section is visible, so there is no month to anchor to.
    const timelineManager = buildManager({
      isInitialized: true,
      grouping: 'day',
      scrollTop: 0,
      months: [
        { yearMonth: { year: 2026, month: 2 }, top: 260, height: 300 },
        { yearMonth: { year: 2017, month: 11 }, top: 560, height: 300 },
      ] as TimelineManager['months'],
    });

    expect(getTimelineTopVisibleAnchor(timelineManager)).toBeUndefined();
  });

  it('returns undefined when scrolled within the top section above the first card (year grouping)', () => {
    const timelineManager = buildManager({
      isInitialized: true,
      grouping: 'year',
      scrollTop: 120,
      timelineBuckets: [
        { date: { year: 2026 }, top: 260, height: 296 },
        { date: { year: 2020 }, top: 556, height: 296 },
      ] as TimelineManager['timelineBuckets'],
    });

    expect(getTimelineTopVisibleAnchor(timelineManager)).toBeUndefined();
  });

  it('returns the topmost period still in view in the Years grid, past a gap between rows', () => {
    // newest first, each decade a row: 2026 and 2020 share the first row, 2019 and 2010 the second
    const timelineManager = buildManager({
      isInitialized: true,
      grouping: 'year',
      scrollTop: 205,
      timelineBuckets: [
        { date: { year: 2026 }, top: 0, height: 200 },
        { date: { year: 2020 }, top: 0, height: 200 },
        { date: { year: 2019 }, top: 210, height: 200 },
        { date: { year: 2010 }, top: 210, height: 200 },
      ] as TimelineManager['timelineBuckets'],
    });

    expect(getTimelineTopVisibleAnchor(timelineManager)).toEqual({ year: 2019 });
  });

  it('returns the line above when a row breaks into lines and the newest stands on the later one', () => {
    // a phone: 2020 to 2024 on the first line of the 2020s, 2025 and 2026 on the second
    const timelineManager = buildManager({
      isInitialized: true,
      grouping: 'year',
      scrollTop: 40,
      timelineBuckets: [
        { date: { year: 2026 }, top: 112, height: 66 },
        { date: { year: 2024 }, top: 36, height: 66 },
      ] as TimelineManager['timelineBuckets'],
    });

    expect(getTimelineTopVisibleAnchor(timelineManager)).toEqual({ year: 2024 });
  });

  it('returns undefined when the timeline is not initialized', () => {
    expect(getTimelineTopVisibleAnchor(buildManager({ isInitialized: false }))).toBeUndefined();
  });
});

describe('retryOnAnimationFrames', () => {
  const frames: FrameRequestCallback[] = [];
  const flushFrame = async () => {
    frames.shift()?.(0);
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    frames.length = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => frames.splice(0));
  });

  afterEach(() => vi.restoreAllMocks());

  it('runs the step once per frame until it reports done', async () => {
    const step = vi.fn((frame: number) => frame === 2);
    retryOnAnimationFrames(step, 10);

    expect(step).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) {
      await flushFrame();
    }

    expect(step.mock.calls.map(([frame]) => frame)).toEqual([0, 1, 2]);
  });

  it('gives up after the first frame plus maxRetries more', async () => {
    const step = vi.fn(() => false);
    retryOnAnimationFrames(step, 2);
    for (let i = 0; i < 5; i++) {
      await flushFrame();
    }

    expect(step).toHaveBeenCalledTimes(3);
  });

  it('stops on cancel and tells a step already running that it was cancelled', async () => {
    let cancel = () => {};
    const seen: boolean[] = [];
    const step = vi.fn(async (_frame: number, isCancelled: () => boolean) => {
      cancel();
      await Promise.resolve();
      seen.push(isCancelled());
      return false;
    });
    cancel = retryOnAnimationFrames(step, 10);
    for (let i = 0; i < 3; i++) {
      await flushFrame();
    }

    expect(step).toHaveBeenCalledOnce();
    expect(seen).toEqual([true]);
  });
});
