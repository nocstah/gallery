import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { FilmMedia } from '$lib/components/memories/film/film-media';
import { dayFromToday } from '@test-data/factories/series-factory';
import SeriesFamilyPage from '../../../../memory-player/src/series/SeriesFamilyPage.svelte';
import type { FamilyListDay, SeriesDay, SeriesIndex } from '../../../../memory-player/src/series/series-family';
import { seen } from './memory-film.test-wrapper.svelte';
import { seriesDate, seriesLongDate } from './series-days';

// Local Omarchy layer: the family page of From the beginning (memory-player/src/series), against a stand-in gateway:
// the series' name and line, the newest memory large and the earlier days as rows, newest first, with the days said
// as the family's calendar says them; Earlier; Play, the film from the day's own routes, month-only dates and no story,
// the day before following when it ends; All photos, a photo opening the film from it and a clip playing whole with
// its sound; before day 1; the password; an ended page; a list that would not load. A stand-in film keeps what it was
// given. Every word of the page's own is an i18n key ('dev' locale). Synthetic titles, places and ids only.

vi.mock('$lib/components/memories/film/MemoryFilm.svelte', async () => {
  const { default: stub } = await import('./memory-film.test-wrapper.svelte');
  return { default: stub };
});

const KEY = 'key-1';

const listDay = (n: number, ago: number, title: string, line = 'March 2018'): FamilyListDay => ({
  n,
  day: dayFromToday(-ago),
  title,
  line,
  cover: `cover-${n}`,
  count: 12,
});

const seriesDay = (n: number, overrides: Partial<SeriesDay> = {}): SeriesDay => ({
  n,
  day: dayFromToday(16 - n),
  title: `Day ${n} in Riverton`,
  line: 'Riverton · March 2018',
  cover: 'photo-c',
  focus: { 'photo-a': [0.5, 0.4] },
  dates: 'month',
  assets: [
    {
      id: 'photo-a',
      type: 'IMAGE',
      width: 4000,
      height: 3000,
      duration: null,
      thumbhash: null,
      localDateTime: '2018-03-01T00:00:00.000Z',
    },
    {
      id: 'clip-b',
      type: 'VIDEO',
      width: 1920,
      height: 1080,
      duration: '0:00:12.500000',
      thumbhash: null,
      localDateTime: '2018-03-01T00:00:00.000Z',
    },
    {
      id: 'photo-c',
      type: 'IMAGE',
      width: 3000,
      height: 4000,
      duration: null,
      thumbhash: null,
      localDateTime: '2018-03-01T00:00:00.000Z',
    },
  ],
  tracks: [
    {
      id: 'track-1',
      title: 'Song for Riverton',
      artist: 'Rowan',
      duration: 184,
      bpm: 92,
      src: `/days/${KEY}/music/track-1`,
    },
  ],
  photoSeconds: 5,
  language: 'en',
  ...overrides,
});

type Asked = { method: string; path: string; body?: unknown; cache?: RequestCache };
let asked: Asked[];
let pages: Record<string, SeriesIndex>;
let indexStatus: number;
let dayStatus: Record<number, number>;
let needsPassword: boolean;

const answer = ({ method, path, body }: Asked): Response => {
  if (path === `/days/${KEY}/login` && method === 'POST') {
    if ((body as { password?: string }).password !== 'riverton') {
      return Response.json({ message: 'Invalid password' }, { status: 401 });
    }
    needsPassword = false;
    return new Response(null, { status: 204 });
  }
  if (needsPassword) {
    return Response.json({ message: 'Password required' }, { status: 401 });
  }
  const index = /^\/days\/key-1\/index(?:\?before=(\d+))?$/.exec(path);
  if (index) {
    return indexStatus === 200
      ? Response.json(pages[index[1] ?? 'first'])
      : Response.json({ message: 'No' }, { status: indexStatus });
  }
  const day = /^\/days\/key-1\/day\/(\d+)$/.exec(path);
  if (day) {
    const n = Number(day[1]);
    return (dayStatus[n] ?? 200) === 200
      ? Response.json(seriesDay(n))
      : Response.json({ message: 'Gone' }, { status: dayStatus[n] });
  }
  return Response.json({ message: 'Not Found' }, { status: 404 });
};

