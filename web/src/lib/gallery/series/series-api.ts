import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { curatorCall, CuratorError, curatorPost, type MemoryTrack } from '$lib/utils/curator';

// Local Omarchy layer: Curator's routes for "A memory a day, from the beginning" (curator/api.py, /api/series…), the
// owner's only. A series is Curator's: the plan, the days it has prepared, the skips and the people it leaves out. The
// web asks and shows; it writes nothing to Gallery. A memory's key ("event:340", "trip:12#2", "months:2003-05/2003-08")
// goes in a body or a query, never in a path. The calls are utils/curator's, so they share its address, its
// credentials and its errors (CuratorError: Curator's own words, status 0 while it is not answering).

export type SeriesState = 'draft' | 'on' | 'paused' | 'ended';

/** A series as Curator keeps it; `people_without` are Gallery person ids, which Kioku names. */
export type SeriesRow = {
  id: number;
  name: string;
  state: SeriesState;
  starts_on: string | null;
  people_without: string[];
  created_at: string;
};

/** A photo or clip of a memory, in film order. */
export type SeriesPhoto = { id: string; video: boolean; favourite: boolean };

export type ComingMemory = {
  key: string;
  /** its day, 'YYYY-MM-DD' */
  day: string;
  kind: 'prelude' | 'trip' | 'event' | 'month';
  /** the title and the line as the family page will show them (the line may be '') */
  title: string;
  line: string;
  photos: SeriesPhoto[];
  cover: string | null;
  /** where the faces are in each photo (normalised centres), for the film's drift */
  focus: Record<string, [number, number]>;
  tracks: MemoryTrack[];
  /** how many photos and clips it was chosen from */
  count: number;
  picked_by: 'curator' | 'owner';
  /** what changed since it was prepared, in plain words */
  note: string | null;
};

export type SkippedMemory = {
  key: string;
  kind: string;
  title: string;
  line: string;
  cover: string | null;
  count: number;
};

export type Coming = {
  series: SeriesRow;
  /** day 1: provisional (tomorrow) until the family page goes live */
  first_day: string;
  provisional: boolean;
  /** a series job is queued or running: the days are asked for again every few seconds while it is */
  preparing: boolean;
  /** how many days are kept prepared */
  window: number;
  /** day 1 first */
  memories: ComingMemory[];
  skipped: SkippedMemory[];
};

/** A photo the memory could hold instead, in time order; `picked` when it already does. */
export type SeriesCandidate = SeriesPhoto & { picked: boolean };

export const seriesApi = {
  /** the series (none or one) */
  list: () => curatorCall<{ series: SeriesRow[] }>('/series'),
  /** plans one (Curator's name for it without `name`); Curator answers 409 while one exists */
  create: (name?: string) => curatorPost<{ series: SeriesRow; job: number }>('/series', name ? { name } : {}),
  update: (id: number, change: { people_without?: string[]; name?: string }) =>
    curatorCall<{ series: SeriesRow; job: number | null }>(`/series/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    }),
  coming: (id: number) => curatorCall<Coming>(`/series/${id}/coming`),
  skip: (id: number, key: string) => curatorPost<{ ok: true; job: number }>(`/series/${id}/skip`, { key }),
  restore: (id: number, key: string) => curatorPost<{ ok: true; job: number }>(`/series/${id}/restore`, { key }),
  repick: (id: number, key: string) => curatorPost<{ job: number }>(`/series/${id}/repick`, { key }),
  candidates: (id: number, key: string) =>
    curatorCall<{ photos: SeriesCandidate[] }>(`/series/${id}/candidates?${new URLSearchParams({ key })}`),
  swap: (id: number, key: string, out: string, into: string) =>
    curatorPost<{ memory: ComingMemory }>(`/series/${id}/swap`, { key, out, in: into }),
};

/** What went wrong, as Curator's pages say it: its own words, or that it is not answering. */
export const seriesFailure = (error: unknown): string => {
  if (error instanceof CuratorError) {
    return error.status === 0 ? get(t)('ai_inbox_offline_title') : error.message;
  }
  return error instanceof Error ? error.message : String(error);
};
