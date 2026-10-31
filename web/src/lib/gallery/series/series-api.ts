import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { curatorCall, CuratorError, curatorPost, type MemoryTrack, type SmartAlbum } from '$lib/utils/curator';

// Local Omarchy layer: Curator's routes for "A memory a day, from the beginning" (curator/api.py, /api/series…), the
// owner's only. The owner keeps several series, each of the whole library or of one smart album, each with its own
// Coming up, day 1, password and family link. A series is Curator's: the plan, the days it has prepared, the skips,
// the people it leaves out and what went out to its family page. The web asks and shows; the one thing it writes to
// Gallery is a family link itself, made and deleted with the owner's session, which Curator then binds or forgets
// (series-state). A memory's key ("event:340", "trip:12#2", "months:2003-05/2003-08") goes in a body or a query, never
// in a path. The calls are utils/curator's, so they share its address, its credentials and its errors (CuratorError:
// Curator's own words, status 0 while it is not answering).

export type SeriesState = 'draft' | 'on' | 'paused' | 'ended';

/** A series as Curator keeps it; `people_without` are Gallery person ids, which Kioku names. `name` is its family
 * page's title. */
export type SeriesRow = {
  id: number;
  name: string;
  state: SeriesState;
  starts_on: string | null;
  people_without: string[];
  created_at: string;
};

/** What a series is made from: the whole library, or one smart album, kept by its Gallery album. `updating`: the
 * album's smart rule still keeps it filled; `gone`: Gallery no longer has the album, so nothing new is planned. The
 * album's name is the owner's alone: these pages show it, the family page never does. */
export type SeriesSource =
  | { kind: 'library' }
  | {
      kind: 'album';
      album_id: string | null;
      smart_album_id: number | null;
      name: string | null;
      updating: boolean;
      gone: boolean;
    };

/** Where a series stands: planning (no family link yet), starts (its link is made, day 1 ahead), live, off (its link
 * was turned off) or ended. */
export type SeriesStatus = 'planning' | 'starts' | 'live' | 'off' | 'ended';

/** A series as every series route gives it now: the row, what it is made from and where it stands. */
export type SeriesCard = SeriesRow & {
  link_id: string | null;
  span_from: string | null;
  span_to: string | null;
  smart_album_id: number | null;
  album_id: string | null;
  source: SeriesSource;
  status: SeriesStatus;
  /** the days its plan still holds, from the last plan (D9's count); null before the first plan */
  remaining: number | null;
  sent_count: number;
  prepared_count: number;
  /** every family link the gateway still keeps a page for: the one there is, and any older one not yet forgotten */
  links: string[];
};

/** A new series: of the whole library, or of a smart album (its photos as the album's rule keeps it filled), with
 * an optional span of days, 'YYYY-MM-DD'. */
export type NewSeries = { smart_album_id?: number; span_from?: string; span_to?: string; name?: string };

/** The title a family page has until the owner gives it one of its own (Curator's). */
export const DEFAULT_TITLE = 'From the beginning';

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
  /** `starts_on` is day 1 once it is set */
  series: SeriesCard;
  /** day 1: provisional (tomorrow) until the family page goes live; while it is live, the next memory's day */
  first_day: string;
  provisional: boolean;
  /** a series job is queued or running: the days are asked for again every few seconds while it is */
  preparing: boolean;
  /** how many days are kept prepared */
  window: number;
  /** day 1 first */
  memories: ComingMemory[];
  skipped: SkippedMemory[];
  /** a family link is bound and day 1 is set */
  live: boolean;
  /** the family link's Gallery id: Gallery holds its key, read with the owner's session for the page's address */
  link_id: string | null;
  /** how many memories have gone out */
  sent_count: number;
  /** the day the story reaches today, once that is 30 days away or less */
  story_ends: string | null;
  /** the next memory waits, as it has not been in Coming up for 3 days */
  waiting_notice: boolean;
};

/** A memory that went out to the family page, or was taken off it again ('withdrawn'). */
export type SentMemory = {
  key: string;
  /** its place in the series: the family page's day number */
  n: number;
  /** the day it went out, 'YYYY-MM-DD' */
  day: string;
  title: string;
  line: string;
  cover: string | null;
  count: number;
  state: 'sent' | 'withdrawn';
};

