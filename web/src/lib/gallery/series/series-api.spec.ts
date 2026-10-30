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
  it('asks for the series, plans one with Curator’s name or the one given, and changes it', async () => {
    await seriesApi.list();
    await seriesApi.create();
    await seriesApi.create('From the beginning');
    await seriesApi.update(7, { people_without: ['person-anna', 'person-ben'] });
    await seriesApi.coming(7);
    expect(asked).toEqual([
      { method: 'GET', path: '/api/series', credentials: 'include' },
      { method: 'POST', path: '/api/series', body: {}, credentials: 'include' },
      { method: 'POST', path: '/api/series', body: { name: 'From the beginning' }, credentials: 'include' },
      {
        method: 'PATCH',
        path: '/api/series/7',
        body: { people_without: ['person-anna', 'person-ben'] },
        credentials: 'include',
      },
      { method: 'GET', path: '/api/series/7/coming', credentials: 'include' },
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

  it('fails with Curator’s own words, or as not answering', async () => {
    answer = () => Response.json({ detail: 'A series exists already' }, { status: 409 });
    await expect(seriesApi.create()).rejects.toMatchObject({ message: 'A series exists already', status: 409 });

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
});

describe('seriesFailure', () => {
  it('says Curator’s words, and that it is not answering in the page’s own', () => {
    expect(seriesFailure(new CuratorError('This memory went out already', 409))).toBe('This memory went out already');
    expect(seriesFailure(new CuratorError('Curator is not answering', 0))).toBe('ai_inbox_offline_title');
    expect(seriesFailure(new Error('Something else'))).toBe('Something else');
  });
});
