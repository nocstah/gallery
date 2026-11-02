import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Mock } from 'vitest';
import { comingMemory } from '@test-data/factories/series-factory';
import SeriesSongSheet from './SeriesSongSheet.svelte';
import type { ComingMemory, SeriesSong } from './series-api';

// Local Omarchy layer: Change song (gallery/series): the memory's song and Curator's suggestions, a search of the music
// library, listening before choosing, and the memory Curator answers with. A stand-in Curator answers through fetch.
// Synthetic songs.

const mocks = vi.hoisted(() => ({
  auth: { authenticated: true, user: { id: 'owner-id', isAdmin: true }, params: {} },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));

const song = (id: string, title: string, used = false): SeriesSong => ({
  id,
  title,
  artist: 'Rowan',
  duration: 185,
  bpm: 90,
  src: `/api/music/${id}`,
  used,
});

type Asked = { method: string; path: string; body?: unknown };
let asked: Asked[];
let suggested: SeriesSong[];
let found: SeriesSong[];
let saveAnswer: () => Response;
let onClose: Mock<(memory?: ComingMemory) => void>;

const memory = comingMemory({ tracks: [song('own', 'Own song')] });
const changed = comingMemory({ tracks: [song('s1', 'First suggestion')] });

beforeEach(() => {
  asked = [];
  onClose = vi.fn();
  suggested = [song('s1', 'First suggestion'), song('s2', 'Second suggestion', true)];
  found = [song('f1', 'Harbour lights')];
  saveAnswer = () => Response.json({ memory: changed });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    asked.push({
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url.pathname === '/api/series/7/songs') {
      return Promise.resolve(Response.json({ songs: url.searchParams.get('q') ? found : suggested }));
    }
    return Promise.resolve(saveAnswer());
  });
});

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears down `document`.
afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 30));
});

const open = () => render(SeriesSongSheet, { props: { seriesId: 7, memory, onClose } });
const pick = (name: RegExp) => within(screen.getByTestId('series-song-list')).getByRole('button', { name });

describe('SeriesSongSheet', () => {
  it('shows the memory’s song chosen, then Curator’s suggestions, and marks one the series already plays', async () => {
    open();
    expect(await screen.findByRole('button', { name: /First suggestion/ })).toBeInTheDocument();
    expect(pick(/^Own song/)).toHaveAttribute('aria-pressed', 'true');
    expect(pick(/^First suggestion/)).toHaveAttribute('aria-pressed', 'false');
    expect(within(pick(/^Second suggestion/)).getByText('memory_series_song_used')).toBeInTheDocument();
    expect(within(pick(/^First suggestion/)).getByText('3:05')).toBeInTheDocument();
    expect(screen.getByTestId('series-song-confirm')).toBeDisabled();
  });

  it('saves the song chosen with the memory’s key and closes with what Curator answers', async () => {
    open();
    await fireEvent.click(await screen.findByRole('button', { name: /^First suggestion/ }));
    await fireEvent.click(screen.getByTestId('series-song-confirm'));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(changed));
    expect(asked.at(-1)).toEqual({
      method: 'POST',
      path: '/api/series/7/song',
      body: { key: memory.key, track_id: 's1' },
    });
  });

  it('searches the music library when typing, and shows only what it found', async () => {
    open();
    await screen.findByRole('button', { name: /^First suggestion/ });
    await fireEvent.input(screen.getByTestId('series-song-search'), { target: { value: 'harbour' } });
    expect(await screen.findByRole('button', { name: /^Harbour lights/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Own song/ })).not.toBeInTheDocument();
    expect(asked.at(-1)!.path).toContain('q=harbour');
  });

  it('says when a search finds nothing', async () => {
    found = [];
    open();
    await screen.findByRole('button', { name: /^First suggestion/ });
    await fireEvent.input(screen.getByTestId('series-song-search'), { target: { value: 'nothing' } });
    expect(await screen.findByText('memory_series_song_no_match')).toBeInTheDocument();
  });

  it('plays a song to listen to it and pauses it on a second press, without choosing it', async () => {
    open();
    await screen.findByRole('button', { name: /^First suggestion/ });
    const listen = screen.getAllByRole('button', { name: 'memory_series_song_listen' })[1];
    await fireEvent.click(listen);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(listen).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(listen);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(listen).toHaveAttribute('aria-pressed', 'false');
    expect(pick(/^First suggestion/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the sheet open and says why when Curator refuses', async () => {
    saveAnswer = () => Response.json({ detail: 'That song is not in your music library' }, { status: 400 });
    open();
    await fireEvent.click(await screen.findByRole('button', { name: /^First suggestion/ }));
    await fireEvent.click(screen.getByTestId('series-song-confirm'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('series-song-confirm')).toBeEnabled();
  });

  it('changes nothing on Cancel', async () => {
    open();
    await fireEvent.click(await screen.findByRole('button', { name: /^First suggestion/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(onClose).toHaveBeenCalledWith();
    expect(asked.every(({ method }) => method === 'GET')).toBe(true);
  });
});
