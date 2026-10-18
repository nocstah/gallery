import { AssetTypeEnum, MemoryType, type MemoryResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { rgbaToThumbHash } from 'thumbhash';
import type { MemoryTrack } from '$lib/utils/curator';
import { assetFactory } from '@test-data/factories/asset-factory';
import { reactiveProps } from '@test-data/reactive-props.svelte';
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

type FilmProps = {
  tracks?: MemoryTrack[];
  active?: boolean;
  dress?: 'screen' | 'room';
  caption?: string;
  story?: string | null;
  allPhotos?: boolean;
  onNextFilm?: () => void;
  onPreviousFilm?: () => void;
};

const filmProps = (props: FilmProps = {}) => ({
  memory: memory(),
  assetId: 'asset-0',
  active: props.active ?? true,
  name: 'Siem Reap',
  line: 'October 2025 · 3 photos',
  title: 'Siem Reap · October 2025',
  settled: true,
  story: props.story === undefined ? 'Temples at dawn. Then lunch by the river.' : props.story,
  tracks: props.tracks ?? [],
  dress: props.dress,
  caption: props.caption,
  onClose,
  onAllPhotos: props.allPhotos === false ? undefined : onAllPhotos,
  onNextFilm: props.onNextFilm,
  onPreviousFilm: props.onPreviousFilm,
});

const renderFilm = (props: FilmProps = {}) => render(MemoryFilm, filmProps(props));

/** a thumbhash of a picture of one colour */
const plain = (grey: number) =>
  btoa(
    String.fromCodePoint(
      ...rgbaToThumbHash(
        4,
        3,
        new Uint8Array(4 * 3 * 4).fill(grey).map((v, i) => (i % 4 === 3 ? 255 : v)),
      ),
    ),
  );

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

  it('lays a shade under the words of a bright photo, and none under a dark one', async () => {
    // happy-dom lays nothing out: the words' rulers stand at the foot of the frame
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 40,
      top: window.innerHeight - 160,
      right: 400,
      bottom: window.innerHeight - 60,
      width: 360,
      height: 100,
      x: 40,
      y: window.innerHeight - 160,
      toJSON: () => ({}),
    } as DOMRect);
    const film = memory();
    film.assets[0].thumbhash = plain(245);
    film.assets[1].thumbhash = plain(20);
    render(MemoryFilm, { ...filmProps(), memory: film });
    await started();

    const layer = (id: string) => document.querySelector<HTMLElement>(`.film-layer[data-asset-id="${CSS.escape(id)}"]`);
    await waitFor(() => expect(layer('asset-1')).toBeInTheDocument());
    expect(Number(layer('asset-0')?.dataset.shade)).toBeGreaterThan(0.2);
    expect(layer('asset-0')?.querySelector('.film-shade-foot')).toBeInTheDocument();
    expect(layer('asset-1')).not.toHaveAttribute('data-shade');
    expect(layer('asset-1')?.querySelector('.film-shade-foot')).not.toBeInTheDocument();
  });

  it('opens on its title card', async () => {
    renderFilm();
    await started();

    // the title's words come up half a second in, once the first photo is on screen
    expect(await screen.findByRole('heading', { name: 'Siem Reap' }, { timeout: 4000 })).toBeInTheDocument();
    // (the title card's ruler, out of sight, holds the same words)
    expect(screen.getByText('October 2025 · 3 photos', { ignore: 'script, style, .film-ruler *' })).toBeInTheDocument();
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

  it('leaves Enter, ↑ and ↓ alone on a screen, and shows no caption there', async () => {
    renderFilm({ caption: 'Anna · Siem Reap, Cambodia · October 16, 2025' });
    const film = await started();

    await fireEvent.keyDown(document, { key: 'Enter' });
    await fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(film).toHaveAttribute('data-playing');
    expect(film).not.toHaveAttribute('data-dress');
    expect(screen.queryByTestId('memory-film-caption')).not.toBeInTheDocument();
  });

  describe('dressed for Room', () => {
    it('pauses and plays with a remote’s OK', async () => {
      renderFilm({ dress: 'room', allPhotos: false });
      const film = await started();
      expect(film).toHaveAttribute('data-dress', 'room');

      await fireEvent.keyDown(document, { key: 'Enter' });
      expect(film).not.toHaveAttribute('data-playing');
      await fireEvent.keyDown(document, { key: 'Enter' });
      expect(film).toHaveAttribute('data-playing');
    });

    it('captions the photo on screen at its foot once the title card has gone, and has no way to All photos', async () => {
      renderFilm({ dress: 'room', allPhotos: false, story: null, caption: 'Anna · Siem Reap, Cambodia' });
      await started();

      expect(screen.queryByRole('button', { name: 'all_photos' })).not.toBeInTheDocument();
      // the title card first: the caption waits for it to go
      expect(screen.queryByTestId('memory-film-caption')).not.toBeInTheDocument();
      await fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(await screen.findByTestId('memory-film-caption')).toHaveTextContent('Anna · Siem Reap, Cambodia');
    });

    it('starts the sound a browser held back with the first key, and OK does only that', async () => {
      let refuse = true;
      vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (this: HTMLMediaElement) {
        if (refuse) {
          return Promise.reject(new DOMException('no gesture', 'NotAllowedError'));
        }
        played.push(this.src);
        return Promise.resolve();
      });
      renderFilm({ dress: 'room', tracks: [track('a')] });
      const film = await started();
      await screen.findByRole('button', { name: 'memory_film_sound_on' });

      refuse = false;
      await fireEvent.keyDown(document, { key: 'Enter' });
      await waitFor(() => expect(film).toHaveAttribute('data-sound', 'on'));
      expect(film).toHaveAttribute('data-playing');
    });
  });

  describe('in a chain', () => {
    it('hands on to the next film at its end, through black, instead of offering what to do next', async () => {
      const onNextFilm = vi.fn();
      renderFilm({ dress: 'room', onNextFilm });
      const film = await started();

      for (let step = 0; step < 3; step++) {
        await fireEvent.keyDown(document, { key: 'ArrowRight' });
      }
      expect(film).toHaveAttribute('data-leaving');
      expect(screen.queryByRole('button', { name: 'memories_start_over' })).not.toBeInTheDocument();
      await waitFor(() => expect(onNextFilm).toHaveBeenCalledOnce());
    });

    it('goes to the film before with ↑ and the one after with ↓, once', async () => {
      const onNextFilm = vi.fn();
      const onPreviousFilm = vi.fn();
      const first = renderFilm({ dress: 'room', onNextFilm, onPreviousFilm });
      await started();

      await fireEvent.keyDown(document, { key: 'ArrowDown' });
      await fireEvent.keyDown(document, { key: 'ArrowDown' });
      await waitFor(() => expect(onNextFilm).toHaveBeenCalledOnce());
      expect(onPreviousFilm).not.toHaveBeenCalled();
      first.unmount();

      renderFilm({ dress: 'room', onNextFilm, onPreviousFilm });
      await started();
      await fireEvent.keyDown(document, { key: 'ArrowUp' });
      await waitFor(() => expect(onPreviousFilm).toHaveBeenCalledOnce());
    });

    it('says it is paused once a person pauses it, and not while it plays or hands on', async () => {
      const props = reactiveProps({ ...filmProps({ dress: 'room', onNextFilm: vi.fn() }), paused: false });
      render(MemoryFilm, props);
      await started();
      expect(props.paused).toBe(false);

      await fireEvent.keyDown(document, { key: ' ' });
      await waitFor(() => expect(props.paused).toBe(true));
      await fireEvent.keyDown(document, { key: ' ' });
      await waitFor(() => expect(props.paused).toBe(false));
      await fireEvent.keyDown(document, { key: 'ArrowDown' });
      expect(props.paused).toBe(false);
    });
  });
});
