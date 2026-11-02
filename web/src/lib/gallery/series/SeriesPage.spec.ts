import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import PeoplePickerModal from '$lib/modals/PeoplePickerModal.svelte';
import {
  albumSource,
  comingDays,
  comingMemory,
  dayFromToday,
  seriesCard,
  skippedMemory,
} from '@test-data/factories/series-factory';
import SeriesPage from './SeriesPage.svelte';
import SeriesSongSheet from './SeriesSongSheet.svelte';
import SeriesSwapSheet from './SeriesSwapSheet.svelte';
import { seen } from './memory-film.test-seen';
import type { Coming, SeriesCard } from './series-api';
import { seriesDate } from './series-days';
import { POLL_MS } from './series-state.svelte';

// Local Omarchy layer: one series of "From the beginning" against a stand-in Curator (gallery/series): its head (what
// it is made from, its span, the way back), a series that is gone, the coming days as the family will see them, the
// four buttons of a day and Put back, each sending the memory's key in the body, the swap sheet's answer in its row,
// who is left out, and the days asked for again while Curator prepares them, and never once the page has closed.
// Every word is an i18n key (the specs render the 'dev' locale, which shows keys). Synthetic names, places and ids only.

const mocks = vi.hoisted(() => ({
  auth: {
    authenticated: true,
    isSharedLink: false,
    user: { id: 'owner-id', isAdmin: true },
    params: {},
    preferences: { memories: { enabled: true, duration: 6 } },
  },
  show: vi.fn(),
  showDialog: vi.fn(),
  getAssetInfo: vi.fn(),
  getPerson: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: stub } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: stub };
});
vi.mock('$lib/components/memories/film/MemoryFilm.svelte', async () => {
  const { default: stub } = await import('./memory-film.test-wrapper.svelte');
  return { default: stub };
});
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: mocks.show, showDialog: mocks.showDialog },
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getAssetInfo: mocks.getAssetInfo,
  getPerson: mocks.getPerson,
}));

type Asked = { method: string; path: string; body?: Record<string, unknown> };
let asked: Asked[];
let coming: Coming | undefined;
let failWith: Response | 'offline' | undefined;

const PEOPLE: Record<string, string> = { 'person-anna': 'Anna', 'person-ben': 'Ben' };

const answer = ({ method, path, body }: Asked): Response => {
  if (path === '/api/series/7/coming') {
    return coming ? Response.json(coming) : Response.json({ detail: 'No such series' }, { status: 404 });
  }
  if (path === '/api/series/7' && method === 'PATCH' && coming) {
    const saved: SeriesCard = { ...coming.series, ...body };
    coming = { ...coming, series: saved };
    return Response.json({ series: saved, job: 12 });
  }
  if (path === '/api/series/7/skip' || path === '/api/series/7/restore') {
    return Response.json({ ok: true, job: 13 });
  }
  if (path === '/api/series/7/repick') {
    return Response.json({ job: 14 });
  }
  return Response.json({ detail: 'Not Found' }, { status: 404 });
};

