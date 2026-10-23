export interface YearData {
  year: number;
  count: number;
  volumePercent: number;
}

export interface MonthData {
  month: number;
  label: string;
  count: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function aggregateYears(buckets: Array<{ timeBucket: string; count: number }>): YearData[] {
  const yearMap = new Map<number, number>();
  for (const b of buckets) {
    const year = new Date(b.timeBucket).getUTCFullYear();
    yearMap.set(year, (yearMap.get(year) ?? 0) + b.count);
  }
  const maxCount = Math.max(...yearMap.values(), 1);
  // Local Omarchy layer: newest first, as the year strip, the Years overview and every other list of years read (the
  // owner's "newest first everywhere", 2026-10-23); the rail alone had run from the oldest year
  return [...yearMap]
    .sort(([a], [b]) => b - a)
    .map(([year, count]) => ({
      year,
      count,
      volumePercent: Math.round((count / maxCount) * 100),
    }));
}

export function getMonthsForYear(buckets: Array<{ timeBucket: string; count: number }>, year: number): MonthData[] {
  const monthMap = new Map<number, number>();
  for (const b of buckets) {
    const d = new Date(b.timeBucket);
    // eslint-disable-next-line unicorn/prefer-continue
    if (d.getUTCFullYear() === year) {
      const month = d.getUTCMonth() + 1;
      monthMap.set(month, (monthMap.get(month) ?? 0) + b.count);
    }
  }
  return MONTH_LABELS.map((label, i) => ({
    month: i + 1,
    label,
    count: monthMap.get(i + 1) ?? 0,
  }));
}
