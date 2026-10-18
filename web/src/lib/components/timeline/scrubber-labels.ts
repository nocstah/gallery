// Local Omarchy layer: which years the scrubber names (Scrubber.svelte). Upstream named a year wherever 16px had passed
// since the last name, counting up from the oldest, so where fifty years share a short bar (a laptop's 900px) the
// names, 19.5px tall, ran into each other, and the ones that survived fell on whatever years came next. Now no two
// names stand closer than a name's height and a little air, and where not every year fits, the years that tell the
// most go first: the newest and the oldest, then the decades, then every fifth year, then every second, then the rest.

/** A year's place on the scrubber: how far its name sits from the bar's foot (the foot of its oldest month). */
export type YearMark = { year: number; at: number };

/** The years' names keep this far apart: a 13px name's 19.5px line and some air between two of them. */
export const YEAR_LABEL_SPACING = 22;

/** How much a year tells as a name on the bar, 0 the most. */
export const yearRank = (year: number, newest: number, oldest: number) => {
  if (year === newest || year === oldest) {
    return 0;
  }
  if (year % 10 === 0) {
    return 1;
  }
  if (year % 5 === 0) {
    return 2;
  }
  return year % 2 === 0 ? 3 : 4;
};

/** The years to name: taken in rank order (a newer year first within a rank), each kept only where it stands at
 * least `spacing` from every name kept before it. Where all fit, every year keeps its name. */
export const pickYearLabels = (marks: YearMark[], spacing = YEAR_LABEL_SPACING): Set<number> => {
  if (marks.length === 0) {
    return new Set();
  }
  const years = marks.map(({ year }) => year);
  const newest = Math.max(...years);
  const oldest = Math.min(...years);
  const ordered = [...marks].sort(
    (a, b) => yearRank(a.year, newest, oldest) - yearRank(b.year, newest, oldest) || b.year - a.year,
  );
  const kept: YearMark[] = [];
  for (const mark of ordered) {
    if (kept.every((other) => Math.abs(other.at - mark.at) >= spacing)) {
      kept.push(mark);
    }
  }
  return new Set(kept.map(({ year }) => year));
};
