import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { albumSource, dayFromToday, seriesCard } from '@test-data/factories/series-factory';
import SeriesList from './SeriesList.svelte';
import SeriesNewSheet from './SeriesNewSheet.svelte';
import type { SeriesCard } from './series-api';

// Local Omarchy layer: From the beginning's list of series against a stand-in Curator (gallery/series): each series a
// card that opens its own page, saying what it is made from, its span, where it stands, its days, its family link and
// its album's notes; New series, in the bar and as the empty state's one step, opening the series Curator answers
// with; Curator not answering. Every word is an i18n key (the specs render the 'dev' locale, which shows keys).
// Synthetic names, places and ids only.

const mocks = vi.hoisted(() => ({
  auth: { authenticated: true, isSharedLink: false, user: { id: 'owner-id', isAdmin: true }, params: {} },
  show: vi.fn(),
  goto: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: stub } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: stub };
});
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: mocks.show },
}));

let asked: string[];
let cards: SeriesCard[];
let failWith: Response | 'offline' | undefined;

beforeEach(() => {
  asked = [];
  failWith = undefined;
  cards = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    asked.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (failWith === 'offline') {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(failWith ?? Response.json({ series: cards }));
  });
  mocks.show.mockResolvedValue(undefined);
  mocks.goto.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const show = () => render(SeriesList, { props: { title: 'memory_series_title' } });

const three = () => [
  seriesCard({ id: 7, status: 'live', link_id: 'link-1', links: ['link-1'], remaining: 12 }),
  seriesCard({
    id: 8,
    name: 'Summers at the lake',
    source: albumSource({ updating: false }),
    smart_album_id: 4,
    album_id: 'album-riverton',
    span_from: '2003-03-01',
    span_to: '2010-12-31',
  }),
  seriesCard({
    id: 9,
    status: 'off',
    source: albumSource({ name: null, gone: true, updating: false }),
    span_from: '2015-06-01',
    remaining: 0,
  }),
];

describe('SeriesList before there is a series', () => {
  it('says what a series is, with New series as its one step, and opens the series the sheet answers with', async () => {
    show();
    const empty = await screen.findByTestId('series-empty');
    expect(within(empty).getByRole('heading', { name: 'memory_series_empty_title' })).toBeInTheDocument();
    expect(within(empty).getByText('memory_series_empty_body')).toBeInTheDocument();
    // one next step: the bar has no New series of its own here
    expect(screen.queryByTestId('series-new')).not.toBeInTheDocument();

    mocks.show.mockResolvedValueOnce(11);
    await fireEvent.click(within(empty).getByRole('button', { name: 'memory_series_new' }));
    expect(mocks.show).toHaveBeenCalledExactlyOnceWith(SeriesNewSheet, { series: [] });
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledExactlyOnceWith('/from-the-beginning/11'));
  });
});

