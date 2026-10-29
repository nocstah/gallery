/* eslint-disable unicorn/prefer-https -- a library's address is http on this computer's own names, and the checks below
   refuse the other kinds by example */
import type { MockInstance } from 'vitest';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import {
  currentLibrary,
  isMainLibrary,
  libraries,
  libraryHas,
  listsSeveralLibraries,
  loadLibraryContext,
  otherLibraries,
  resetLibraryContext,
  whenLibraryKnown,
} from './library-context.svelte';
import { LIBRARY_CONTEXT_URL, libraryAddress, MalformedLibraryContext, parseLibraryContext } from './library-file';

// Local Omarchy layer: which library a Kioku page is in comes from one static file in that library's web root. Without
// a file, or with one that does not load or does not hold what it should, Kioku is the one library it always was.

const second = () => libraryContextFile(secondLibrary);

const answer = (body: BodyInit | null, init: ResponseInit = {}) =>
  vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(body, init)));
const file = (data: unknown) =>
  answer(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

const expectOneLibrary = () => {
  expect(currentLibrary()).toBeUndefined();
  expect(isMainLibrary()).toBe(true);
  expect(libraryHas('curator')).toBe(true);
  expect(libraryHas('specialAlbums')).toBe(true);
  expect(libraryHas('vaults')).toBe(true);
  expect(libraries()).toEqual([]);
  expect(listsSeveralLibraries()).toBe(false);
};

describe('the library context', () => {
  let warn: MockInstance;

  beforeEach(() => {
    resetLibraryContext();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
    resetLibraryContext();
  });

  it('is one library with every feature before anything is read', () => {
    expectOneLibrary();
  });

  it('reads its file once, same-origin and past every cache, and says which library this is', async () => {
    const fetchMock = file(second());
    await loadLibraryContext(fetchMock);
    await loadLibraryContext(fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      LIBRARY_CONTEXT_URL,
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    );
    expect(LIBRARY_CONTEXT_URL).toBe('/kioku-library.json');
    expect(currentLibrary()).toEqual({ id: 'second', name: 'Second', colour: '#3d7fa6' });
    expect(isMainLibrary()).toBe(false);
    expect(libraryHas('curator')).toBe(false);
    expect(libraryHas('specialAlbums')).toBe(false);
    expect(libraryHas('vaults')).toBe(false);
    expect(libraries().map(({ id }) => id)).toEqual(['main', 'second']);
    expect(otherLibraries()).toEqual([mainLibrary]);
    expect(listsSeveralLibraries()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads Main's file as Main, with every feature its file offers", async () => {
    await loadLibraryContext(serving(libraryContextFile(mainLibrary)));

    expect(isMainLibrary()).toBe(true);
    expect(currentLibrary()?.name).toBe('Main');
    expect(libraryHas('curator')).toBe(true);
    expect(libraryHas('vaults')).toBe(true);
    expect(otherLibraries()).toEqual([secondLibrary]);
  });

  it.each([
    ['a missing file', () => answer(null, { status: 404 })],
    ["the server refusing JSON for a page it doesn't have", () => answer('', { status: 406 })],
    [
      "the app's own page in the file's place",
      () => answer('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
    ],
  ])('is one library with every feature, quietly, for %s', async (_, reply) => {
    await loadLibraryContext(reply());

    expectOneLibrary();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['the request failing', () => vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))],
    ['the server failing', () => answer('oops', { status: 500 })],
  ])('is one library with every feature, with a warning, for %s', async (_, reply) => {
    await loadLibraryContext(reply());

    expectOneLibrary();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  const malformed: [string, unknown][] = [
    ['an array', [second()]],
    ['a string', 'second'],
    ['null', null],
    ['version 2', { ...second(), version: 2 }],
    ['the version as a string', { ...second(), version: '1' }],
    ['no version', { ...second(), version: undefined }],
    ['no id', { ...second(), id: undefined }],
    ['an id with capitals', { ...second(), id: 'Second' }],
    ['an id with a slash', { ...second(), id: 'second/../main' }],
    ['an empty name', { ...second(), name: '  ' }],
    ['a name too long', { ...second(), name: 'S'.repeat(41) }],
    ['a name with a control character', { ...second(), name: 'Sec\u{0}ond' }],
    ['a name with a direction override', { ...second(), name: 'Sec\u{202E}ond' }],
    ['a colour by name', { ...second(), colour: 'blue' }],
    ['a short colour', { ...second(), colour: '#38a' }],
    ['a colour with more CSS in it', { ...second(), colour: '#3d7fa6; background: url(x)' }],
    ['main as a string', { ...second(), main: 'false' }],
    ['no main', { ...second(), main: undefined }],
    ['no features', { ...second(), features: undefined }],
    ['features as a list', { ...second(), features: ['curator'] }],
    ['a feature left out', { ...second(), features: { specialAlbums: false, vaults: false } }],
    [
      'a feature neither true nor false',
      { ...second(), features: { curator: 'no', specialAlbums: false, vaults: false } },
    ],
    ['no libraries', { ...second(), libraries: undefined }],
    ['libraries as an object', { ...second(), libraries: { main: mainLibrary.url } }],
  ];

  it.each(malformed)('ignores a file with %s, as one library with every feature, with a warning', async (_, data) => {
    await loadLibraryContext(file(data));

    expectOneLibrary();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('malformed');
  });

  it('ignores a file that is not JSON, with a warning', async () => {
    await loadLibraryContext(answer('{"version": 1,', { headers: { 'content-type': 'application/json' } }));

    expectOneLibrary();
    expect(String(warn.mock.calls[0][0])).toContain('malformed');
  });

  it('names what a malformed file lacks', () => {
    expect(() => parseLibraryContext({ ...second(), colour: 'red' }, vi.fn())).toThrow(MalformedLibraryContext);
    expect(() => parseLibraryContext({ ...second(), colour: 'red' }, vi.fn())).toThrow('colour');
    expect(() => parseLibraryContext({ ...second(), features: { curator: true } }, vi.fn())).toThrow(
      'features.specialAlbums',
    );
  });

  it('leaves out a listed library that fails its checks, or repeats an id, and keeps the rest', () => {
    const dropped = vi.fn();
    const context = parseLibraryContext(
      {
        ...second(),
        libraries: [
          mainLibrary,
          { id: 'away', name: 'Away', url: 'https://photos.example.com', colour: '#112233' },
          { id: 'cleanup', name: 'Cleanup', url: 'http://cleanup.localhost:2287', colour: 'teal' },
          { id: 'Bad Id', name: 'Bad', url: 'http://bad.localhost:2288', colour: '#112233' },
          { id: 'main', name: 'Main again', url: 'http://main.localhost:2289', colour: '#112233' },
          'http://loose.localhost:2290',
          { id: 'second', name: 'Second', url: 'http://second.localhost:2286/photos?asset=1', colour: '#3D7FA6' },
        ],
      },
      dropped,
    );

    expect(context.libraries).toEqual([mainLibrary, secondLibrary]);
    expect(dropped).toHaveBeenCalledTimes(5);
  });

  it('keeps at most 16 libraries', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `library-${index}`,
      name: `Library ${index}`,
      url: `http://library-${index}.localhost:${3000 + index}`,
      colour: '#112233',
    }));
    const context = parseLibraryContext({ ...second(), libraries: many }, vi.fn());

    expect(context.libraries).toHaveLength(16);
  });

  it("never reads a file in a vault's Gallery, which shows none of this", async () => {
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    const fetchMock = file(second());
    await loadLibraryContext(fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
    expectOneLibrary();
  });

  it('runs what waits for the context once it is read, and at once afterwards', async () => {
    const early = vi.fn(() => expect(libraryHas('curator')).toBe(false));
    whenLibraryKnown(early);
    expect(early).not.toHaveBeenCalled();

    await loadLibraryContext(file(second()));
    expect(early).toHaveBeenCalledTimes(1);

    const late = vi.fn();
    whenLibraryKnown(late);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('runs what waits even when nothing could be read, and survives a hook that fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(() => {
      throw new Error('broken hook');
    });
    const next = vi.fn();
    whenLibraryKnown(failing);
    whenLibraryKnown(next);

    await expect(loadLibraryContext(answer(null, { status: 404 }))).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('libraryAddress', () => {
  it.each([
    ['http://kioku.localhost:2283', 'http://kioku.localhost:2283'],
    ['http://second.localhost:2286/', 'http://second.localhost:2286'],
    ['https://second.localhost:2286/photos?asset=1#top', 'https://second.localhost:2286'],
    ['HTTP://Second.LOCALHOST:2286', 'http://second.localhost:2286'],
    ['http://cleanup.second.localhost', 'http://cleanup.second.localhost'],
    ['http://localhost:2286', 'http://localhost:2286'],
    ['http://127.0.0.1:2286', 'http://127.0.0.1:2286'],
    ['http://[::1]:2286', 'http://[::1]:2286'],
  ])('takes %s, by its origin alone', (value, origin) => {
    expect(libraryAddress(value)).toBe(origin);
  });

  it.each([
    'https://photos.example.com',
    'http://second.localhost.example.com:2286',
    'http://localhost.example.com:2286',
    'http://example.com/.localhost',
    'http://second.localhost.:2286',
    'http://.localhost:2286',
    'http://192.0.2.10:2283',
    'http://100.64.0.1:2283',
    'http://0.0.0.0:2283',
    'http://127.0.0.2:2283',
    'http://user:secret@second.localhost:2286',
    'http://user@second.localhost:2286',
    'ftp://second.localhost:2286',
    'ws://second.localhost:2286',
    'file:///home',
    'javascript:alert(1)',
    'data:text/html,<p>hi</p>',
    '//second.localhost:2286',
    '/photos',
    'second.localhost:2286',
    '',
  ])('refuses %s, which is not an address on this computer', (value) => {
    expect(libraryAddress(value)).toBeUndefined();
  });

  it.each([undefined, null, 2286, {}, ['http://localhost:2286']])('refuses %s, which is no address at all', (value) => {
    expect(libraryAddress(value)).toBeUndefined();
  });
});
