// Local Omarchy layer: a name for a new album made from photos (the N key, the sidebar's New album drop), from where
// and when they were taken, until Curator names albums itself: "Phuket · 12–15 Mar 2023", "Bangkok, Phuket · Mar – Apr
// 2023", "Thailand · 2019–2020", or only the dates when no photo has a place. The dates are the locale's own ranges
// (Intl's formatRange), as precise as the span allows: days within a month, months within a year, else years.
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';

export type NamedAsset = Pick<TimelineAsset, 'localDateTime' | 'city' | 'country'>;

const DAY = 24 * 60 * 60 * 1000;

/** The values, most frequent first (ties keep their first appearance). */
const byFrequency = (values: (string | null | undefined)[]) => {
  const counts = new Map<string, number>();
  for (const value of values) {
    const name = value?.trim();
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
};

/** One city, or two; else one country, or two; else the country most of them were taken in. */
export const placeOf = (assets: NamedAsset[]) => {
  const cities = byFrequency(assets.map((asset) => asset.city));
  if (cities.length > 0 && cities.length <= 2) {
    return cities.join(', ');
  }
  const countries = byFrequency(assets.map((asset) => asset.country));
  if (countries.length > 0 && countries.length <= 2) {
    return countries.join(', ');
  }
  return countries[0];
};

const dayOf = ({ localDateTime: { year, month, day } }: NamedAsset) => Date.UTC(year, month - 1, day);

export const datesOf = (assets: NamedAsset[], locale: string) => {
  if (assets.length === 0) {
    return '';
  }
  const days = assets.map((asset) => dayOf(asset));
  const first = new Date(Math.min(...days));
  const last = new Date(Math.max(...days));
  const span = (last.getTime() - first.getTime()) / DAY;
  const sameYear = first.getUTCFullYear() === last.getUTCFullYear();
  const options: Intl.DateTimeFormatOptions =
    span <= 31
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : sameYear || span <= 366
        ? { month: 'short', year: 'numeric' }
        : { year: 'numeric' };
  const format = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  return first.getTime() === last.getTime() ? format.format(first) : format.formatRange(first, last);
};

/** "Place · dates", or the dates alone. */
export const suggestAlbumName = (assets: NamedAsset[], locale: string) => {
  const place = placeOf(assets);
  const dates = datesOf(assets, locale);
  return [place, dates].filter(Boolean).join(' · ');
};