beforeEach(() => {
  asked = [];
  indexStatus = 200;
  dayStatus = {};
  needsPassword = false;
  pages = {
    first: {
      name: 'From the beginning',
      language: 'en',
      first_day: dayFromToday(-15),
      days: [
        listDay(16, 0, 'Riverton harbour', 'Riverton · July 2018'),
        listDay(15, 1, 'The lake house'),
        listDay(14, 2, 'Snow in Riverton'),
      ],
      more: true,
    },
    '14': {
      name: 'From the beginning',
      language: 'en',
      first_day: dayFromToday(-15),
      days: [listDay(13, 3, 'The old garden'), listDay(12, 4, 'May 2003')],
      more: false,
    },
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input), location.origin);
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      cache: init?.cache,
    };
    asked.push(request);
    return Promise.resolve(answer(request));
  });
  seen.props = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const show = () => render(SeriesFamilyPage, { props: { linkKey: KEY, reader: 'en-US' } });
const loaded = async () => await screen.findByTestId('series-family-page');
const film = () => seen.props as Record<string, unknown> & { media: FilmMedia };

describe('the family page', () => {
  it('names the series, then shows the newest memory large and the earlier days as rows, newest first', async () => {
    show();
    const page = await loaded();
    expect(within(page).getByRole('heading', { level: 1, name: 'From the beginning' })).toBeInTheDocument();
    expect(page).toHaveTextContent('memory_series_page_line');
    expect(document.title).toBe('From the beginning');
    expect(asked[0]).toEqual({ method: 'GET', path: `/days/${KEY}/index`, body: undefined, cache: 'no-store' });

    const newest = screen.getByTestId('series-family-newest');
    expect(newest).toHaveAttribute('data-n', '16');
    expect(within(newest).getByRole('heading', { level: 2, name: 'Riverton harbour' })).toBeInTheDocument();
    expect(within(newest).getByTestId('series-family-when')).toHaveTextContent('memory_series_today');
    expect(newest).toHaveTextContent('Riverton · July 2018');
    expect(newest.querySelector('img')).toHaveAttribute(
      'src',
      `/days/${KEY}/day/16/assets/cover-16/thumbnail?size=preview`,
    );
    expect(within(newest).getByRole('button', { name: 'memory_series_play' })).toBeInTheDocument();
    expect(within(newest).getByRole('button', { name: 'all_photos' })).toBeInTheDocument();

    const rows = screen.getAllByTestId('series-family-day');
    expect(rows.map((row) => row.dataset.n)).toEqual(['15', '14']);
    expect(within(rows[0]).getByTestId('series-family-when')).toHaveTextContent('memory_series_yesterday');
    expect(within(rows[1]).getByTestId('series-family-when')).toHaveTextContent(seriesDate(dayFromToday(-2), 'en-US'));
    expect(within(rows[1]).getByRole('heading', { level: 3, name: 'Snow in Riverton' })).toBeInTheDocument();
    expect(rows[1].querySelector('img')).toHaveAttribute(
      'src',
      `/days/${KEY}/day/14/assets/cover-14/thumbnail?size=thumbnail`,
    );
  });

  it('loads the days before with Earlier, until there are none', async () => {
    show();
    await loaded();
    await fireEvent.click(screen.getByRole('button', { name: 'memory_series_earlier' }));

    await waitFor(() => expect(screen.getAllByTestId('series-family-day')).toHaveLength(4));
    expect(asked.at(-1)).toMatchObject({ path: `/days/${KEY}/index?before=14`, cache: 'no-store' });
    expect(screen.getAllByTestId('series-family-day').map((row) => row.dataset.n)).toEqual(['15', '14', '13', '12']);
    expect(screen.queryByRole('button', { name: 'memory_series_earlier' })).not.toBeInTheDocument();
  });

  it('plays a day’s film from its own routes, with month-only dates and no story, its songs from their address', async () => {
    show();
    await loaded();
    const play = within(screen.getByTestId('series-family-newest')).getByRole('button', { name: 'memory_series_play' });
    play.focus();
    await fireEvent.click(play);

    expect(await screen.findByTestId('memory-film')).toHaveAttribute('data-memory', 'series-day-16');
    expect(asked.at(-1)).toMatchObject({ path: `/days/${KEY}/day/16`, cache: 'no-store' });
    expect(film()).toMatchObject({
      assetId: 'photo-a',
      active: true,
      name: 'Day 16 in Riverton',
      title: 'Day 16 in Riverton',
      line: 'Riverton · March 2018',
      cover: 'photo-c',
      focus: { 'photo-a': [0.5, 0.4] },
      settled: true,
      story: null,
      dates: 'month',
      photoSeconds: 5,
      language: 'en',
      tracks: [expect.objectContaining({ id: 'track-1', src: `/days/${KEY}/music/track-1` })],
    });
    const { assets } = film().memory as { assets: { id: string; type: string; duration: number | null }[] };
    expect(assets.map(({ id, type, duration }) => ({ id, type, duration }))).toEqual([
      { id: 'photo-a', type: 'IMAGE', duration: null },
      { id: 'clip-b', type: 'VIDEO', duration: 12_500 },
      { id: 'photo-c', type: 'IMAGE', duration: null },
    ]);
    const { media } = film();
    expect(media.preview('photo-a')).toBe(`/days/${KEY}/day/16/assets/photo-a/thumbnail?size=preview`);
    expect(media.thumbnail('photo-a')).toBe(`/days/${KEY}/day/16/assets/photo-a/thumbnail?size=thumbnail`);
    expect(media.video('clip-b')).toBe(`/days/${KEY}/day/16/assets/clip-b/video`);
    expect(media.music(`/days/${KEY}/music/track-1`)).toBe(`/days/${KEY}/music/track-1`);
    // the page under the film holds still and takes no keys
    expect(screen.getByTestId('series-family-page')).toHaveAttribute('inert');

    await fireEvent.click(screen.getByTestId('memory-film-close'));
    await waitFor(() => expect(screen.queryByTestId('memory-film')).not.toBeInTheDocument());
    expect(screen.getByTestId('series-family-page')).not.toHaveAttribute('inert');
    // the button that opened the film has the focus again
    await waitFor(() => expect(play).toHaveFocus());
  });

  it('has the day before follow when a film ends, as Room chains films; the last day loaded ends on its own', async () => {
    show();
    await loaded();
    await fireEvent.click(
      within(screen.getByTestId('series-family-newest')).getByRole('button', { name: 'memory_series_play' }),
    );
    await screen.findByTestId('memory-film');
    expect(film().onNextFilm).toBeTypeOf('function');

    await (film().onNextFilm as () => Promise<void>)();
    await waitFor(() => expect(screen.getByTestId('memory-film')).toHaveAttribute('data-memory', 'series-day-15'));
    expect(asked.at(-1)).toMatchObject({ path: `/days/${KEY}/day/15` });
    expect(film().onNextFilm).toBeTypeOf('function');

    await (film().onNextFilm as () => Promise<void>)();
    await waitFor(() => expect(screen.getByTestId('memory-film')).toHaveAttribute('data-memory', 'series-day-14'));
    expect(film().onNextFilm).toBeUndefined();
  });

  it('shows All photos: a photo opens the film from it, a clip plays whole with its sound', async () => {
    show();
    await loaded();
    await fireEvent.click(
      within(screen.getByTestId('series-family-newest')).getByRole('button', { name: 'all_photos' }),
    );

    const grid = await screen.findByTestId('series-family-grid');
    expect(within(grid).getByRole('heading', { name: 'Day 16 in Riverton' })).toBeInTheDocument();
    const tiles = within(grid).getAllByTestId('series-family-tile');
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'memory_series_photo',
      'memory_series_clip',
      'memory_series_photo',
    ]);
    expect(tiles[0].querySelector('img')).toHaveAttribute(
      'src',
      `/days/${KEY}/day/16/assets/photo-a/thumbnail?size=preview`,
    );
    expect(tiles[1]).toHaveAttribute('data-video');
    expect(screen.queryByTestId('memory-film')).not.toBeInTheDocument();

    // a clip: the browser's own player, with its sound, from the clip's route
    await fireEvent.click(tiles[1]);
    const clip = await screen.findByTestId('series-family-clip');
    const video = clip.querySelector('video')!;
    expect(video).toHaveAttribute('src', `/days/${KEY}/day/16/assets/clip-b/video`);
    expect(video).toHaveAttribute('controls');
    expect(video.muted).toBe(false);
    await fireEvent.click(within(clip).getByRole('button', { name: 'close' }));
    await waitFor(() => expect(screen.queryByTestId('series-family-clip')).not.toBeInTheDocument());

    // a photo: the film from it, and back to the grid from the film
    await fireEvent.click(tiles[2]);
    await screen.findByTestId('memory-film');
    expect(film()).toMatchObject({ assetId: 'photo-c', dates: 'month' });
    expect(grid).not.toBeVisible();
    await fireEvent.click(screen.getByTestId('memory-film-close'));
    await waitFor(() => expect(screen.queryByTestId('memory-film')).not.toBeInTheDocument());
    expect(screen.getByTestId('series-family-grid')).toBeVisible();

    await fireEvent.click(within(screen.getByTestId('series-family-grid')).getByRole('button', { name: 'back' }));
    await waitFor(() => expect(screen.queryByTestId('series-family-grid')).not.toBeInTheDocument());
    // one day asked for, once: the grid and the film shared it
    expect(asked.filter(({ path }) => path.includes('/day/'))).toHaveLength(1);
  });

  it('opens All photos from the film and goes back to the film', async () => {
    show();
    await loaded();
    await fireEvent.click(
      within(screen.getByTestId('series-family-newest')).getByRole('button', { name: 'memory_series_play' }),
    );
    await screen.findByTestId('memory-film');
    (film().onAllPhotos as () => void)();

    const grid = await screen.findByTestId('series-family-grid');
    await waitFor(() => expect(film().active).toBe(false));
    await fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('series-family-grid')).not.toBeInTheDocument());
    expect(grid).not.toBeInTheDocument();
    expect(film().active).toBe(true);
  });

  it('asks for the list again when a day is no longer there (taken off, or the page ended)', async () => {
    dayStatus[15] = 404;
    show();
    await loaded();
    const before = asked.filter(({ path }) => path.endsWith('/index')).length;
    await fireEvent.click(
      within(screen.getAllByTestId('series-family-day')[0]).getByRole('button', { name: 'memory_series_play' }),
    );
    await waitFor(() => expect(asked.filter(({ path }) => path.endsWith('/index')).length).toBe(before + 1));
    expect(screen.queryByTestId('memory-film')).not.toBeInTheDocument();
  });

  it('says so when a day would not load, and keeps the list', async () => {
    dayStatus[16] = 500;
    show();
    await loaded();
    await fireEvent.click(
      within(screen.getByTestId('series-family-newest')).getByRole('button', { name: 'memory_series_play' }),
    );
    // said under the day's own buttons, where the finger is
    const newest = screen.getByTestId('series-family-newest');
    expect(await within(newest).findByRole('alert')).toHaveTextContent('memory_share_load_failed');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('the family page before day 1', () => {
  it('says when the first memory comes', async () => {
    pages.first = { ...pages.first, days: [], first_day: dayFromToday(3), more: false };
    show();
    await loaded();
    expect(screen.getByTestId('series-family-first')).toHaveTextContent('memory_series_first_on');
    expect(screen.queryByTestId('series-family-newest')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // the date in full in the reader's language
    expect(seriesLongDate(dayFromToday(3), 'en-US')).toMatch(/^[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}(, \d{4})?$/);
  });
});

describe('the family page behind its password, ended, or not loading', () => {
  it('asks for the password once, then shows the page', async () => {
    needsPassword = true;
    show();
    const access = await screen.findByTestId('series-family-access');
    expect(access).toHaveAttribute('data-state', 'password');
    expect(within(access).getByRole('heading', { name: 'memory_share_password_title' })).toBeInTheDocument();

    const field = within(access).getByLabelText('password');
    await fireEvent.input(field, { target: { value: 'harbour' } });
    await fireEvent.click(within(access).getByRole('button', { name: 'memory_share_unlock' }));
    expect(await within(access).findByRole('alert')).toHaveTextContent('memory_share_password_failed');

    await fireEvent.input(field, { target: { value: 'riverton' } });
    await fireEvent.click(within(access).getByRole('button', { name: 'memory_share_unlock' }));
    await loaded();
    expect(asked.filter(({ path }) => path.endsWith('/login')).map(({ method, body }) => ({ method, body }))).toEqual([
      { method: 'POST', body: { password: 'harbour' } },
      { method: 'POST', body: { password: 'riverton' } },
    ]);
  });

  it.each([404, 410])('says the page has ended when the gateway answers %i', async (status) => {
    indexStatus = status;
    show();
    const access = await screen.findByTestId('series-family-access');
    await waitFor(() => expect(access).toHaveAttribute('data-state', 'ended'));
    expect(within(access).getByRole('heading', { name: 'memory_share_unavailable_title' })).toBeInTheDocument();
    expect(access).toHaveTextContent('memory_share_unavailable');
    expect(within(access).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says the list could not load, and tries again', async () => {
    indexStatus = 502;
    show();
    const access = await screen.findByTestId('series-family-access');
    expect(await within(access).findByRole('alert')).toHaveTextContent('memory_share_load_failed');

    indexStatus = 200;
    await fireEvent.click(within(access).getByRole('button', { name: 'retry' }));
    await loaded();
  });
});

describe('the family page words', () => {
  it('takes every word of its own from i18n keys', async () => {
    show();
    await loaded();
    const words = screen.getAllByRole('button').map((button) => button.textContent!.trim());
    expect(new Set(words)).toEqual(new Set(['memory_series_play', 'all_photos', 'memory_series_earlier']));
  });
});
