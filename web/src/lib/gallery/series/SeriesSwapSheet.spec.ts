import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { comingMemory } from '@test-data/factories/series-factory';
import SeriesSwapSheet from './SeriesSwapSheet.svelte';

// Local Omarchy layer: Swap a photo (gallery/series): first the photo to take out, from the memory's own; then the one
// to put in, from Curator's candidates the memory does not hold yet; Swap sends both with the memory's key in the body,
// and the sheet closes with the memory Curator answers with. A stand-in Curator answers through fetch. Synthetic ids.

const mocks = vi.hoisted(() => ({
  auth: { authenticated: true, user: { id: 'owner-id', isAdmin: true }, params: {} },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));

type Asked = { method: string; path: string; body?: unknown };
let asked: Asked[];
let candidates: { id: string; video: boolean; favourite: boolean; picked: boolean }[];
let swapAnswer: () => Response;
let onClose: ReturnType<typeof vi.fn>;

const memory = comingMemory();
const swapped = comingMemory({
  photos: [memory.photos[0], { id: 'photo-7', video: false, favourite: false }, memory.photos[2]],
  picked_by: 'owner',
});

beforeEach(() => {
  asked = [];
  onClose = vi.fn();
  candidates = [
    { id: 'photo-1', video: false, favourite: true, picked: true },
    { id: 'photo-6', video: false, favourite: false, picked: false },
    { id: 'photo-2', video: true, favourite: false, picked: true },
    { id: 'photo-7', video: false, favourite: false, picked: false },
    { id: 'photo-8', video: true, favourite: false, picked: false },
    { id: 'photo-3', video: false, favourite: false, picked: true },
  ];
  swapAnswer = () => Response.json({ memory: swapped });
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    asked.push(request);
    if (url.pathname === '/api/series/7/candidates') {
      return Promise.resolve(Response.json({ photos: candidates }));
    }
    return Promise.resolve(swapAnswer());
  });
});

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears down `document`.
afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

const open = () => render(SeriesSwapSheet, { props: { seriesId: 7, memory, onClose } });
const tiles = (list: HTMLElement) => within(list).getAllByRole('button');
const imageOf = (button: HTMLElement) => new URL(button.querySelector('img')!.src, location.href).pathname;

describe('SeriesSwapSheet', () => {
  it('asks first for the photo to take out, from the memory’s own in film order', async () => {
    open();
    expect(screen.getByText('memory_series_swap_out')).toBeInTheDocument();
    const out = screen.getByTestId('series-swap-out');
    expect(tiles(out).map((tile) => imageOf(tile))).toEqual([
      '/api/assets/photo-1/thumbnail',
      '/api/assets/photo-2/thumbnail',
      '/api/assets/photo-3/thumbnail',
    ]);
    expect(screen.queryByText('memory_series_swap_in')).not.toBeInTheDocument();
    expect(screen.getByTestId('series-swap-confirm')).toBeDisabled();
    await waitFor(() => expect(asked).toEqual([{ method: 'GET', path: '/api/series/7/candidates?key=event%3A340' }]));
  });

  it('then for the photo to put in, from the candidates the memory does not hold, and swaps the two', async () => {
    open();
    const out = screen.getByTestId('series-swap-out');
    await fireEvent.click(tiles(out)[1]);
    expect(tiles(out)[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('memory_series_swap_in')).toBeInTheDocument();

    const into = await screen.findByTestId('series-swap-in');
    expect(tiles(into).map((tile) => imageOf(tile))).toEqual([
      '/api/assets/photo-6/thumbnail',
      '/api/assets/photo-7/thumbnail',
      '/api/assets/photo-8/thumbnail',
    ]);
    expect(screen.getByTestId('series-swap-confirm')).toBeDisabled();
    await fireEvent.click(tiles(into)[1]);
    expect(screen.getByTestId('series-swap-confirm')).toBeEnabled();

    await fireEvent.click(screen.getByTestId('series-swap-confirm'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(swapped));
    expect(asked.at(-1)).toEqual({
      method: 'POST',
      path: '/api/series/7/swap',
      body: { key: 'event:340', out: 'photo-2', in: 'photo-7' },
    });
  });

  it('says when there is no other photo to put in', async () => {
    candidates = candidates.filter(({ picked }) => picked);
    open();
    await fireEvent.click(tiles(screen.getByTestId('series-swap-out'))[0]);
    expect(await screen.findByText('memory_series_swap_none')).toBeInTheDocument();
    expect(screen.getByTestId('series-swap-confirm')).toBeDisabled();
  });

  it('keeps the sheet open with Curator’s words when the swap fails', async () => {
    swapAnswer = () => Response.json({ detail: 'That photo is not in this event' }, { status: 422 });
    open();
    await fireEvent.click(tiles(screen.getByTestId('series-swap-out'))[0]);
    await fireEvent.click(tiles(await screen.findByTestId('series-swap-in'))[0]);
    await fireEvent.click(screen.getByTestId('series-swap-confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('That photo is not in this event');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('series-swap-confirm')).toBeEnabled();
  });

  it('changes nothing on Cancel', async () => {
    open();
    await fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(onClose).toHaveBeenCalledWith();
    expect(asked.filter(({ method }) => method !== 'GET')).toEqual([]);
  });
});
