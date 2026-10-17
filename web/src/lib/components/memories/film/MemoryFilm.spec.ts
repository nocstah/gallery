import { AssetTypeEnum, MemoryType, type MemoryResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { MemoryTrack } from '$lib/utils/curator';
import { assetFactory } from '@test-data/factories/asset-factory';
import MemoryFilm from './MemoryFilm.svelte';

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { authenticated: false, params: {}, preferences: { memories: { duration: 5 } } },
}));

const memory = (count = 3): MemoryResponseDto =>
  ({
    id: 'memory-1',
    ownerId: 'owner',
    assets: Array.from({ length: count }, (_, index) =>
      assetFactory.build({
        id: `asset-${index}`,
        type: AssetTypeEnum.Image,
        width: 4000,
        height: 3000,
        localDateTime: '2025-10-16T10:00:00.000Z',
      }),
    ),
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    type: MemoryType.OnThisDay,
    data: { year: 2025 },
    isSaved: false,
    memoryAt: '2026-10-16T00:00:00.000Z',
  }) as MemoryResponseDto;

const track = (id: string): MemoryTrack => ({
  id,
  title: `Song ${id}`,
  artist: 'Someone',
  duration: 200,
  bpm: null,
  src: `/api/music/${id}`,
});

const onClose = vi.fn();
const onAllPhotos = vi.fn();

const renderFilm = (props: { tracks?: MemoryTrack[]; active?: boolean } = {}) =>
  render(MemoryFilm, {
    memory: memory(),
    assetId: 'asset-0',
    active: props.active ?? true,
    name: 'Siem Reap',
    line: 'October 2025 · 3 photos',
    title: 'Siem Reap · October 2025',
    settled: true,
    story: 'Temples at dawn. Then lunch by the river.',
    tracks: props.tracks ?? [],
    onClose,
    onAllPhotos,
  });

const started = async () => {
  const film = await screen.findByTestId('memory-film');
  await waitFor(() => expect(film).toHaveAttribute('data-playing'));
  return film;
};

describe('MemoryFilm', () => {
  let played: string[];

  beforeEach(() => {
    played = [];
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      played.push(this.src);
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens on its title card', async () => {
    renderFilm();
    await started();

    // the title's words come up half a second in, once the first photo is on screen
    expect(await screen.findByRole('heading', { name: 'Siem Reap' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('October 2025 · 3 photos')).toBeInTheDocument();
  });

  it('starts the first song with the film, from Curator', async () => {
    renderFilm({ tracks: [track('a'), track('b')] });
    await started();

    await waitFor(() => expect(played.some((src) => src.endsWith(':2290/api/music/a'))).toBe(true));
    expect(screen.getByText('Someone – Song a')).toBeInTheDocument();
  });

  it('mutes the music with M', async () => {
    renderFilm({ tracks: [track('a'), track('b')] });
    await started();

    await fireEvent.keyDown(document, { key: 'm' });
    expect(screen.getByRole('button', { name: 'unmute_memories' })).toBeInTheDocument();
    await fireEvent.keyDown(document, { key: 'M' });
    expect(screen.getByRole('button', { name: 'mute_memories' })).toBeInTheDocument();
  });

  it('skips to the next song with N, and back round to the first', async () => {
    renderFilm({ tracks: [track('a'), track('b')] });
    await started();

    await fireEvent.keyDown(document, { key: 'n' });
    expect(screen.getByText('Someone – Song b')).toBeInTheDocument();
    await fireEvent.keyDown(document, { key: 'N' });
    expect(screen.getByText('Someone – Song a')).toBeInTheDocument();
  });

  it('is a silent film without songs: no song, no mute', async () => {
    renderFilm();
    await started();

    await fireEvent.keyDown(document, { key: 'm' });
    expect(screen.queryByRole('button', { name: 'mute_memories' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'unmute_memories' })).not.toBeInTheDocument();
  });

  it('offers to start the sound when the browser would not without a press', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() =>
      Promise.reject(new DOMException('no gesture', 'NotAllowedError')),
    );
    renderFilm({ tracks: [track('a')] });
    await started();

    expect(await screen.findByRole('button', { name: 'memory_film_sound_on' })).toBeInTheDocument();
  });

  it('steps through the photos with the arrows and closes with Escape', async () => {
    renderFilm();
    const film = await started();

    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(film).toHaveAttribute('data-position', '2');
    await fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(film).toHaveAttribute('data-position', '1');
    await fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(film).toHaveAttribute('data-position', '1');

    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pauses with Space, and the key does not press the button that has the focus', async () => {
    renderFilm();
    const film = await started();
    const next = screen.getByRole('button', { name: 'memory_film_next_photo' });
    next.focus();

    const down = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    await fireEvent(next, down);
    const up = new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true });
    await fireEvent(next, up);

    expect(down.defaultPrevented).toBe(true);
    expect(up.defaultPrevented).toBe(true);
    expect(film).not.toHaveAttribute('data-playing');
    expect(film).toHaveAttribute('data-position', '1');
  });

  it('leaves keys held with Ctrl and keys pressed while it is off screen to someone else', async () => {
    const { rerender } = renderFilm();
    const film = await started();

    await fireEvent.keyDown(document, { key: 'ArrowRight', ctrlKey: true });
    expect(film).toHaveAttribute('data-position', '1');

    await rerender({ active: false });
    await fireEvent.keyDown(document, { key: 'ArrowRight' });
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(film).toHaveAttribute('data-position', '1');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hands Save as video its plan for a 16:9 frame, the song playing first', async () => {
    const { component } = renderFilm({ tracks: [track('a'), { ...track('b'), bpm: 96 }] });
    await started();
    await fireEvent.keyDown(document, { key: 'n' });

    const saved = component.videoPlan();
    expect(saved?.trackId).toBe('b');
    expect(saved?.plan).toMatchObject({ memoryId: 'memory-1', aspect: 1.7778 });
    expect(saved?.plan.music[0]).toMatchObject({ trackId: 'b', start: 0 });
    // the cuts on the beat of the song it goes with (96 BPM: a beat is 0.625 s; the title card's 5 s is 8 of them)
    expect(saved?.plan.shots[1].start).toBeCloseTo(0.625 * Math.round(10 / 0.625), 3);
    expect(saved?.plan.texts[0]).toMatchObject({ kind: 'title', text: 'Siem Reap', line: 'October 2025 · 3 photos' });
  });

  it('pauses while it is off screen and plays on when it is back', async () => {
    const { rerender } = renderFilm();
    const film = await started();

    await rerender({ active: false });
    expect(film).not.toHaveAttribute('data-playing');

    await rerender({ active: true });
    expect(film).toHaveAttribute('data-playing');
  });
});
