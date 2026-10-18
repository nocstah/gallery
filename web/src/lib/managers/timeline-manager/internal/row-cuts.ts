// Local Omarchy layer ("Tiled Workspace", DESIGN.md Layout: Rows fill the width): where the timeline's rows break.
// A month's photos, day after day, are cut into rows that each fill the width at one height, choosing the cuts that
// keep every row nearest the target height (internal/layout-support places them). A day that fits on one line keeps
// its photos together on it, and one too wide for one line takes rows of its own, as before; but either gives way
// where that would leave a row short of the edge: a day of two photos between two that each fill rows of their own
// had nothing to share a row with and stood alone, 40% of the Dell's width empty beside it (2026-10-18). Then a day
// that fits one line breaks across two, and one that is too wide shares its first or last row with the days beside it.

/** The least a row's photos may shrink and the most they may grow, against the target height. */
export const MIN_SCALE = 0.72;
export const MAX_SCALE = 1.6;
/** With day labels, a day too wide for one line keeps its rows and each is justified to the edge at its own height,
 * as it always was: no cap, and this floor only so the search ends. */
const JUSTIFIED_FLOOR = 0.25;
/** A row that cannot reach the edge costs more than any arrangement of rows that can. */
export const SHORT_ROW_COST = 100;
/** Breaking a day that fits on one line: worth it to fill a row that would stay short, never to even out heights. */
export const SPLIT_COST = 1;
/** A day too wide for one line sharing its first or last row with another day, rather than keeping its rows. */
export const SHARE_COST = 0.5;
/** A short last row of whole days handed on to the next month (layout-support): dearer than any row that fills,
 * cheaper than breaking a day, as months sharing rows came first (2026-10-15). */
export const HAND_ON_COST = 0.5;

export type CutDay = {
  /** each photo's width over height, in grid order */
  ratios: number[];
  /** a day the month before handed on: it stays whole */
  whole?: boolean;
};

export type CutOptions = {
  width: number;
  /** the target row height */
  rowHeight: number;
  /** between two photos of one day */
  spacing: number;
  /** between two days on a row */
  gap: number;
  /** without day labels the days are one grid and may share rows across their breaks; with them each day keeps its
   * own (a day that fits one line stays whole, one too wide for it takes rows to itself) */
  share: boolean;
  /** the cost of leaving the last row short when whole days end it and the next month can take them */
  handOn?: number;
};

/** One day's photos `from` to `to` (not included) on a row. */
export type RowPart = { day: number; from: number; to: number };

/** Whether a day's photos fit on one line at the smallest height. */
export const fitsOneLine = (ratios: number[], { width, rowHeight, spacing }: Omit<CutOptions, 'gap' | 'share'>) =>
  ratios.reduce((sum, ratio) => sum + ratio, 0) * rowHeight * MIN_SCALE + (ratios.length - 1) * spacing <= width;

/** Whether `row` is justified to the edge whatever its height: with day labels, a row of a day too wide for one
 * line. */
export const justifiedRow = (row: RowPart[], days: CutDay[], options: CutOptions) =>
  !options.share && row.length === 1 && !fitsOneLine(days[row[0].day].ratios, options);

/**
 * The rows for `days`, each a list of day parts in grid order: the cuts that cost least, a row costing how far its
 * height lies from the target (log scale, squared), a row that cannot reach the edge SHORT_ROW_COST more, and a day
 * broken or shared as above what that costs. No row of more than one photo shrinks below MIN_SCALE.
 */
export const cutRows = (days: CutDay[], options: CutOptions): RowPart[][] => {
  const { width, rowHeight, spacing, gap, share, handOn } = options;
  const total = days.reduce((sum, day) => sum + day.ratios.length, 0);
  if (total === 0) {
    return [];
  }
  const dayOf = new Int32Array(total);
  const firstOf: number[] = [];
  const prefix = new Float64Array(total + 1);
  const wideBefore = new Int32Array(days.length + 1);
  let at = 0;
  for (const [index, day] of days.entries()) {
    firstOf.push(at);
    for (const ratio of day.ratios) {
      dayOf[at] = index;
      prefix[at + 1] = prefix[at] + ratio;
      at++;
    }
  }
  const wide = days.map((day) => !fitsOneLine(day.ratios, options));
  for (const [index, isWide] of wide.entries()) {
    wideBefore[index + 1] = wideBefore[index] + (isWide ? 1 : 0);
  }

  // best[end]: the least the photos before `end` cost when a row ends there; cut[end]: where that row starts
  const best = new Float64Array(total + 1).fill(Infinity);
  const cut = new Int32Array(total + 1);
  best[0] = 0;
  for (let end = 1; end <= total; end++) {
    const last = dayOf[end - 1];
    const endsInside = end < total && dayOf[end] === last;
    // a whole day never breaks; with day labels, only a day too wide for one line does
    if (endsInside && (days[last].whole || (!share && !wide[last]))) {
      continue;
    }
    for (let start = end - 1; start >= 0; start--) {
      const first = dayOf[start];
      // no row starts inside a whole day
      if (days[first].whole && start > firstOf[first]) {
        continue;
      }
      // with day labels, a row holding part of a wide day holds nothing else (and more photos only add more days)
      if (!share && first !== last && wideBefore[last + 1] > wideBefore[first]) {
        break;
      }
      const tiles = end - start;
      const dayCount = last - first + 1;
      const fixed = (tiles - dayCount) * spacing + (dayCount - 1) * gap;
      const scale = (width - fixed) / (prefix[end] - prefix[start]) / rowHeight;
      const justified = !share && first === last && wide[first];
      // more photos only squeeze the row further; one photo always has a row of its own, and so does a whole day
      const squeezed = tiles > 1 && scale < (justified ? JUSTIFIED_FLOOR : MIN_SCALE);
      if (squeezed && !(days[first].whole && first === last)) {
        break;
      }
      if (best[start] === Infinity) {
        if (squeezed) {
          break;
        }
        continue;
      }
      const startsInside = start > 0 && dayOf[start - 1] === first;
      const short = scale > MAX_SCALE && !justified;
      let cost = best[start];
      if (short && end === total && handOn !== undefined && !startsInside) {
        // whole days that go on to the next month's first row, where they are laid out
        cost += handOn;
      } else {
        cost += Math.log(scale) ** 2 + (short ? SHORT_ROW_COST : 0);
      }
      if (endsInside && !wide[last]) {
        cost += SPLIT_COST;
      }
      if (first !== last) {
        if (startsInside && wide[first]) {
          cost += SHARE_COST;
        }
        if (endsInside && wide[last]) {
          cost += SHARE_COST;
        }
      }
      if (cost < best[end]) {
        best[end] = cost;
        cut[end] = start;
      }
      if (squeezed) {
        break;
      }
    }
  }

  const rows: RowPart[][] = [];
  for (let end = total; end > 0; end = cut[end]) {
    const parts: RowPart[] = [];
    for (let from = cut[end]; from < end;) {
      const day = dayOf[from];
      const to = Math.min(end, firstOf[day] + days[day].ratios.length);
      parts.push({ day, from: from - firstOf[day], to: to - firstOf[day] });
      from = to;
    }
    rows.unshift(parts);
  }
  return rows;
};
