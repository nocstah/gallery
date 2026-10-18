// Local Omarchy layer: the Years and Months overviews laid out as the archive's shape (DESIGN.md, Years and Months
// overviews; components/timeline/TimelineRepresentativeBuckets). Each decade (Years) or year (Months) is a row whose
// slots stand in calendar order at fixed places, so a column is the same year of every decade (1977 under 1987 under
// 1997) or the same month of every year. A period with photos is a tile, one without them inside the archive's span a
// quiet gap, and a run of decades or years with no photos at all one slim line naming it. Plain functions: the timeline
// manager places its buckets from what they return.

export type PeriodKind = 'year' | 'month';

/** A period's place in time: its year (Years) or year × 12 + month − 1 (Months). */
export const periodSlot = (kind: PeriodKind, date: { year: number; month?: number }) =>
  kind === 'year' ? date.year : date.year * 12 + (date.month ?? 1) - 1;

/** A row's unit (the decade's index, or the year) and the slots it holds. */
const PER_ROW: Record<PeriodKind, number> = { year: 10, month: 12 };
/** How many of a row's slots a line holds, widest first: a decade, then its halves; a year, then halves, thirds and
 * quarters. The first whose tiles are at least the smallest tile wins; the last is taken whatever its tiles. */
const PER_LINE: Record<PeriodKind, number[]> = { year: [10, 5], month: [12, 6, 4, 3] };

export type PeriodGridOptions = {
  kind: PeriodKind;
  /** the grid's width, in px (the timeline's) */
  width: number;
  /** the desktop's gap between tiles, in px */
  gap: number;
  /** the timeline's order: the newest row first (the default) or the oldest */
  newestFirst?: boolean;
  /** the room in view, in px: an archive that fits it with tiles at least 3:4 as tall as wide is laid out to fit */
  viewportHeight?: number;
  /** the smallest tile a line may take before the row breaks into more lines */
  minTile?: number;
  /** a tile big enough as it is: a line of them is not broken up for larger ones, even where those would fit */
  comfortTile?: number;
  /** the row's name in a column before its tiles (wide grids) */
  labelWidth?: number;
  /** the row's name on a line above its tiles (narrow grids) */
  labelHeight?: number;
  /** the slim line that stands for a run of rows without photos */
  emptyHeight?: number;
  /** the width from which the row's name stands beside its tiles rather than above them */
  besideFrom?: number;
};

/** A slot in a row: a tile (the period has photos) or a quiet gap (it has none, inside the archive's span). */
export type PeriodCell = { slot: number; tile: boolean; left: number; top: number; width: number; height: number };

export type PeriodRow =
  | {
      kind: 'period';
      /** the decade's index (Years: 197 for the 1970s) or the year (Months) */
      unit: number;
      top: number;
      height: number;
      /** where the row's name stands */
      label: { left: number; top: number; width: number; height: number };
      cells: PeriodCell[];
    }
  | {
      kind: 'empty';
      /** the first and last unit of a run without photos, oldest first */
      first: number;
      last: number;
      top: number;
      height: number;
    };

export type PeriodGrid = {
  kind: PeriodKind;
  /** the slots on a line */
  perLine: number;
  tileWidth: number;
  tileHeight: number;
  /** the name's column, 0 when names stand above their tiles */
  labelWidth: number;
  /** the name's line, 0 when names stand beside their tiles */
  labelHeight: number;
  rows: PeriodRow[];
  /** the most photos any one period holds (the density bars are measured against it) */
  busiest: number;
  height: number;
};

const DEFAULTS = { minTile: 80, comfortTile: 144, labelWidth: 72, labelHeight: 36, emptyHeight: 28, besideFrom: 640 };

/** The smallest share of its own width a tile's height may be squeezed to, so a short archive fits the screen. */
const FIT_RATIO = 0.75;

type Line = { slots: number[] };
type Unit = { unit: number; lines: Line[] } | { empty: true; first: number; last: number };

/**
 * The grid for `periods` (a slot each, see `periodSlot`, with its photo count): the rows in reading order (the newest
 * first unless the timeline runs oldest first), each row's slots oldest first along it, every tile and gap at its place.
 */
