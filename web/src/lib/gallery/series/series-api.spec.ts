import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { CuratorError } from '$lib/utils/curator';
import { secondWithout, serving } from '@test-data/factories/library-context-factory';
import { seriesApi, seriesFailure } from './series-api';

// Local Omarchy layer: Curator's series routes as the web asks them (gallery/series): the method, the path under
// Curator's /api, the body, and the session cookie on every one. A memory's key goes in the body or the query, never
// in a path. A stand-in Curator answers through fetch. Synthetic ids and keys only.

type Asked = { method: string; path: string; body?: unknown; credentials?: RequestCredentials };
let asked: Asked[];
let answer: (request: Asked) => Response;

beforeEach(() => {
  resetLibraryContext();
  asked = [];
  answer = () => Response.json({});
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      credentials: init?.credentials,
    };
    asked.push(request);
    return Promise.resolve(answer(request));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetLibraryContext();
});

describe('seriesApi', () => {
  it('asks for every series and for one, plans one of the library or of a smart album, and changes it', async () => {
    await seriesApi.list();
    await seriesApi.one(7);
    await seriesApi.create();
    await seriesApi.create({ smart_album_id: 4, span_from: '2003-03-01', span_to: '2010-12-31' });
    await seriesApi.update(7, { people_without: ['person-anna', 'person-ben'] });
    await seriesApi.update(7, { name: 'Summers at the lake' });
    await seriesApi.coming(7);
    await seriesApi.remove(7);
    await seriesApi.smartAlbums();
    expect(asked).toEqual([
      { method: 'GET', path: '/api/series', credentials: 'include' },
      { method: 'GET', path: '/api/series/7', credentials: 'include' },
      { method: 'POST', path: '/api/series', body: {}, credentials: 'include' },
      {
        method: 'POST',
        path: '/api/series',
        body: { smart_album_id: 4, span_from: '2003-03-01', span_to: '2010-12-31' },
        credentials: 'include',
      },
      {
        method: 'PATCH',
        path: '/api/series/7',
        body: { people_without: ['person-anna', 'person-ben'] },
        credentials: 'include',
      },
      { method: 'PATCH', path: '/api/series/7', body: { name: 'Summers at the lake' }, credentials: 'include' },
      { method: 'GET', path: '/api/series/7/coming', credentials: 'include' },
      { method: 'DELETE', path: '/api/series/7', credentials: 'include' },
      { method: 'GET', path: '/api/smart-albums', credentials: 'include' },
    ]);
  });

  it('sends a memory’s key in the body or the query, never in a path', async () => {
    const key = 'trip:12#2';
    await seriesApi.skip(7, key);
    await seriesApi.restore(7, key);
    await seriesApi.repick(7, key);
    await seriesApi.candidates(7, key);
    await seriesApi.swap(7, key, 'photo-out', 'photo-in');
    expect(asked.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'POST', path: '/api/series/7/skip', body: { key } },
      { method: 'POST', path: '/api/series/7/restore', body: { key } },
      { method: 'POST', path: '/api/series/7/repick', body: { key } },
      { method: 'GET', path: '/api/series/7/candidates?key=trip%3A12%232', body: undefined },
      { method: 'POST', path: '/api/series/7/swap', body: { key, out: 'photo-out', in: 'photo-in' } },
    ]);
    expect(asked.every(({ path }) => !path.split('?', 1)[0].includes('trip'))).toBe(true);
  });

  it('asks for the family page’s routes: day 1, the link’s photos, its bind and its forgetting, and what went out', async () => {
    const key = 'trip:12#2';
    await seriesApi.dayOne(7, '2026-11-02');
    await seriesApi.linkPhotos(7);
    await seriesApi.bindLink(7, 'link-1', 'key-1');
    await seriesApi.forgetLink(7, 'link-1');
    await seriesApi.sent(7);
    await seriesApi.takeOff(7, key);
    await seriesApi.putBack(7, key);
    expect(asked).toEqual([
      { method: 'POST', path: '/api/series/7/day1', body: { day: '2026-11-02' }, credentials: 'include' },
      { method: 'GET', path: '/api/series/7/link-photos', credentials: 'include' },
      { method: 'POST', path: '/api/series/7/link', body: { linkId: 'link-1', key: 'key-1' }, credentials: 'include' },
      { method: 'DELETE', path: '/api/series/7/link/link-1', credentials: 'include' },
      { method: 'GET', path: '/api/series/7/sent', credentials: 'include' },
      { method: 'POST', path: '/api/series/7/takeoff', body: { key }, credentials: 'include' },
      { method: 'POST', path: '/api/series/7/putback', body: { key }, credentials: 'include' },
    ]);
  });

  it('fails with Curator’s own words, or as not answering', async () => {
    answer = () => Response.json({ detail: 'The span ends before it starts' }, { status: 400 });
    await expect(seriesApi.create({ span_from: '2010-01-01', span_to: '2003-01-01' })).rejects.toMatchObject({
      message: 'The span ends before it starts',
      status: 400,
    });

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const offline = await seriesApi.list().catch((error: unknown) => error);
    expect(offline).toBeInstanceOf(CuratorError);
    expect(offline).toMatchObject({ status: 0 });
  });

  it('asks nothing in a library whose Curator does not offer what it adds to memories', async () => {
    await loadLibraryContext(serving(secondWithout('memories')));
    await expect(seriesApi.list()).rejects.toMatchObject({ status: 0 });
    expect(asked).toEqual([]);
  });

  it('asks for no smart albums in a library whose Curator keeps none', async () => {
    await loadLibraryContext(serving(secondWithout('smart')));
    await expect(seriesApi.smartAlbums()).rejects.toMatchObject({ status: 0 });
    expect(asked).toEqual([]);
  });
});

describe('seriesFailure', () => {
  it('says Curator’s words, and that it is not answering in the page’s own', () => {
    expect(seriesFailure(new CuratorError('This memory went out already', 409))).toBe('This memory went out already');
    expect(seriesFailure(new CuratorError('Curator is not answering', 0))).toBe('ai_inbox_offline_title');
    expect(seriesFailure(new Error('Something else'))).toBe('Something else');
  });
});
