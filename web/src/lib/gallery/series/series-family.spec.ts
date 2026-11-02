import fs from 'node:fs';
import path from 'node:path';
import {
  durationMs,
  enterFullscreen,
  familyDayKey,
  familyPage,
  filmAssets,
  keyOf,
  offersHomeScreen,
  putHomeScreenHintAway,
  type SeriesDay,
} from '../../../../memory-player/src/series/series-family';

// Local Omarchy layer: the family page's own facts (memory-player/src/series): its key from the address, the gateway's
// routes for it, a clip's length as the film reads it, the days said by the family's calendar, and a head that tells
// robots and link previews nothing. Synthetic ids only.

const PLAYER = path.resolve(process.cwd(), 'memory-player');

describe('keyOf', () => {
  it('reads the key from /days/<key>/, encoded for a path as the gateway takes it', () => {
    expect(keyOf('/days/abc-DEF_123/')).toBe('abc-DEF_123');
    expect(keyOf('/days/abc%2Fdef')).toBe('abc%2Fdef');
    expect(keyOf('/days/')).toBe('');
    expect(keyOf('/days/%E0%A4%A')).toBe('');
  });
});

describe('familyPage', () => {
  let asked: { path: string; init?: RequestInit }[];
  let status: number;

  beforeEach(() => {
    asked = [];
    status = 200;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      asked.push({ path: String(input), init });
      return Promise.resolve(status === 204 ? new Response(null, { status }) : Response.json({ ok: true }, { status }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the list and the days afresh, under the key’s own address', async () => {
    const page = familyPage('key-1');
    await expect(page.index()).resolves.toEqual({ data: { ok: true } });
    await page.index(14);
    await page.day(16);
    expect(asked.map(({ path, init }) => [path, init?.cache])).toEqual([
      ['/days/key-1/index', 'no-store'],
      ['/days/key-1/index?before=14', 'no-store'],
      ['/days/key-1/day/16', 'no-store'],
    ]);
  });

  it('says the page wants its password at 401, has ended at 404 and 410, and fails on anything else', async () => {
    const page = familyPage('key-1');
    status = 401;
    await expect(page.index()).resolves.toEqual({ state: 'password' });
    status = 404;
    await expect(page.day(3)).resolves.toEqual({ state: 'ended' });
    status = 410;
    await expect(page.index()).resolves.toEqual({ state: 'ended' });
    status = 502;
    await expect(page.index()).rejects.toThrow('502');
  });

  it('logs in with the password in the body: 204 lets it in, 401 does not', async () => {
    const page = familyPage('key-1');
    status = 204;
    await expect(page.login('riverton')).resolves.toBe(true);
    status = 401;
    await expect(page.login('harbour')).resolves.toBe(false);
    expect(asked[0]).toMatchObject({
      path: '/days/key-1/login',
      init: { method: 'POST', body: '{"password":"riverton"}' },
    });
  });

  it('gives each day’s photos, clips and songs their routes', () => {
    const page = familyPage('key-1');
    const media = page.media(16, () => 'image');
    expect(page.photo(16, 'cover id', 'thumbnail')).toBe(
      '/days/key-1/day/16/assets/cover%20id/thumbnail?size=thumbnail',
    );
    expect(media.preview('photo-a')).toBe('/days/key-1/day/16/assets/photo-a/thumbnail?size=preview');
    expect(media.thumbnail('photo-a')).toBe('/days/key-1/day/16/assets/photo-a/thumbnail?size=thumbnail');
    expect(media.video('clip-b')).toBe('/days/key-1/day/16/assets/clip-b/video');
    expect(media.music('/days/key-1/music/track-1')).toBe('/days/key-1/music/track-1');
  });
});

describe('durationMs', () => {
  it('reads a clip’s length as Gallery writes it, or as milliseconds', () => {
    expect(durationMs('0:00:12.500000')).toBe(12_500);
    expect(durationMs('1:02:03')).toBe(3_723_000);
    expect(durationMs('8000')).toBe(8000);
    expect(durationMs(4200)).toBe(4200);
    expect(durationMs(null)).toBeNull();
    expect(durationMs('')).toBeNull();
    expect(durationMs('0:00:00.000000')).toBeNull();
    expect(durationMs('soon')).toBeNull();
  });
});

describe('filmAssets', () => {
  it('hands the film the projection’s own fields only, a clip’s length in milliseconds', () => {
    const day = {
      assets: [
        {
          id: 'clip-b',
          type: 'VIDEO',
          width: 1920,
          height: 1080,
          duration: '0:00:08.000000',
          thumbhash: 'abc',
          localDateTime: '2018-03-01T00:00:00.000Z',
        },
      ],
    } as SeriesDay;
    expect(filmAssets(day)).toEqual([
      {
        id: 'clip-b',
        type: 'VIDEO',
        width: 1920,
        height: 1080,
        duration: 8000,
        thumbhash: 'abc',
        localDateTime: '2018-03-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('familyDayKey', () => {
  const saturday = new Date(2026, 9, 31, 7, 30);

  it('says today, also for a day the reader’s calendar has not reached, and yesterday; the date for the rest', () => {
    expect(familyDayKey('2026-10-31', saturday)).toBe('memory_series_today');
    expect(familyDayKey('2026-11-01', saturday)).toBe('memory_series_today');
    expect(familyDayKey('2026-10-30', saturday)).toBe('memory_series_yesterday');
    expect(familyDayKey('2026-10-29', saturday)).toBeUndefined();
  });
});

describe('the family page’s head', () => {
  const head = fs.readFileSync(path.join(PLAYER, 'days.html'), 'utf8');

  it('tells robots to stay away and sends no referrer, under its own title', () => {
    expect(head).toContain('<meta name="robots" content="noindex, nofollow, noarchive" />');
    expect(head).toContain('<meta name="referrer" content="no-referrer" />');
    expect(head).toContain('<title>From the beginning</title>');
    expect(head).toContain('<script type="module" src="/src/days.ts"></script>');
  });

  it('gives a link preview nothing: no image, no description', () => {
    expect(head).not.toMatch(/og:|twitter:|name="description"|<img|<link rel="(icon|preload)"/);
  });

  it('is built beside the shared memory’s page', () => {
    const config = fs.readFileSync(path.resolve(process.cwd(), 'vite.memory.config.ts'), 'utf8');
    expect(config).toContain("index: resolve(import.meta.dirname, 'memory-player/index.html')");
    expect(config).toContain("days: resolve(import.meta.dirname, 'memory-player/days.html')");
  });
});

describe('all of the screen', () => {
  const phone = (userAgent: string, standalone?: boolean) => ({ userAgent, standalone }) as unknown as Navigator;
  const iPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Safari/604.1';

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('offers the Home Screen only to an iPhone still in its browser', () => {
    expect(offersHomeScreen(phone(iPhone, false))).toBe(true);
    expect(offersHomeScreen(phone(iPhone, true))).toBe(false);
    expect(offersHomeScreen(phone('Mozilla/5.0 (Linux; Android 16) Chrome/140.0.0.0'))).toBe(false);
  });

  it('stops offering once put away', () => {
    putHomeScreenHintAway();
    expect(offersHomeScreen(phone(iPhone, false))).toBe(false);
  });

  it('asks for all of the screen where the browser has it, and goes on where it has not', () => {
    const root = document.documentElement;
    const asked = vi.fn(() => Promise.resolve());
    Object.defineProperty(root, 'requestFullscreen', { configurable: true, value: asked });
    enterFullscreen();
    expect(asked).toHaveBeenCalledOnce();
    Object.defineProperty(root, 'requestFullscreen', { configurable: true, value: undefined });
    expect(() => enterFullscreen()).not.toThrow();
    delete (root as { requestFullscreen?: unknown }).requestFullscreen;
  });
});
