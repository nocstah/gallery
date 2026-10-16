import type { AlbumResponseDto } from '@immich/sdk';

// Local Omarchy layer: albums pinned to the sidebar, per browser (stores/pinned-albums)
const mocks = vi.hoisted(() => ({ getAlbumInfo: vi.fn() }));
vi.mock('@immich/sdk', async (original) => ({
  ...(await original<typeof import('@immich/sdk')>()),
  getAlbumInfo: mocks.getAlbumInfo,
  isHttpError: (error: unknown) => !!(error as { __http?: boolean })?.__http,
}));

const KEY = 'gallery.pinnedAlbums';
const album = (id: string, albumName = id) => ({ id, albumName }) as AlbumResponseDto;
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { __http: true, status, data: {} });

// the store reads what is pinned when it is made, so each test makes it afresh
const fresh = async () => {
  vi.resetModules();
  const store = await import('$lib/stores/pinned-albums.svelte');
  return store.pinnedAlbums;
};
const pinnedAfterReload = async () => {
  const pins = await fresh();
  return pins.ids;
};

describe('pinned albums', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.getAlbumInfo.mockReset();
  });

  it('keeps the pins in the order pinned, once each, in this browser', async () => {
    const pins = await fresh();
    pins.pin('bali');
    pins.pin('malta');
    pins.pin('bali');
    expect(pins.ids).toEqual(['bali', 'malta']);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['bali', 'malta']);

    pins.toggle('bali');
    expect(pins.has('bali')).toBe(false);
    pins.toggle('bali');
    expect(pins.ids).toEqual(['malta', 'bali']);

    // and after a reload
    expect(await pinnedAfterReload()).toEqual(['malta', 'bali']);
  });

  it('starts empty from storage it cannot read', async () => {
    localStorage.setItem(KEY, '{not json');
    expect(await pinnedAfterReload()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ bali: true }));
    expect(await pinnedAfterReload()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify(['bali', 7, 'bali', 'malta']));
    expect(await pinnedAfterReload()).toEqual(['bali', 'malta']);
  });

  it('still pins for the page when storage is blocked', async () => {
    const pins = await fresh();
    const blocked = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => pins.pin('bali')).not.toThrow();
    expect(pins.ids).toEqual(['bali']);
    blocked.mockRestore();
  });

  it('shows the pinned albums Gallery names, in the order pinned', async () => {
    localStorage.setItem(KEY, JSON.stringify(['malta', 'bali']));
    const pins = await fresh();
    mocks.getAlbumInfo.mockImplementation(({ id }: { id: string }) => Promise.resolve(album(id, id.toUpperCase())));
    await pins.load();
    expect(pins.shown.map(({ albumName }) => albumName)).toEqual(['MALTA', 'BALI']);

    // asked once each
    await pins.load();
    expect(mocks.getAlbumInfo).toHaveBeenCalledTimes(2);
  });

  it('lets an album that is gone leave the list, and keeps one Gallery could not be asked about', async () => {
    localStorage.setItem(KEY, JSON.stringify(['gone', 'offline', 'bali']));
    const pins = await fresh();
    mocks.getAlbumInfo.mockImplementation(({ id }: { id: string }) => {
      if (id === 'gone') {
        return Promise.reject(httpError(400));
      }
      if (id === 'offline') {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(album(id));
    });
    await pins.load();
    expect(pins.ids).toEqual(['offline', 'bali']);
    expect(pins.shown.map(({ id }) => id)).toEqual(['bali']);
  });

  it('follows an album renamed or deleted elsewhere on the page', async () => {
    localStorage.setItem(KEY, JSON.stringify(['bali']));
    const pins = await fresh();
    mocks.getAlbumInfo.mockResolvedValue(album('bali', 'Bali'));
    await pins.load();
    pins.remember(album('bali', 'Bali 2023'));
    pins.remember(album('elsewhere', 'Not pinned'));
    expect(pins.shown.map(({ albumName }) => albumName)).toEqual(['Bali 2023']);
    pins.forget('bali');
    expect(pins.ids).toEqual([]);
    expect(pins.shown).toEqual([]);
  });
});
