import type { Coming, ComingMemory, SeriesRow, SkippedMemory } from '$lib/gallery/series/series-api';
import { isoDay } from '$lib/gallery/series/series-days';

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
  series: seriesRow(),
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
  ...overrides,
});