beforeEach(() => {
  asked = [];
  failWith = undefined;
  coming = comingDays();
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    asked.push(request);
    if (failWith === 'offline') {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(failWith ?? answer(request));
  });
  mocks.getPerson.mockImplementation(({ id }: { id: string }) =>
    Promise.resolve({ id, name: PEOPLE[id] ?? '', updatedAt: '2026-10-01T00:00:00Z' }),
  );
  mocks.getAssetInfo.mockImplementation(({ id }: { id: string }) => Promise.resolve({ id, type: 'IMAGE' }));
  mocks.showDialog.mockResolvedValue(true);
  mocks.show.mockResolvedValue(undefined);
  seen.props = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const comingAsked = () => asked.filter(({ path }) => path === '/api/series/7/coming').length;
const posts = () => asked.filter(({ method }) => method !== 'GET');
const rows = async () => await screen.findAllByTestId('series-day');
const show = (seriesId: number | null = 7) => render(SeriesPage, { props: { title: 'memory_series_title', seriesId } });

describe('SeriesPage, its head', () => {
  it('says what the series is made from, with the way back to every series', async () => {
    show();
    const head = await screen.findByTestId('series-head');
    expect(within(head).getByRole('heading', { level: 2 })).toHaveTextContent('memory_series_whole_library');
    expect(within(head).getByRole('link', { name: 'memory_series_all' })).toHaveAttribute(
      'href',
      '/from-the-beginning',
    );
    expect(within(head).queryByTestId('series-head-span')).not.toBeInTheDocument();
    expect(within(head).queryByTestId('series-head-note')).not.toBeInTheDocument();
    // only the coming days were asked for: they come with the series
    expect(asked.map(({ path }) => path)).toEqual(['/api/series/7/coming']);
  });

  it('names an album’s series by its album, with its span and the album’s note', async () => {
    coming = comingDays({
      series: seriesCard({
        source: albumSource({ updating: false }),
        span_from: '2003-03-01',
        span_to: '2010-12-31',
      }),
    });
    show();
    const head = await screen.findByTestId('series-head');
    expect(within(head).getByRole('heading', { level: 2 })).toHaveTextContent('Riverton walks');
    expect(within(head).getByTestId('series-head-span')).toHaveTextContent('memory_series_span_both');
    expect(within(head).getByTestId('series-head-note')).toHaveTextContent('memory_series_album_stopped');
  });
});

describe('SeriesPage of a series Curator does not have', () => {
  it('says it is gone, with the way back, and asks nothing more', async () => {
    vi.useFakeTimers();
    coming = undefined;
    show();
    await vi.advanceTimersByTimeAsync(0);
    const gone = screen.getByTestId('series-gone');
    expect(within(gone).getByRole('heading', { name: 'memory_series_gone' })).toBeInTheDocument();
    expect(within(gone).getByRole('link', { name: 'memory_series_all' })).toHaveAttribute(
      'href',
      '/from-the-beginning',
    );
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(comingAsked()).toBe(1);
  });

  it('asks nothing for an address that names no series', async () => {
    show(null);
    expect(await screen.findByTestId('series-gone')).toBeInTheDocument();
    expect(asked).toEqual([]);
  });

  it('says it is gone once it is deleted elsewhere while the page is open', async () => {
    vi.useFakeTimers();
    coming = comingDays({ preparing: true });
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getAllByTestId('series-day')).toHaveLength(2);
    coming = undefined;
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(screen.getByTestId('series-gone')).toBeInTheDocument();
    expect(screen.queryByTestId('series-day')).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(comingAsked()).toBe(2);
  });
});

describe('SeriesPage when Curator cannot be asked', () => {
  it('says Curator is not answering, on its port, with Retry and the way back', async () => {
    failWith = 'offline';
    show();
    const failed = await screen.findByTestId('series-failed');
    expect(within(failed).getByRole('heading', { name: 'ai_inbox_offline_title' })).toBeInTheDocument();
    expect(within(failed).getByText('memory_series_offline_body')).toBeInTheDocument();
    expect(within(failed).getByRole('link', { name: 'memory_series_all' })).toBeInTheDocument();

    failWith = undefined;
    await fireEvent.click(within(failed).getByRole('button', { name: 'retry' }));
    expect(await rows()).toHaveLength(2);
  });

  it('says Curator works for its owner only, in its own words', async () => {
    failWith = Response.json({ detail: 'Curator acts for its owner only' }, { status: 403 });
    show();
    const failed = await screen.findByTestId('series-failed');
    expect(within(failed).getByRole('heading', { name: 'ai_inbox_denied_title' })).toBeInTheDocument();
    expect(within(failed).getByText('Curator acts for its owner only')).toBeInTheDocument();
  });
});

