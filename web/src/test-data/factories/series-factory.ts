import type {
  Coming,
  ComingMemory,
  SentMemory,
  SeriesCard,
  SeriesRow,
  SeriesSource,
  SkippedMemory,
} from '$lib/gallery/series/series-api';
import { isoDay } from '$lib/gallery/series/series-days';
import type { SmartAlbum } from '$lib/utils/curator';

// Local Omarchy layer: a series as Curator's routes give it (gallery/series), for its specs. Synthetic names, places and
// ids only: this branch is public.

/** a day from today on this computer's calendar, as Curator writes it */
export const dayFromToday = (days: number, now = new Date()) =>
  isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));

export const seriesRow = (overrides: Partial<SeriesRow> = {}): SeriesRow => ({
  id: 7,
  name: 'From the beginning',
  state: 'draft',
  starts_on: null,
  people_without: [],
  created_at: '2026-10-30T09:00:00Z',
  ...overrides,
});

/** a series as every series route gives it: the row, what it is made from and where it stands (of the whole library,
 * planning, no family link yet, unless told otherwise) */
export const seriesCard = (overrides: Partial<SeriesCard> = {}): SeriesCard => ({
  ...seriesRow(),
  link_id: null,
  span_from: null,
  span_to: null,
  smart_album_id: null,
  album_id: null,
  source: { kind: 'library' },
  status: 'planning',
  remaining: null,
  sent_count: 0,
  prepared_count: 0,
  links: [],
  ...overrides,
});

/** what an album's series is made from */
export const albumSource = (overrides: Partial<Extract<SeriesSource, { kind: 'album' }>> = {}): SeriesSource => ({
  kind: 'album',
  album_id: 'album-riverton',
  smart_album_id: 4,
  name: 'Riverton walks',
  updating: true,
  gone: false,
  ...overrides,
});

/** a smart album as Curator lists it */
export const smartAlbum = (overrides: Partial<SmartAlbum> = {}): SmartAlbum => ({
  id: 4,
  album_id: 'album-riverton',
  name: 'Riverton walks',
  rule: { search: {}, strictness: 'normal', filters: {} },
  count: 1204,
  excluded: 0,
  synced_at: null,
  ...overrides,
});

export const comingMemory = (overrides: Partial<ComingMemory> = {}): ComingMemory => ({
  key: 'event:340',
  day: dayFromToday(1),
  kind: 'event',
  title: 'Riverton harbour',
  line: 'Riverton · March 2018',
  photos: [
    { id: 'photo-1', video: false, favourite: true },
    { id: 'photo-2', video: true, favourite: false },
    { id: 'photo-3', video: false, favourite: false },
  ],
  cover: 'photo-3',
  focus: { 'photo-1': [0.5, 0.4] },
  tracks: [
    { id: 'track-1', title: 'Song for Riverton', artist: 'Rowan', duration: 184, bpm: 92, src: '/api/music/track-1' },
  ],
  count: 40,
  picked_by: 'curator',
  note: null,
  ...overrides,
});

export const skippedMemory = (overrides: Partial<SkippedMemory> = {}): SkippedMemory => ({
  key: 'months:2003-05/2003-08',
  kind: 'month',
  title: 'May – August 2003',
  line: '',
  cover: 'photo-9',
  count: 12,
  ...overrides,
});

export const comingDays = (overrides: Partial<Coming> = {}): Coming => ({
  series: seriesCard(),
  first_day: dayFromToday(1),
  provisional: true,
  preparing: false,
  window: 10,
  memories: [
    comingMemory(),
    comingMemory({
      key: 'trip:12#2',
      day: dayFromToday(2),
      kind: 'trip',
      title: 'The lake house',
      line: '',
      photos: [
        { id: 'photo-4', video: false, favourite: false },
        { id: 'photo-5', video: false, favourite: false },
      ],
      cover: 'photo-4',
      tracks: [],
      picked_by: 'owner',
      note: '2 photos went to the trash; 9 left',
    }),
  ],
  skipped: [],
  live: false,
  link_id: null,
  sent_count: 0,
  story_ends: null,
  waiting_notice: false,
  ...overrides,
});

/** a memory that went out to the family page */
export const sentMemory = (overrides: Partial<SentMemory> = {}): SentMemory => ({
  key: 'trip:8',
  n: 2,
  day: dayFromToday(-1),
  title: 'Riverton in the snow',
  line: 'Riverton · January 2004',
  cover: 'photo-8',
  count: 14,
  state: 'sent',
  ...overrides,
});
