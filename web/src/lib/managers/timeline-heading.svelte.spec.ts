import { flushSync } from 'svelte';
import { monthInView, timelineHeading, type TimelineHeadingSource } from '$lib/managers/timeline-heading.svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';

const manager = {
  scrubberMonths: [
    { year: 2026, month: 10 },
    { year: 1977, month: 5 },
  ],
} as unknown as TimelineManager;

const source = (month: TimelineHeadingSource['month']): TimelineHeadingSource => ({ timelineManager: manager, month });

describe('timelineHeading', () => {
  it('follows the timeline shown last, and the one before once it goes', () => {
    const page = source({ year: 2026, month: 10 });
    const over = source({ year: 2014, month: 3 });
    const hidePage = timelineHeading.show(page);
    const hideOver = timelineHeading.show(over);
    expect(timelineHeading.current).toBe(over);

    hideOver();
    expect(timelineHeading.current).toBe(page);

    hidePage();
    expect(timelineHeading.current).toBeUndefined();
  });

  it('is shown from an effect without running the effect again', () => {
    let runs = 0;
    const cleanup = $effect.root(() => {
      $effect(() => {
        runs++;
        return timelineHeading.show(source(undefined));
      });
    });
    flushSync();
    expect(runs).toBe(1);
    expect(timelineHeading.current).toBeDefined();

    cleanup();
    expect(timelineHeading.current).toBeUndefined();
  });
});

describe('monthInView', () => {
  it('names the month at the top of the view', () => {
    expect(monthInView(manager, { year: 2014, month: 3 })).toEqual({ year: 2014, month: 3 });
  });

  it('names the first month above the photos and the last past them', () => {
    expect(monthInView(manager, undefined)).toEqual({ year: 2026, month: 10 });
    expect(monthInView(manager, 'lead-in')).toEqual({ year: 2026, month: 10 });
    expect(monthInView(manager, 'lead-out')).toEqual({ year: 1977, month: 5 });
  });

  it('names none for a timeline without months', () => {
    expect(monthInView({ scrubberMonths: [] } as unknown as TimelineManager, undefined)).toBeUndefined();
  });
});
