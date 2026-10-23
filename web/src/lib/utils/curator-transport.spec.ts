import { curator, filmFileUrl, musicUrl, shareVideoUrl } from '$lib/utils/curator';

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