export const layoutPeriodGrid = (
  periods: { slot: number; count: number }[],
  options: PeriodGridOptions,
): PeriodGrid | undefined => {
  const { kind, width, gap, newestFirst = true, viewportHeight } = options;
  const { minTile, comfortTile, labelWidth, labelHeight, emptyHeight, besideFrom } = { ...DEFAULTS, ...options };
  if (periods.length === 0 || width <= 0) {
    return;
  }
  const per = PER_ROW[kind];
  const present = new Map(periods.map(({ slot, count }) => [slot, count]));
  const slots = [...present.keys()];
  const first = Math.min(...slots);
  const last = Math.max(...slots);
  const busiest = Math.max(1, ...present.values());
  const unitOf = (slot: number) => Math.floor(slot / per);

  // the name beside the tiles on a wide grid, above them on a narrow one
  const beside = width >= besideFrom;
  const nameWidth = beside ? labelWidth : 0;
  const nameHeight = beside ? 0 : labelHeight;
  const inner = beside ? width - nameWidth - gap : width;
  const lineTile = (count: number) => Math.floor((inner - gap * (count - 1)) / count);

  // the rows: every unit from the newest to the oldest with photos (or the other way round), a unit without photos
  // joining the run of them it is in; a line of slots all outside the archive's span is left out
  const unitsFor = (perLine: number) => {
    const units: Unit[] = [];
    const [from, to] = [unitOf(first), unitOf(last)];
    for (let index = 0; index <= to - from; index++) {
      const unit = newestFirst ? to - index : from + index;
      const own = Array.from({ length: per }, (_, at) => unit * per + at);
      if (own.every((slot) => !present.has(slot))) {
        const previous = units.at(-1);
        if (previous && 'empty' in previous) {
          previous.first = Math.min(previous.first, unit);
          previous.last = Math.max(previous.last, unit);
        } else {
          units.push({ empty: true, first: unit, last: unit });
        }
        continue;
      }
      const lines: Line[] = [];
      for (let at = 0; at < per; at += perLine) {
        const line = own.slice(at, at + perLine);
        if (line.some((slot) => slot >= first && slot <= last)) {
          lines.push({ slots: line });
        }
      }
      units.push({ unit, lines });
    }
    return units;
  };
  // a row that breaks into lines stands further from the next, so the lines read as one decade or year
  const rowGapFor = (perLine: number) => (perLine < per ? gap * 2 : gap);
  // the grid's height with tiles `tileHeight` tall: what never changes with them, and how many lines of them
  const measure = (units: Unit[], rowGap: number) => {
    let fixed = rowGap * (units.length - 1);
    let lineCount = 0;
    for (const unit of units) {
      if ('empty' in unit) {
        fixed += emptyHeight;
      } else {
        fixed += nameHeight + gap * (unit.lines.length - 1);
        lineCount += unit.lines.length;
      }
    }
    return { fixed, lineCount };
  };

  // as many slots to a line as keep the tiles at least minTile wide. A whole row to a line whose tiles are big enough
  // as they are stays so (the AORUS); one whose tiles are small takes, where the room in view is known, the largest
  // tiles with which the whole archive still fits it (the portrait screen takes half decades), the tiles giving up to a
  // quarter of their height for it; else the most to a line, so a long archive scrolls past fewer rows
  const choices = PER_LINE[kind].map((perLine) => ({ perLine, tile: lineTile(perLine), units: unitsFor(perLine) }));
  const usable = choices.filter(({ tile }) => tile >= minTile);
  const fits = ({ perLine, tile, units }: (typeof choices)[number]) => {
    const { fixed, lineCount } = measure(units, rowGapFor(perLine));
    return !!viewportHeight && fixed + lineCount * Math.ceil(tile * FIT_RATIO) <= viewportHeight;
  };
  const [widest] = usable;
  const roomy = widest && widest.tile >= comfortTile ? widest : undefined;
  const choice =
    roomy ?? usable.filter((option) => fits(option)).sort((a, b) => b.tile - a.tile)[0] ?? usable[0] ?? choices.at(-1)!;
  const { perLine, units } = choice;
  const tileWidth = Math.max(1, choice.tile);
  const rowGap = rowGapFor(perLine);

  let tileHeight = tileWidth;
  if (viewportHeight && viewportHeight > 0) {
    const { fixed, lineCount } = measure(units, rowGap);
    const fit = Math.floor((viewportHeight - fixed) / Math.max(1, lineCount));
    if (fit < tileWidth && fit >= Math.ceil(tileWidth * FIT_RATIO)) {
      tileHeight = fit;
    }
  }

  const rows: PeriodRow[] = [];
  const x0 = beside ? nameWidth + gap : 0;
  let y = 0;
  for (const unit of units) {
    if ('empty' in unit) {
      rows.push({ kind: 'empty', first: unit.first, last: unit.last, top: y, height: emptyHeight });
      y += emptyHeight + rowGap;
      continue;
    }
    const top = y;
    const cells: PeriodCell[] = [];
    for (const [lineIndex, line] of unit.lines.entries()) {
      const lineTop = top + nameHeight + lineIndex * (tileHeight + gap);
      for (const [column, slot] of line.slots.entries()) {
        if (slot < first || slot > last) {
          continue;
        }
        cells.push({
          slot,
          tile: present.has(slot),
          left: x0 + column * (tileWidth + gap),
          top: lineTop,
          width: tileWidth,
          height: tileHeight,
        });
      }
    }
    const height = nameHeight + unit.lines.length * (tileHeight + gap) - gap;
    rows.push({
      kind: 'period',
      unit: unit.unit,
      top,
      height,
      label: { left: 0, top, width: beside ? nameWidth : width, height: beside ? height : nameHeight },
      cells,
    });
    y += height + rowGap;
  }

  return {
    kind,
    perLine,
    tileWidth,
    tileHeight,
    labelWidth: nameWidth,
    labelHeight: nameHeight,
    rows,
    busiest,
    height: Math.max(0, y - rowGap),
  };
};

/** How full a period is against the busiest one, 0 to 1. */
export const periodDensity = (count: number, busiest: number) =>
  busiest > 0 ? Math.min(1, Math.max(0, count / busiest)) : 0;