/** A photo the memory could hold instead, in time order; `picked` when it already does. */
export type SeriesCandidate = SeriesPhoto & { picked: boolean };

export const seriesApi = {
  /** every series, the oldest first */
  list: () => curatorCall<{ series: SeriesCard[] }>('/series'),
  /** one series; Curator answers 404 for one that does not exist (any more) */
  one: (id: number) => curatorCall<{ series: SeriesCard }>(`/series/${id}`),
  /** plans one, of the whole library without `smart_album_id`; a smart album that has a series already opens that
   * one instead (`existing`, no job). Curator refuses a span that ends before it starts in its own words (400). */
  create: (series: NewSeries = {}) =>
    curatorPost<{ series: SeriesCard; existing: boolean; job: number | null }>('/series', series),
  /** its family page's title (`name: ''` gives it Curator's again; Curator refuses one that names someone or gives
   * a day, 400), or who it leaves out */
  update: (id: number, change: { people_without?: string[]; name?: string }) =>
    curatorCall<{ series: SeriesCard; job: number | null }>(`/series/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    }),
  /** the series gone, with its coming days and its family pages' files; Curator answers 409 while Gallery still has
   * one of its links, so they are deleted in Gallery first (series-state) */
  remove: (id: number) => curatorCall<{ deleted: number; forgotten: number }>(`/series/${id}`, { method: 'DELETE' }),
  coming: (id: number) => curatorCall<Coming>(`/series/${id}/coming`),
  skip: (id: number, key: string) => curatorPost<{ ok: true; job: number }>(`/series/${id}/skip`, { key }),
  restore: (id: number, key: string) => curatorPost<{ ok: true; job: number }>(`/series/${id}/restore`, { key }),
  repick: (id: number, key: string) => curatorPost<{ job: number }>(`/series/${id}/repick`, { key }),
  candidates: (id: number, key: string) =>
    curatorCall<{ photos: SeriesCandidate[] }>(`/series/${id}/candidates?${new URLSearchParams({ key })}`),
  swap: (id: number, key: string, out: string, into: string) =>
    curatorPost<{ memory: ComingMemory }>(`/series/${id}/swap`, { key, out, in: into }),
  /** sets day 1, 'YYYY-MM-DD': Curator refuses a past day, or once memories went out */
  dayOne: (id: number, day: string) => curatorPost<{ series: SeriesRow }>(`/series/${id}/day1`, { day }),
  /** the photos a new family link must hold */
  linkPhotos: (id: number) => curatorCall<{ photos: string[] }>(`/series/${id}/link-photos`),
  /** binds the family link the web made; `replaced` is the link it takes over from, still to be turned off. Curator
   * refuses a link another series' family page has (409). */
  bindLink: (id: number, linkId: string, key: string) =>
    curatorPost<{ series: SeriesRow; replaced: string | null }>(`/series/${id}/link`, { linkId, key }),
  /** forgets a family link once Gallery has deleted it (Curator answers 409 while Gallery still has it) */
  forgetLink: (id: number, linkId: string) =>
    curatorCall<{ forgotten: boolean }>(`/series/${id}/link/${encodeURIComponent(linkId)}`, { method: 'DELETE' }),
  /** what went out to the family page, newest first */
  sent: (id: number) => curatorCall<{ memories: SentMemory[] }>(`/series/${id}/sent`),
  /** off the family page and out of its link at once */
  takeOff: (id: number, key: string) => curatorPost<{ ok: true }>(`/series/${id}/takeoff`, { key }),
  putBack: (id: number, key: string) => curatorPost<{ ok: true }>(`/series/${id}/putback`, { key }),
  /** the smart albums a series can be made from, by name */
  smartAlbums: () => curatorCall<SmartAlbum[]>('/smart-albums'),
};

/** A failure as a page's own state keeps it: Curator's, with its status, or one of its own (-1). */
export const asCuratorError = (error: unknown) =>
  error instanceof CuratorError ? error : new CuratorError(error instanceof Error ? error.message : String(error), -1);

/** What went wrong, as Curator's pages say it: its own words, or that it is not answering. */
export const seriesFailure = (error: unknown): string => {
  if (error instanceof CuratorError) {
    return error.status === 0 ? get(t)('ai_inbox_offline_title') : error.message;
  }
  return error instanceof Error ? error.message : String(error);
};