describe('SeriesList, the cards', () => {
  it('shows each series, the oldest first, opening its own page', async () => {
    cards = three();
    show();
    const shown = await screen.findAllByTestId('series-card');
    expect(screen.getByText('memory_series_list_about')).toBeInTheDocument();
    expect(shown.map((card) => card.getAttribute('href'))).toEqual([
      '/from-the-beginning/7',
      '/from-the-beginning/8',
      '/from-the-beginning/9',
    ]);
    expect(asked).toEqual(['GET /api/series']);
  });

  it('says what each is made from, where it stands, its days, its link and its span', async () => {
    cards = three();
    show();
    const [library, album, gone] = await screen.findAllByTestId('series-card');

    expect(library).toHaveTextContent('memory_series_whole_library');
    expect(within(library).getByTestId('series-card-status')).toHaveTextContent('memory_series_status_live');
    expect(within(library).getByTestId('series-card-days')).toHaveTextContent('memory_series_days_left');
    expect(within(library).getByTestId('series-card-link')).toHaveTextContent('memory_series_link_on');
    expect(within(library).queryByTestId('series-card-span')).not.toBeInTheDocument();
    // Curator's own title for the family page goes unsaid
    expect(within(library).queryByTestId('series-card-title')).not.toBeInTheDocument();
    expect(within(library).queryByTestId('series-card-note')).not.toBeInTheDocument();

    // an album's series by the album's name, before its first plan (no days yet), with its own title for the family
    expect(album).toHaveTextContent('Riverton walks');
    expect(within(album).getByTestId('series-card-status')).toHaveTextContent('memory_series_status_planning');
    expect(within(album).queryByTestId('series-card-days')).not.toBeInTheDocument();
    expect(within(album).getByTestId('series-card-link')).toHaveTextContent('memory_series_link_none');
    expect(within(album).getByTestId('series-card-span')).toHaveTextContent('memory_series_span_both');
    expect(within(album).getByTestId('series-card-title')).toHaveTextContent('memory_series_on_family_page');
    expect(within(album).getByTestId('series-card-note')).toHaveTextContent('memory_series_album_stopped');

    // an album Gallery no longer has, without a name; the story has reached today; its link turned off
    expect(gone).toHaveTextContent('memory_series_album_gone_unnamed');
    expect(within(gone).getByTestId('series-card-status')).toHaveTextContent('memory_series_status_off');
    expect(within(gone).getByTestId('series-card-days')).toHaveTextContent('memory_series_reached_today');
    expect(within(gone).getByTestId('series-card-link')).toHaveTextContent('memory_series_link_off');
    expect(within(gone).getByTestId('series-card-span')).toHaveTextContent('memory_series_span_since');
    expect(within(gone).getByTestId('series-card-note')).toHaveTextContent('memory_series_album_gone');
  });

  it('says when a series whose link is made starts', async () => {
    cards = [seriesCard({ status: 'starts', starts_on: dayFromToday(3), link_id: 'link-1', links: ['link-1'] })];
    show();
    const [card] = await screen.findAllByTestId('series-card');
    expect(within(card).getByTestId('series-card-status')).toHaveTextContent('memory_series_starts_on');
    expect(within(card).getByTestId('series-card-link')).toHaveTextContent('memory_series_link_on');
  });

  it('has New series in the bar, which gives the sheet the series there are', async () => {
    cards = three();
    show();
    await screen.findAllByTestId('series-card');
    const button = within(screen.getByTestId('layout-buttons')).getByRole('button', { name: 'memory_series_new' });

    // Cancel opens nothing
    await fireEvent.click(button);
    await waitFor(() => expect(mocks.show).toHaveBeenCalledOnce());
    expect(mocks.show).toHaveBeenCalledWith(SeriesNewSheet, { series: cards });
    expect(mocks.goto).not.toHaveBeenCalled();

    mocks.show.mockResolvedValueOnce(8);
    await fireEvent.click(button);
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledExactlyOnceWith('/from-the-beginning/8'));
  });
});

describe('SeriesList when Curator cannot be asked', () => {
  it('says Curator is not answering, with Retry', async () => {
    failWith = 'offline';
    show();
    const failed = await screen.findByTestId('series-failed');
    expect(within(failed).getByRole('heading', { name: 'ai_inbox_offline_title' })).toBeInTheDocument();
    expect(within(failed).getByText('memory_series_offline_body')).toBeInTheDocument();
    expect(screen.queryByTestId('series-new')).not.toBeInTheDocument();

    failWith = undefined;
    cards = three();
    await fireEvent.click(within(failed).getByRole('button', { name: 'retry' }));
    expect(await screen.findAllByTestId('series-card')).toHaveLength(3);
  });

  it('says Curator works for its owner only, in its own words', async () => {
    failWith = Response.json({ detail: 'Curator acts for its owner only' }, { status: 403 });
    show();
    const failed = await screen.findByTestId('series-failed');
    expect(within(failed).getByRole('heading', { name: 'ai_inbox_denied_title' })).toBeInTheDocument();
    expect(within(failed).getByText('Curator acts for its owner only')).toBeInTheDocument();
  });
});
