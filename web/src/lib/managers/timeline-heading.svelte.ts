// Local Omarchy layer: the month in view of a page's timeline, for the month heading the one bar keeps beside a page's
// title (layouts/UserPageLayout: Favorites, an album, a person, Archive, a Space's photos...), as Photos keeps its own
// (TimelineWorkspaces). A timeline shows itself here while it shows a plain grid of days; the last one shown is the one
// the bar follows, and when it goes the one before it is followed again.
import { untrack } from 'svelte';
import type { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
import type { TimelineGrouping, ViewportTopMonth } from '$lib/managers/timeline-manager/types';
import type { TimelineYearMonth } from '$lib/utils/timeline-util';

export type TimelineHeadingSource = {
  readonly timelineManager: TimelineManager;
  /** the month at the top of the view (Timeline's viewportTopMonth) */
  readonly month: ViewportTopMonth;
  /** the month name opens the Months overview, the year the Years overview */
  readonly onGrouping?: (grouping: TimelineGrouping) => void;
};

/** The month a heading names: the one at the top of the view; above the first month its first, past the last its last. */
export const monthInView = (
  timelineManager: TimelineManager,
  month: ViewportTopMonth,
): TimelineYearMonth | undefined => {
  if (month && typeof month === 'object') {
    return month;
  }
  const months = timelineManager.scrubberMonths;
  const at = month === 'lead-out' ? months.at(-1) : months[0];
  return at ? { year: at.year, month: at.month } : undefined;
};

class TimelineHeading {
  #sources = $state.raw<TimelineHeadingSource[]>([]);

  get current(): TimelineHeadingSource | undefined {
    return this.#sources.at(-1);
  }

  /**
   * The bar follows `source` until the returned function is called. Called from a timeline's effect, so the list is
   * read untracked: an effect that read what it writes here would run itself again without end.
   */
  show(source: TimelineHeadingSource) {
    this.#sources = [...untrack(() => this.#sources), source];
    return () => {
      this.#sources = untrack(() => this.#sources).filter((shown) => shown !== source);
    };
  }
}

export const timelineHeading = new TimelineHeading();
