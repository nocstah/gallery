import type { AssetResponseDto } from '@immich/sdk';
import type { Translations } from 'svelte-i18n';
import type { FilmMedia } from '../../../src/lib/components/memories/film/film-media';
import { daysFromToday } from '../../../src/lib/gallery/series/series-days';
import type { MemoryTrack } from '../../../src/lib/utils/curator';

// Local Omarchy layer: the family page of "A memory a day, from the beginning" (Curator's docs/memory-series-design.md,
// section 4) as the gateway answers it, under /days/<key>: the list of the days that went out, newest first and 14 at
// a time, each day's film, the password, and the media, every address the key's own. Nothing here is cached by the
// page: the gateway asks Gallery afresh for every answer, so a memory taken off or a link turned off goes at once.

/** a day on the list: the day it went out ('YYYY-MM-DD'), its title, line and cover */
export type FamilyListDay = { n: number; day: string; title: string; line: string; cover: string; count: number };

export type SeriesIndex = {
  name: string;
  language: string;
  /** day 1, while nothing has gone out yet */
  first_day: string | null;
  days: FamilyListDay[];
  /** earlier days are there to load */
  more: boolean;
};

/** a photo or clip as the gateway projects it: no checksum, file name or exact time, its date a month */
export type FamilyAsset = {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  width: number;
  height: number;
  duration: string | null;
  thumbhash: string | null;
  localDateTime: string;
};

export type SeriesDay = {
  n: number;
  day: string;
  title: string;
  line: string;
  cover: string;
  focus: Record<string, [number, number]>;
  dates: 'month';
  assets: FamilyAsset[];
  tracks: MemoryTrack[];
  photoSeconds: number;
  language: string;
};

/** an answer: its data, or that the page wants its password, or that it has ended (or this day is off it) */
export type FamilyAnswer<T> = { data: T } | { state: 'password' | 'ended' };

/** The gateway's routes for one key (already encoded for a path, as the address has it). */
export const familyPage = (key: string) => {
  const base = `/days/${key}`;
  const read = async <T>(path: string): Promise<FamilyAnswer<T>> => {
    const response = await fetch(`${base}${path}`, { cache: 'no-store' });
    if (response.status === 401) {
      return { state: 'password' };
    }
    if (response.status === 404 || response.status === 410) {
      return { state: 'ended' };
    }
    if (!response.ok) {
      throw new Error(`The family page answered ${response.status}`);
    }
    return { data: (await response.json()) as T };
  };
  const asset = (n: number, id: string) => `${base}/day/${n}/assets/${encodeURIComponent(id)}`;

  return {
    /** the newest 14 days, or the 14 before day `before` */
    index: (before?: number) => read<SeriesIndex>(before === undefined ? '/index' : `/index?before=${before}`),
    day: (n: number) => read<SeriesDay>(`/day/${n}`),
    /** the password, once per device: the gateway keeps its cookie; false when it is not the one */
    login: async (password: string): Promise<boolean> => {
      const response = await fetch(`${base}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.status === 401) {
        return false;
      }
      if (!response.ok) {
        throw new Error(`The family page answered ${response.status}`);
      }
      return true;
    },
    /** a photo of a day: Gallery's thumbnail (640 px) for the list, its preview (2160 px) where it is shown large */
    photo: (n: number, id: string, size: 'thumbnail' | 'preview') => `${asset(n, id)}/thumbnail?size=${size}`,
    /** what a day's film and its grid show, from that day's routes; its songs play from their own address */
    media: (n: number, alt: FilmMedia['alt']): FilmMedia => ({
      preview: (id) => `${asset(n, id)}/thumbnail?size=preview`,
      thumbnail: (id) => `${asset(n, id)}/thumbnail?size=thumbnail`,
      video: (id) => `${asset(n, id)}/video`,
      music: (src) => src,
      alt,
    }),
  };
};

export type FamilyPage = ReturnType<typeof familyPage>;

/** The key in the page's address, /days/<key>/, encoded for a path as the gateway's routes take it. */
export const keyOf = (pathname: string): string => {
  try {
    return encodeURIComponent(decodeURIComponent(pathname.split('/', 3)[2] ?? ''));
  } catch {
    return '';
  }
};

/** A clip's length as the film reads it, in milliseconds, from Gallery's "H:MM:SS.ffffff" or a count of milliseconds;
 * null when there is none. */
export const durationMs = (duration: string | number | null | undefined): number | null => {
  if (typeof duration === 'number') {
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }
  const text = duration?.trim();
  if (!text) {
    return null;
  }
  const clock = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(text);
  const ms = clock
    ? ((Number(clock[1]) * 60 + Number(clock[2])) * 60 + Number(clock[3])) * 1000
    : /^\d+(?:\.\d+)?$/.test(text)
      ? Number(text)
      : NaN;
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null;
};

/** A day's photos and clips as the film takes them: the projection's own fields and nothing more (no checksum, so the
 * film's copies check goes by id). */
export const filmAssets = (day: SeriesDay): AssetResponseDto[] =>
  day.assets.map(
    (asset) =>
      ({
        id: asset.id,
        type: asset.type,
        width: asset.width,
        height: asset.height,
        duration: durationMs(asset.duration),
        thumbhash: asset.thumbhash,
        localDateTime: asset.localDateTime,
      }) as unknown as AssetResponseDto,
  );

/** The i18n key of a day's own word on the family's calendar: today (or later, where the reader is behind the house's
 * clock), yesterday; none for an earlier day, which the date says. */
export const familyDayKey = (day: string, now = new Date()): Translations | undefined => {
  const from = daysFromToday(day, now);
  if (from >= 0) {
    return 'memory_series_today';
  }
  return from === -1 ? 'memory_series_yesterday' : undefined;
};