describe('SeriesPage, the coming days', () => {
  it('shows each day as the family will see it: the day, the title, the line, the song and the photos', async () => {
    show();
    const [first, second] = await rows();
    expect(screen.getByTestId('user-page-layout')).toHaveAttribute('data-title', 'memory_series_title');
    expect(screen.getByRole('heading', { name: /memory_series_coming_up/ })).toHaveTextContent('2');

    expect(within(first).getByTestId('series-day-when')).toHaveTextContent('memory_series_tomorrow');
    expect(within(first).getByRole('heading', { name: 'Riverton harbour' })).toBeInTheDocument();
    expect(within(first).getByTestId('series-day-line')).toHaveTextContent('Riverton · March 2018');
    expect(within(first).getByTestId('series-day-song')).toHaveTextContent('Song for Riverton · Rowan');

    // the photos in film order, Gallery's thumbnails, the clip and the cover marked
    const tiles = within(first).getAllByRole('img');
    expect(tiles.map((tile) => tile.getAttribute('alt'))).toEqual([
      'memory_series_photo',
      'memory_series_clip',
      'memory_series_photo',
    ]);
    expect(tiles.map((tile) => new URL(tile.getAttribute('src')!, location.href).pathname)).toEqual([
      '/api/assets/photo-1/thumbnail',
      '/api/assets/photo-2/thumbnail',
      '/api/assets/photo-3/thumbnail',
    ]);
    const marks = tiles.map((tile) => tile.parentElement!);
    expect(marks.map((tile) => tile.dataset.video !== undefined)).toEqual([false, true, false]);
    expect(marks.map((tile) => tile.dataset.cover !== undefined)).toEqual([false, false, true]);
    expect(marks[0]).toHaveTextContent('favorite');
    expect(marks[2]).toHaveTextContent('memory_series_cover');
    expect(within(first).queryByTestId('series-day-owner')).not.toBeInTheDocument();

    // a later day by its weekday and date; the owner's own pick and what changed since it was prepared
    expect(within(second).getByTestId('series-day-when')).toHaveTextContent(seriesDate(dayFromToday(2), 'default'));
    expect(within(second).queryByTestId('series-day-line')).not.toBeInTheDocument();
    expect(within(second).queryByTestId('series-day-song')).not.toBeInTheDocument();
    expect(within(second).getByTestId('series-day-owner')).toHaveTextContent('memory_series_owner_picked');
    expect(within(second).getByTestId('series-day-note')).toHaveTextContent('2 photos went to the trash; 9 left');
  });

  it('says in one quiet line that nothing goes out yet, and that Curator is preparing the days', async () => {
    coming = comingDays({ provisional: true, preparing: true });
    show();
    const status = await screen.findByTestId('series-status');
    expect(status).toHaveTextContent('memory_series_provisional');
    expect(status).toHaveTextContent('memory_series_preparing');
  });

  it('has no quiet line while there is nothing to wait for or to say', async () => {
    coming = comingDays({ provisional: false, preparing: false });
    show();
    await rows();
    expect(screen.queryByTestId('series-status')).not.toBeInTheDocument();
  });

  it('skips a day and has Curator pick again, the key in the body, then asks for the days again', async () => {
    show();
    const [first] = await rows();
    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_skip' }));
    await waitFor(() => expect(comingAsked()).toBe(2));
    // the day's buttons wait while something is under way for it
    const repick = within(first).getByRole('button', { name: 'memory_series_repick' });
    await waitFor(() => expect(repick).toBeEnabled());
    await fireEvent.click(repick);
    await waitFor(() => expect(comingAsked()).toBe(3));
    expect(posts()).toEqual([
      { method: 'POST', path: '/api/series/7/skip', body: { key: 'event:340' } },
      { method: 'POST', path: '/api/series/7/repick', body: { key: 'event:340' } },
    ]);
    // Curator's own pick has nothing to drop: no question
    expect(mocks.showDialog).not.toHaveBeenCalled();
  });

  it('asks before picking again over the photos the owner chose', async () => {
    show();
    const [, second] = await rows();
    mocks.showDialog.mockResolvedValueOnce(false);
    await fireEvent.click(within(second).getByRole('button', { name: 'memory_series_repick' }));
    await waitFor(() => expect(mocks.showDialog).toHaveBeenCalledTimes(1));
    expect(mocks.showDialog).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'memory_series_repick_confirm', confirmText: 'memory_series_repick' }),
    );
    expect(posts()).toEqual([]);

    await fireEvent.click(within(second).getByRole('button', { name: 'memory_series_repick' }));
    await waitFor(() =>
      expect(posts()).toEqual([{ method: 'POST', path: '/api/series/7/repick', body: { key: 'trip:12#2' } }]),
    );
  });

  it('opens the swap sheet for the day and shows the memory it answers with in its row', async () => {
    const days = comingDays();
    coming = days;
    show();
    const [first] = await rows();
    mocks.show.mockResolvedValueOnce(comingMemory({ title: 'Riverton harbour at dusk', picked_by: 'owner' }));
    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_swap' }));
    await waitFor(() =>
      expect(within(first).getByRole('heading', { name: 'Riverton harbour at dusk' })).toBeInTheDocument(),
    );
    expect(mocks.show).toHaveBeenCalledWith(SeriesSwapSheet, { seriesId: 7, memory: days.memories[0] });
    expect(within(first).getByTestId('series-day-owner')).toBeInTheDocument();
    // the sheet asked Curator itself; the page asked nothing more
    expect(posts()).toEqual([]);
    expect(comingAsked()).toBe(1);
  });

  it('opens the song sheet for the day and shows the song it answers with in its row', async () => {
    const days = comingDays();
    coming = days;
    show();
    const [first] = await rows();
    const track = { id: 's1', title: 'Harbour lights', artist: 'Rowan', duration: 200, bpm: 90, src: '/api/music/s1' };
    mocks.show.mockResolvedValueOnce(comingMemory({ tracks: [track] }));
    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_song' }));
    await waitFor(() => expect(within(first).getByTestId('series-day-song')).toHaveTextContent('Harbour lights'));
    expect(mocks.show).toHaveBeenCalledWith(SeriesSongSheet, { seriesId: 7, memory: days.memories[0] });
    expect(posts()).toEqual([]);
  });

  it('plays the film from Gallery’s photos of the memory, and closes it', async () => {
    show();
    const [first] = await rows();
    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_play' }));
    const film = await screen.findByTestId('memory-film');
    expect(mocks.getAssetInfo.mock.calls.map(([{ id }]) => id)).toEqual(['photo-1', 'photo-2', 'photo-3']);
    expect(film).toHaveAttribute('data-memory', 'series:event:340');
    expect(seen.props).toMatchObject({ assetId: 'photo-1', title: 'Riverton harbour', photoSeconds: 6 });

    await fireEvent.click(screen.getByTestId('memory-film-close'));
    await waitFor(() => expect(screen.queryByTestId('memory-film')).not.toBeInTheDocument());
  });

  it('says so when Gallery gives none of the photos', async () => {
    mocks.getAssetInfo.mockRejectedValue(new Error('Not found'));
    show();
    const [first] = await rows();
    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_play' }));
    expect(await screen.findByTestId('series-message')).toHaveTextContent('memory_series_play_failed');
    expect(screen.queryByTestId('memory-film')).not.toBeInTheDocument();
  });

  it('says what Curator could not do, in its words, and keeps the days', async () => {
    show();
    const [first] = await rows();
    vi.mocked(fetch).mockImplementationOnce(() =>
      Promise.resolve(Response.json({ detail: 'This day went out already' }, { status: 409 })),
    );
    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_skip' }));
    expect(await screen.findByTestId('series-message')).toHaveTextContent('This day went out already');
    expect(await rows()).toHaveLength(2);
  });
});

