import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Mock } from 'vitest';
import { albumSource, seriesCard, smartAlbum } from '@test-data/factories/series-factory';
import SeriesNewSheet from './SeriesNewSheet.svelte';
import type { SeriesCard } from './series-api';

// Local Omarchy layer: New series (gallery/series), against a stand-in Curator: of the whole library or of a smart
// album from Curator's list, with an optional span; an album that has a series is marked and opens it, asking Curator
// nothing; what Curator refuses is said in its words and the sheet stays; Cancel makes nothing. Every word is an i18n
// key (the 'dev' locale). Synthetic names and ids only.

const mocks = vi.hoisted(() => ({
  auth: { authenticated: true, user: { id: 'owner-id', isAdmin: true }, params: {} },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));

type Asked = { method: string; path: string; body?: unknown };
let asked: Asked[];
let made: () => Response;
let onClose: Mock<(seriesId?: number) => void>;

const ALBUMS = [
  smartAlbum(),
  smartAlbum({ id: 5, album_id: 'album-lake', name: 'The lake house', count: 1 }),
  smartAlbum({ id: 6, album_id: 'album-isle', name: 'Isle Marrow', count: 87 }),
];
// the lake house has its series already
const SERIES: SeriesCard[] = [
  seriesCard({ id: 7 }),
  seriesCard({
    id: 12,
    smart_album_id: 5,
    album_id: 'album-lake',
    source: albumSource({ album_id: 'album-lake', smart_album_id: 5, name: 'The lake house' }),
  }),
];
let albums: typeof ALBUMS;

beforeEach(() => {
  asked = [];
  albums = ALBUMS;
  onClose = vi.fn();
  made = () => Response.json({ series: seriesCard({ id: 21 }), existing: false, job: 30 }, { status: 201 });
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    asked.push(request);
    if (url.pathname === '/api/smart-albums') {
      return Promise.resolve(Response.json(albums));
    }
    return Promise.resolve(made());
  });
});

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears down `document`.
afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

const open = () => render(SeriesNewSheet, { props: { series: SERIES, onClose } });
const sheet = () => screen.findByTestId('series-new-sheet');
const make = () => screen.getByRole('button', { name: 'memory_series_make' });
const writes = () => asked.filter(({ method }) => method !== 'GET');

describe('New series', () => {
  it('makes one of the whole library by default, and closes with its id', async () => {
    open();
    const body = await sheet();
    expect(screen.getByRole('dialog')).toHaveTextContent('memory_series_new');
    expect(within(body).getByRole('button', { name: 'memory_series_whole_library' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(body).queryByTestId('series-new-albums')).not.toBeInTheDocument();
    expect(within(body).getByText('memory_series_span_hint')).toBeInTheDocument();

    await fireEvent.click(make());
    await waitFor(() => expect(onClose).toHaveBeenCalledExactlyOnceWith(21));
    expect(writes()).toEqual([{ method: 'POST', path: '/api/series', body: {} }]);
  });

  it('sends the span it is given', async () => {
    open();
    const body = await sheet();
    await fireEvent.input(within(body).getByLabelText('memory_series_span_start'), {
      target: { value: '2003-03-01' },
    });
    await fireEvent.input(within(body).getByLabelText('memory_series_span_end'), { target: { value: '2010-12-31' } });
    expect(within(body).getByLabelText('memory_series_span_end')).toHaveAttribute('min', '2003-03-01');

    await fireEvent.click(make());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(writes()).toEqual([
      { method: 'POST', path: '/api/series', body: { span_from: '2003-03-01', span_to: '2010-12-31' } },
    ]);
  });

  it('makes one of a smart album picked from Curator’s list, by name with its count', async () => {
    open();
    const body = await sheet();
    await fireEvent.click(within(body).getByRole('button', { name: 'memory_series_new_album' }));
    const list = await within(body).findByTestId('series-new-albums');
    const rows = within(list).getAllByTestId('series-new-album');
    expect(rows.map((row) => row.textContent?.replaceAll(/\s+/g, ' ').trim())).toEqual([
      'Riverton walks assets_count',
      'The lake house assets_count memory_series_has_series',
      'Isle Marrow assets_count',
    ]);
    // nothing picked yet: nothing to make
    expect(make()).toBeDisabled();

    await fireEvent.click(within(list).getByRole('radio', { name: /Isle Marrow/ }));
    expect(make()).toBeEnabled();
    await fireEvent.click(make());
    await waitFor(() => expect(onClose).toHaveBeenCalledExactlyOnceWith(21));
    expect(writes()).toEqual([{ method: 'POST', path: '/api/series', body: { smart_album_id: 6 } }]);
  });

  it('opens the series an album has already, asking Curator nothing, its span left to that series', async () => {
    open();
    const body = await sheet();
    await fireEvent.click(within(body).getByRole('button', { name: 'memory_series_new_album' }));
    const list = await within(body).findByTestId('series-new-albums');
    await fireEvent.click(within(list).getByRole('radio', { name: /The lake house/ }));

    expect(screen.queryByRole('button', { name: 'memory_series_make' })).not.toBeInTheDocument();
    expect(within(body).getByLabelText('memory_series_span_start')).toBeDisabled();
    await fireEvent.click(screen.getByRole('button', { name: 'memory_series_open' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledExactlyOnceWith(12));
    expect(writes()).toEqual([]);
  });

  it('says there are no smart albums yet, and how one is made', async () => {
    albums = [];
    open();
    const body = await sheet();
    await fireEvent.click(within(body).getByRole('button', { name: 'memory_series_new_album' }));
    expect(await within(body).findByTestId('series-new-no-albums')).toHaveTextContent('memory_series_no_smart_albums');
    expect(make()).toBeDisabled();
  });

  it('says what Curator refuses, in its words, and stays open', async () => {
    made = () => Response.json({ detail: 'The span ends before it starts' }, { status: 400 });
    open();
    const body = await sheet();
    await fireEvent.input(within(body).getByLabelText('memory_series_span_start'), {
      target: { value: '2010-12-31' },
    });
    await fireEvent.click(make());
    expect(await within(body).findByRole('alert')).toHaveTextContent('The span ends before it starts');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('makes nothing on Cancel', async () => {
    open();
    await sheet();
    await fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(onClose).toHaveBeenCalledExactlyOnceWith();
    expect(writes()).toEqual([]);
  });
});
