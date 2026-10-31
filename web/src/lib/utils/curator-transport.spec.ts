import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { CURATOR_FEATURES, type CuratorFeature } from '$lib/gallery/libraries/library-file';
import {
  bookFileUrl,
  chatStream,
  curator,
  CuratorError,
  curatorPort,
  curatorSubject,
  filmFileUrl,
  musicUrl,
  reelUrl,
  restoredUrl,
  shareVideoUrl,
} from '$lib/utils/curator';
import {
  libraryContextFile,
  mainLibrary,
  SECOND_CURATOR_FEATURES,
  secondLibrary,
  secondOffering,
  secondWithCurator,
  secondWithout,
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

  it("makes no address in a library besides Main whose file turns Curator on but names no port: 2290 is Main's", async () => {
    await loadLibraryContext(serving(secondWithCurator()));
    const fetchMock = at(secondLibrary.url);

    await expect(curator.health()).rejects.toMatchObject({ status: 0 });
    expect(() => musicUrl('/api/music/a')).toThrow(CuratorError);
    expect(fetchMock).not.toHaveBeenCalled();
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

// Local Omarchy layer: a library's Curator that runs only some of Main's jobs lists what it offers (curatorFeatures,
// gallery/libraries). There no call, song, file or stream of anything else gets an address: each fails before any
// request, as when Curator is not answering, whatever asks. What every Curator answers is asked as before.
describe("Curator's features, from the library's file", () => {
  type Ask = () => unknown;
  const plan = { duration: 10, texts: [], music: [] } as never;
  const presentation = {} as never;
  /** every call the client makes, with what it is for (null: what every Curator answers) */
  const CALLS: Record<keyof typeof curator, [CuratorFeature | null, Ask]> = {
    personStacks: [null, () => curator.personStacks('person')],
    health: [null, () => curator.health()],
    inbox: ['inbox', () => curator.inbox()],
    group: ['inbox', () => curator.group('junk.scan:2026-10-29')],
    decide: [null, () => curator.decide([1], 'accept')],
    undo: [null, () => curator.undo([1])],
    reopen: [null, () => curator.reopen([1])],
    libraryHealth: ['inbox', () => curator.libraryHealth()],
    history: ['inbox', () => curator.history()],
    kinds: [null, () => curator.kinds()],
    jobs: [null, () => curator.jobs()],
    failedJobs: [null, () => curator.failedJobs()],
    startJob: [null, () => curator.startJob('junk.scan')],
    cancelJob: [null, () => curator.cancelJob(1)],
    nextLabels: ['inbox', () => curator.nextLabels('covers')],
    labelStats: ['inbox', () => curator.labelStats('covers')],
    ask: ['chat', () => curator.ask('when were we last at the sea?')],
    warmAsk: ['chat', () => curator.warmAsk()],
    memoryFacts: ['memories', () => curator.memoryFacts(['memory'])],
    memoryMusic: ['memories', () => curator.memoryMusic('memory')],
    memoryExpansion: ['memories', () => curator.memoryExpansion('memory')],
    story: ['memories', () => curator.story({ album: 'album' })],
    putLabel: ['inbox', () => curator.putLabel('covers', 'key', {})],
    suggestion: [null, () => curator.suggestion(1)],
    inpaint: ['restore', () => curator.inpaint('asset', 'data:image/png;base64,')],
    chats: ['chat', () => curator.chats()],
    chat: ['chat', () => curator.chat('conversation')],
    forgetChat: ['chat', () => curator.forgetChat('conversation')],
    liveEffect: ['live', () => curator.liveEffect('asset', 'loop')],
    saveFrame: ['live', () => curator.saveFrame('asset', 1.5)],
    adjust: ['live', () => curator.adjust('asset', {} as never)],
    overview: ['inbox', () => curator.overview()],
    duplicatesWithQr: [null, () => curator.duplicatesWithQr()],
    runTonightNow: ['inbox', () => curator.runTonightNow()],
    shareVideo: ['share', () => curator.shareVideo('asset', 'whatsapp')],
    pickBest: ['picks', () => curator.pickBest('stack')],
    makeBook: ['books', () => curator.makeBook({ year: 2025 })],
    book: ['books', () => curator.book(41)],
    shareMemory: ['memories', () => curator.shareMemory('memory', { linkId: 'link', key: 'key', presentation })],
    memoryShares: ['memories', () => curator.memoryShares()],
    forgetMemoryShare: ['memories', () => curator.forgetMemoryShare('memory', 'link')],
    saveFilm: ['memories', () => curator.saveFilm({ memoryId: 'memory', plan })],
    keepFilm: ['memories', () => curator.keepFilm(12)],
    film: ['memories', () => curator.film(12)],
    lookUp: ['chat', () => curator.lookUp('asset')],
    smartPreview: ['smart', () => curator.smartPreview({ search: {}, strictness: 'normal', filters: {} })],
    smartCreate: ['smart', () => curator.smartCreate('Selfies', { search: {}, strictness: 'normal', filters: {} })],
    smartUpdate: ['smart', () => curator.smartUpdate(3, { search: {}, strictness: 'normal', filters: {} })],
    smartForAlbum: ['smart', () => curator.smartForAlbum('album')],
    smartGet: ['smart', () => curator.smartGet(3)],
    smartStop: ['smart', () => curator.smartStop(3)],
    slips: ['slips', () => curator.slips()],
    setSlipsAuto: ['slips', () => curator.setSlipsAuto(true)],
  };
  /** and the requests and addresses it makes outside `curator` */
  const OTHERS: Record<string, [CuratorFeature | null, Ask]> = {
    curatorSubject: ['live', () => curatorSubject('asset')],
    chatStream: ['chat', () => chatStream(null, 'hello', () => {})],
    musicUrl: ['memories', () => musicUrl('/api/music/a')],
    shareVideoUrl: ['share', () => shareVideoUrl('asset-1', 'whatsapp')],
    bookFileUrl: ['books', () => bookFileUrl(41, 'book')],
    filmFileUrl: ['memories', () => filmFileUrl(12)],
    reelUrl: [null, () => reelUrl(7)],
    restoredUrl: [null, () => restoredUrl(7, 'after', 'jpg', 2560)],
  };
  const ALL = { ...CALLS, ...OTHERS };
  const ADDRESSES = new Set(['musicUrl', 'shareVideoUrl', 'bookFileUrl', 'filmFileUrl', 'reelUrl', 'restoredUrl']);

  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    resetLibraryContext();
    vi.stubGlobal('location', new URL(secondLibrary.url));
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('[]', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetLibraryContext();
  });

  /** whether `ask` asked Curator, or for an address made one: it never fails on its own otherwise */
  const asks = async (name: string, ask: Ask) => {
    fetchMock.mockClear();
    if (ADDRESSES.has(name)) {
      try {
        ask();
        return true;
      } catch (error) {
        expect(error, name).toBeInstanceOf(CuratorError);
        expect(error, name).toMatchObject({ status: 0 });
        return false;
      }
    }
    try {
      await ask();
    } catch (error) {
      expect(error, name).toBeInstanceOf(CuratorError);
    }
    return fetchMock.mock.calls.length > 0;
  };
  /** every call and address, and whether each asks Curator here */
  const asked = async () => {
    const found: Record<string, boolean> = {};
    for (const [name, [, ask]] of Object.entries(ALL)) {
      found[name] = await asks(name, ask);
    }
    return found;
  };
  const expected = (offers: (feature: CuratorFeature) => boolean) =>
    Object.fromEntries(Object.entries(ALL).map(([name, [feature]]) => [name, feature === null || offers(feature)]));

  it('names what every call of the client is for', () => {
    expect(Object.keys(CALLS).sort()).toEqual(Object.keys(curator).sort());
  });

  it.each(CURATOR_FEATURES)("asks nothing of %s where the library's Curator does not offer it", async (left) => {
    await loadLibraryContext(serving(secondWithout(left)));

    expect(await asked()).toEqual(expected((feature) => feature !== left));
  });

  it.each(CURATOR_FEATURES)(
    'asks for %s alone, beside what every Curator answers, where it is all its list names',
    async (only) => {
      await loadLibraryContext(serving(secondOffering([only])));

      expect(await asked()).toEqual(expected((feature) => feature === only));
    },
  );

  it("asks the second library's Curator for the AI inbox and Pick the best only, at its own port", async () => {
    await loadLibraryContext(serving(secondOffering(SECOND_CURATOR_FEATURES)));

    expect(await asked()).toEqual(expected((feature) => SECOND_CURATOR_FEATURES.includes(feature)));
    await curator.pickBest('stack');
    expect(fetchMock).toHaveBeenCalledWith(
      `${location.protocol}//${location.hostname}:2291/api/stacks/stack/best`,
      expect.anything(),
    );
    fetchMock.mockClear();
    await expect(curator.ask('when?')).rejects.toMatchObject({ status: 0 });
    await expect(curator.liveEffect('asset', 'loop')).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['without a file', () => Promise.resolve()],
    ["with Main's file, which lists none", () => loadLibraryContext(serving(libraryContextFile(mainLibrary)))],
    ['with a library whose Curator lists none', () => loadLibraryContext(serving(secondWithCurator(2291)))],
  ])('asks for everything %s, as before', async (_, load) => {
    await load();

    expect(await asked()).toEqual(expected(() => true));
  });
});