describe('SeriesPage, the skipped days', () => {
  it('lists them only when there are any, each with Put back', async () => {
    show();
    await rows();
    expect(screen.queryByTestId('series-skipped')).not.toBeInTheDocument();
  });

  it('puts one back, the key in the body', async () => {
    coming = comingDays({ skipped: [skippedMemory()] });
    show();
    const skip = await screen.findByTestId('series-skip');
    expect(within(skip).getByRole('heading', { name: 'May – August 2003' })).toBeInTheDocument();
    await fireEvent.click(within(skip).getByRole('button', { name: 'memory_series_restore' }));
    await waitFor(() => expect(comingAsked()).toBe(2));
    expect(posts()).toEqual([
      { method: 'POST', path: '/api/series/7/restore', body: { key: 'months:2003-05/2003-08' } },
    ]);
  });
});

describe('SeriesPage, who is left out', () => {
  it('names them from Gallery, and saves each one taken off and each one added', async () => {
    coming = comingDays({ series: seriesCard({ people_without: ['person-anna'] }) });
    show();
    const leaveOut = await screen.findByTestId('series-leave-out');
    expect(within(leaveOut).getByText('memory_series_leave_out_body')).toBeInTheDocument();
    await waitFor(() => expect(within(leaveOut).getByTestId('series-person')).toHaveTextContent('Anna'));
    expect(mocks.getPerson).toHaveBeenCalledWith({ id: 'person-anna' });

    mocks.show.mockResolvedValueOnce([{ id: 'person-ben', name: 'Ben', updatedAt: '2026-10-01T00:00:00Z' }]);
    await fireEvent.click(within(leaveOut).getByRole('button', { name: 'memory_series_leave_out_add' }));
    await waitFor(() => expect(within(leaveOut).getAllByTestId('series-person')).toHaveLength(2));
    expect(mocks.show).toHaveBeenCalledWith(PeoplePickerModal, { multiple: true, excludedIds: ['person-anna'] });

    // the list waits while a change is saved
    const anna = within(leaveOut).getAllByTestId('series-person')[0];
    const remove = within(anna).getByRole('button', { name: 'memory_series_leave_out_remove' });
    await waitFor(() => expect(remove).toBeEnabled());
    await fireEvent.click(remove);
    await waitFor(() => expect(within(leaveOut).getAllByTestId('series-person')).toHaveLength(1));
    expect(within(leaveOut).getByTestId('series-person')).toHaveTextContent('Ben');

    expect(posts()).toEqual([
      { method: 'PATCH', path: '/api/series/7', body: { people_without: ['person-anna', 'person-ben'] } },
      { method: 'PATCH', path: '/api/series/7', body: { people_without: ['person-ben'] } },
    ]);
    // each change made a job: the days are asked for again
    expect(comingAsked()).toBe(3);
  });
});

