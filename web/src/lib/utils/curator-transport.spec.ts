import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import {
  bookFileUrl,
  curator,
  CuratorError,
  curatorPort,
  filmFileUrl,
  musicUrl,
  reelUrl,
  restoredUrl,
  shareVideoUrl,
} from '$lib/utils/curator';
import {
  libraryContextFile,
  mainLibrary,
  secondLibrary,
  secondWithCurator,
  serving,
} from '@test-data/factories/library-context-factory';

describe('Curator transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['http://localhost:2283', 'http://100.64.0.1:2283'])(
    'keeps local HTTP access working from %s',
    async (address) => {
      vi.stubGlobal('location', new URL(address));
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
      vi.stubGlobal('fetch', fetchMock);

      await curator.health();

      const root = `http://${new URL(address).hostname}:2290`;
      expect(fetchMock).toHaveBeenCalledWith(`${root}/api/health`, expect.objectContaining({ credentials: 'include' }));
      expect(filmFileUrl(12)).toBe(`${root}/api/films/12/film.mp4`);
      expect(musicUrl('/api/music/track')).toBe(`${root}/api/music/track`);
    },
  );

  it('uses the private HTTPS origin for authenticated calls, music and downloads', async () => {
    const address = 'https://gallery.example.ts.net:8443';
    vi.stubGlobal('location', new URL(address));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    await curator.health();

    expect(fetchMock).toHaveBeenCalledWith(
      `${address}/curator/api/health`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(filmFileUrl(12)).toBe(`${address}/curator/api/films/12/film.mp4`);
    expect(shareVideoUrl('asset-1', 'whatsapp')).toBe(`${address}/curator/api/share/asset-1/whatsapp.mp4`);
    expect(musicUrl('/api/music/track')).toBe(`${address}/curator/api/music/track`);
  });
});

// Local Omarchy layer: a library with a Curator of its own names that one's port in its kioku-library.json
// (gallery/libraries); Main, with no file or with a file that names none, keeps port 2290 exactly as before.
describe("Curator's port, from the library's file", () => {
  /** Every address of Curator's files a page makes: a song, a video made ready for a chat app, a photo book, a film,
   * a highlight reel and a restored photo. */
  const files = () => [
    musicUrl('/api/music/a'),
    shareVideoUrl('asset-1', 'whatsapp'),
    bookFileUrl(41, 'book'),
    filmFileUrl(12),
    reelUrl(7),
    restoredUrl(7, 'after', 'jpg', 2560),
  ];
  const filesAt = (root: string) => [
    `${root}/api/music/a`,
    `${root}/api/share/asset-1/whatsapp.mp4`,
    `${root}/api/books/41/book.pdf`,
    `${root}/api/films/12/film.mp4`,
    `${root}/api/reels/7.mp4`,
    `${root}/api/restored/7/after.jpg?width=2560`,
  ];
  /** The page at this address, with Curator answering every call. */
  const at = (address: string) => {
    vi.stubGlobal('location', new URL(address));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const onPort = (port: number) => `${location.protocol}//${location.hostname}:${port}`;

  beforeEach(() => {
    resetLibraryContext();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetLibraryContext();
  });

  it.each([
    ['without a file', () => Promise.resolve()],
    ["with Main's file, which names no port", () => loadLibraryContext(serving(libraryContextFile(mainLibrary)))],
  ])('is 2290 in Main %s, for every call and file', async (_, load) => {
    await load();
    const fetchMock = at(mainLibrary.url);

    await curator.health();

    expect(curatorPort()).toBe(2290);
    expect(fetchMock).toHaveBeenCalledWith(
      `${onPort(2290)}/api/health`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(files()).toEqual(filesAt(onPort(2290)));
  });

  it('is the port a library with a Curator of its own names, for every call and file, never 2290', async () => {
    await loadLibraryContext(serving(secondWithCurator(2291)));
    const fetchMock = at(secondLibrary.url);

    await curator.health();

    expect(curatorPort()).toBe(2291);
    expect(fetchMock).toHaveBeenCalledWith(
      `${onPort(2291)}/api/health`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(files()).toEqual(filesAt(onPort(2291)));
    expect(files().some((address) => address.includes(':2290'))).toBe(false);
  });

  it("stays the page's own origin and /curator over HTTPS, whatever port the file names", async () => {
    await loadLibraryContext(serving(secondWithCurator(2291)));
    const address = 'https://second.example.ts.net:8443';
    const fetchMock = at(address);

    await curator.health();

    expect(fetchMock).toHaveBeenCalledWith(
      `${address}/curator/api/health`,
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(files()).toEqual(filesAt(`${address}/curator`));
  });

  it('makes no address at all where the file turns Curator off, though it names a port', async () => {
    await loadLibraryContext(serving({ ...libraryContextFile(secondLibrary), curatorPort: 2291 }));
    const fetchMock = at(secondLibrary.url);

    await expect(curator.health()).rejects.toMatchObject({ status: 0 });
    for (const build of [
      () => musicUrl('/api/music/a'),
      () => shareVideoUrl('asset-1', 'whatsapp'),
      () => bookFileUrl(41, 'book'),
      () => filmFileUrl(12),
      () => reelUrl(7),
      () => restoredUrl(7, 'after', 'jpg', 2560),
    ]) {
      expect(build).toThrow(CuratorError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
