import type { AlbumResponseDto } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { newAlbumFromAssets } from '$lib/utils/album-from-selection';
import { lastAlbumId } from '$lib/utils/last-album';
import { timelineAssetFactory } from '@test-data/factories/asset-factory';

const mocks = vi.hoisted(() => ({ goto: vi.fn(), handleError: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/utils/handle-error', () => ({ handleError: mocks.handleError }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { primary: vi.fn(), info: vi.fn(), warning: vi.fn(), danger: vi.fn(), custom: vi.fn() },
}));

const at = (date: string, city: string | null) => {
  const [year, month, day] = date.split('-').map(Number);
  return timelineAssetFactory.build({
    localDateTime: { year, month, day, hour: 12, minute: 0, second: 0, millisecond: 0 },
    city,
    country: city ? 'Thailand' : null,
  });
};

const photos = [at('2023-03-12', 'Phuket'), at('2023-03-15', 'Phuket'), at('2023-03-14', 'Phuket')];

const made = (assetCount: number) =>
  ({ id: 'new-album', albumName: 'Phuket · Mar 12 – 15, 2023', assetCount }) as AlbumResponseDto;

/** The props the toast was shown with. */
const toastProps = () =>
  vi.mocked(toastManager.custom).mock.calls[0][0].props as {
    description: string;
    tone: string;
    action: { label: string; onclick: () => unknown };
    onUndo: () => unknown;
  };

describe('newAlbumFromAssets (the N key)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undoManager.entries = [];
    localStorage.removeItem('gallery.lastAlbum');
    sdkMock.createAlbum.mockResolvedValue(made(3));
    sdkMock.deleteAlbum.mockResolvedValue();
  });

  it('makes one album of every selected photo, named by where and when they were taken', async () => {
    const emit = vi.spyOn(eventManager, 'emit');

    expect(await newAlbumFromAssets(photos)).toEqual(made(3));

    expect(sdkMock.createAlbum).toHaveBeenCalledTimes(1);
    const { albumName, assetIds } = sdkMock.createAlbum.mock.calls[0][0].createAlbumDto;
    expect(albumName.replaceAll(/\s/g, ' ')).toBe('Phuket · Mar 12 – 15, 2023');
    expect(assetIds).toEqual(photos.map(({ id }) => id));
    expect(emit).toHaveBeenCalledWith('AlbumCreate', made(3));
  });

  it('becomes the album L offers first, so the next photos follow it with Enter', async () => {
    await newAlbumFromAssets(photos);

    expect(lastAlbumId()).toBe('new-album');
  });

  it('says what it made, opens it from the toast, and its Undo deletes the album again', async () => {
    await newAlbumFromAssets(photos);

    const props = toastProps();
    expect(props.description).toBe('album_made');
    expect(props.tone).toBe('primary');
    await props.action.onclick();
    expect(mocks.goto).toHaveBeenCalledWith('/albums/new-album');

    const emit = vi.spyOn(eventManager, 'emit');
    expect(undoManager.entries).toHaveLength(1);
    await undoManager.undo();
    expect(sdkMock.deleteAlbum).toHaveBeenCalledWith({ id: 'new-album' });
    expect(emit).toHaveBeenCalledWith('AlbumDelete', made(3));
    expect(undoManager.entries).toHaveLength(0);
  });

  it('says so when only some photos could go in (another member’s, seen through a Space)', async () => {
    sdkMock.createAlbum.mockResolvedValue(made(2));

    expect(await newAlbumFromAssets(photos)).toEqual(made(2));

    const props = toastProps();
    expect(props.description).toBe('album_made_partial');
    expect(props.tone).toBe('info');
  });

  it('leaves no empty album behind when none of the photos could go in', async () => {
    sdkMock.createAlbum.mockResolvedValue(made(0));

    expect(await newAlbumFromAssets(photos)).toBeUndefined();

    expect(sdkMock.deleteAlbum).toHaveBeenCalledWith({ id: 'new-album' });
    expect(toastManager.warning).toHaveBeenCalledTimes(1);
    expect(toastManager.custom).not.toHaveBeenCalled();
    expect(undoManager.entries).toHaveLength(0);
    expect(lastAlbumId()).toBeUndefined();
  });

  it('makes one album for a second N pressed while the first is still on its way', async () => {
    let created!: (album: AlbumResponseDto) => void;
    sdkMock.createAlbum.mockReturnValue(new Promise((resolve) => (created = resolve)) as never);

    const first = newAlbumFromAssets(photos);
    expect(await newAlbumFromAssets(photos)).toBeUndefined();
    await vi.waitFor(() => expect(sdkMock.createAlbum).toHaveBeenCalledTimes(1));
    created(made(3));
    expect(await first).toEqual(made(3));
    expect(sdkMock.createAlbum).toHaveBeenCalledTimes(1);
  });

  it('does nothing without photos', async () => {
    expect(await newAlbumFromAssets([])).toBeUndefined();
    expect(sdkMock.createAlbum).not.toHaveBeenCalled();
  });

  it('reports a failure and makes nothing to undo', async () => {
    sdkMock.createAlbum.mockRejectedValue(new Error('boom'));

    expect(await newAlbumFromAssets(photos)).toBeUndefined();

    expect(mocks.handleError).toHaveBeenCalledWith(expect.any(Error), 'errors.failed_to_create_album');
    expect(toastManager.custom).not.toHaveBeenCalled();
    expect(undoManager.entries).toHaveLength(0);
  });
});