describe('SeriesPage while Curator prepares the days', () => {
  it('asks again every few seconds while Curator says it is preparing, and stops when it is done', async () => {
    vi.useFakeTimers();
    coming = comingDays({ preparing: true });
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(comingAsked()).toBe(1);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(comingAsked()).toBe(2);
    coming = comingDays({ preparing: false });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(comingAsked()).toBe(3);
    expect(screen.getByTestId('series-status')).not.toHaveTextContent('memory_series_preparing');

    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(comingAsked()).toBe(3);
  });

  it('starts asking again after an action that makes Curator prepare', async () => {
    vi.useFakeTimers();
    show();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(comingAsked()).toBe(1);

    coming = comingDays({ preparing: true });
    const [first] = screen.getAllByTestId('series-day');
    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_skip' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(comingAsked()).toBe(2);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(comingAsked()).toBe(3);
  });

  it('asks nothing once the page has closed', async () => {
    vi.useFakeTimers();
    coming = comingDays({ preparing: true });
    const { unmount } = show();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(comingAsked()).toBe(2);
    unmount();
    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(comingAsked()).toBe(2);
  });
});

describe('SeriesPage words', () => {
  it('takes every word of its own from i18n keys', async () => {
    coming = comingDays({ skipped: [skippedMemory()] });
    show();
    await rows();
    const words = [
      ...screen.getAllByRole('button').map((button) => button.textContent!.trim()),
      ...screen.getAllByRole('link').map((link) => link.textContent!.trim()),
      ...screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.firstChild!.textContent!.trim()),
    ];
    expect(words.length).toBeGreaterThan(10);
    // the page's own keys, and Gallery's Save for the family page's title
    for (const word of words) {
      expect(word).toMatch(/^(memory_series_[a-z_]+|save)$/);
    }
  });
});
