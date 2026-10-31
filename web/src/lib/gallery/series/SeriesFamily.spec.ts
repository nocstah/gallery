import { SharedLinkType, type SharedLinkCreateDto, type SharedLinkResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { comingDays, dayFromToday, sentMemory, seriesCard } from '@test-data/factories/series-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import SeriesPage from './SeriesPage.svelte';
import type { Coming, SentMemory } from './series-api';

// Local Omarchy layer: the family page in Coming up (gallery/series), against a stand-in Curator and a stand-in
// Gallery: the family link made with the owner's session (day 1 first, the photos Curator names, then Curator's bind,
// which takes a refused link straight back), with and without a password; New link and Turn off, in Gallery first and
// then in Curator; day 1 saved as it is chosen; what went out, taken off and put back; the quiet line and its notes;
// and the days asked for again after every change. Every word is an i18n key (the specs render the 'dev' locale).
// Synthetic names, places and ids only.

const mocks = vi.hoisted(() => ({
  auth: {
    authenticated: true,
    isSharedLink: false,
    user: { id: 'owner-id', isAdmin: true },
    params: {},
    preferences: { memories: { enabled: true, duration: 6 } },
  },
  show: vi.fn(),
  showDialog: vi.fn(),
  getAssetInfo: vi.fn(),
  getPerson: vi.fn(),
  createSharedLink: vi.fn(),
  removeSharedLink: vi.fn(),
  getAllSharedLinks: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/managers/server-config-manager.svelte', () => ({
  serverConfigManager: { value: { externalDomain: 'https://photos.example' } },
}));
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: stub } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: stub };
});
vi.mock('$lib/components/memories/film/MemoryFilm.svelte', async () => {
  const { default: stub } = await import('./memory-film.test-wrapper.svelte');
  return { default: stub };
});
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: mocks.show, showDialog: mocks.showDialog },
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getAssetInfo: mocks.getAssetInfo,
  getPerson: mocks.getPerson,
  createSharedLink: mocks.createSharedLink,
  removeSharedLink: mocks.removeSharedLink,
  getAllSharedLinks: mocks.getAllSharedLinks,
  isHttpError: (error: unknown) => typeof (error as { status?: unknown })?.status === 'number',
}));

type Asked = { method: string; path: string; body?: Record<string, unknown> };
let asked: Asked[];
let coming: Coming;
let sent: SentMemory[];
/** the links the stand-in Gallery holds */
let gallery: SharedLinkResponseDto[];
let bindRefusal: string | undefined;
let bindStatus: number;

const link = (overrides: Partial<SharedLinkResponseDto> = {}) =>
  sharedLinkFactory.build({
    id: 'link-1',
    key: 'key-1',
    type: SharedLinkType.Individual,
    description: 'From the beginning',
    password: null,
    expiresAt: null,
    allowDownload: false,
    allowUpload: false,
    showMetadata: false,
    slug: null,
    ...overrides,
  });

const live = (overrides: Partial<Coming> = {}) =>
  comingDays({
    provisional: false,
    live: true,
    link_id: 'link-1',
    series: seriesCard({ state: 'on', starts_on: dayFromToday(-5) }),
    sent_count: 5,
    ...overrides,
  });

const answer = ({ method, path, body }: Asked): Response => {
  if (path === '/api/series/7/coming') {
    return Response.json(coming);
  }
  if (path === '/api/series/7/day1') {
    coming = { ...coming, series: { ...coming.series, starts_on: String(body?.day) } };
    return Response.json({ series: coming.series });
  }
  if (path === '/api/series/7/link-photos') {
    return Response.json({ photos: ['photo-1', 'photo-3'] });
  }
  if (path === '/api/series/7/link') {
    if (bindRefusal) {
      return Response.json({ detail: bindRefusal }, { status: bindStatus });
    }
    const replaced = coming.link_id;
    coming = { ...coming, link_id: String(body?.linkId), live: !!coming.series.starts_on };
    return Response.json({ series: coming.series, replaced });
  }
  const forget = /^\/api\/series\/7\/link\/(.+)$/.exec(path);
  if (forget && method === 'DELETE') {
    if (gallery.some(({ id }) => id === forget[1])) {
      return Response.json({ detail: 'Gallery still has this link' }, { status: 409 });
    }
    if (coming.link_id === forget[1]) {
      coming = { ...coming, link_id: null, live: false };
    }
    return Response.json({ forgotten: true });
  }
  if (path === '/api/series/7/sent') {
    return Response.json({ memories: sent });
  }
  if (path === '/api/series/7/takeoff' || path === '/api/series/7/putback') {
    const state = path.endsWith('takeoff') ? 'withdrawn' : 'sent';
    sent = sent.map((memory) => (memory.key === body?.key ? { ...memory, state } : memory));
    return Response.json({ ok: true });
  }
  return Response.json({ detail: 'Not Found' }, { status: 404 });
};

const writeText = vi.fn();

beforeEach(() => {
  asked = [];
  coming = comingDays();
  sent = [];
  gallery = [];
  bindRefusal = undefined;
  bindStatus = 400;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    asked.push(request);
    return Promise.resolve(answer(request));
  });
  mocks.getPerson.mockResolvedValue({ id: 'person', name: '', updatedAt: '2026-10-01T00:00:00Z' });
  mocks.getAssetInfo.mockImplementation(({ id }: { id: string }) => Promise.resolve({ id, type: 'IMAGE' }));
  mocks.showDialog.mockResolvedValue(true);
  mocks.show.mockResolvedValue(undefined);
  mocks.getAllSharedLinks.mockImplementation(({ id }: { id?: string }) =>
    Promise.resolve(gallery.filter((held) => held.id === id)),
  );
  mocks.createSharedLink.mockImplementation(({ sharedLinkCreateDto }: { sharedLinkCreateDto: SharedLinkCreateDto }) => {
    const made = link({ id: 'link-new', key: 'key-new', password: sharedLinkCreateDto.password ?? null });
    gallery = [...gallery, made];
    return Promise.resolve(made);
  });
  mocks.removeSharedLink.mockImplementation(({ id }: { id: string }) => {
    if (gallery.every((held) => held.id !== id)) {
      return Promise.reject({ status: 404, data: { message: 'Shared link not found', statusCode: 404 } });
    }
    gallery = gallery.filter((held) => held.id !== id);
    return Promise.resolve('');
  });
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const comingAsked = () => asked.filter(({ path }) => path === '/api/series/7/coming').length;
const curatorWrites = () => asked.filter(({ method }) => method !== 'GET');
const show = () => render(SeriesPage, { props: { title: 'memory_series_title', seriesId: 7 } });
const family = async () => {
  const section = await screen.findByTestId('series-family');
  await waitFor(() => expect(within(section).queryAllByRole('button').length).toBeGreaterThan(0));
  return section;
};
const passwordSwitch = (section: HTMLElement) =>
  within(section).getByRole('switch', { name: 'memory_series_password_ask' });

describe('the family page before it is made', () => {
  it('says what the family gets, with day 1 from tomorrow on, a password asked for, and one action', async () => {
    show();
    const section = await family();
    expect(section).toHaveAttribute('data-state', 'before');
    expect(within(section).getByRole('heading', { name: 'memory_series_family_page' })).toBeInTheDocument();
    expect(within(section).getByTestId('series-family-words')).toHaveTextContent('memory_series_family_about');

    const dayOne = within(section).getByLabelText('memory_series_day_one');
    expect(dayOne).toHaveValue(dayFromToday(1));
    expect(dayOne).toHaveAttribute('min', dayFromToday(0));
    expect(passwordSwitch(section)).toHaveAttribute('aria-checked', 'true');
    expect(within(section).getByLabelText('password')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'memory_series_link_make' })).toBeEnabled();
    expect(mocks.getAllSharedLinks).not.toHaveBeenCalled();
  });

  it('makes the family link with a password: day 1, the photos Curator names, then Curator binds it', async () => {
    show();
    const section = await family();
    await fireEvent.input(within(section).getByLabelText('password'), { target: { value: 'riverton' } });
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_make' }));

    await waitFor(() => expect(section).toHaveAttribute('data-state', 'live'));
    expect(mocks.createSharedLink).toHaveBeenCalledExactlyOnceWith({
      sharedLinkCreateDto: {
        type: SharedLinkType.Individual,
        assetIds: ['photo-1', 'photo-3'],
        description: 'From the beginning',
        expiresAt: null,
        password: 'riverton',
        allowUpload: false,
        allowDownload: false,
        showMetadata: false,
      },
    });
    expect(curatorWrites()).toEqual([
      { method: 'POST', path: '/api/series/7/day1', body: { day: dayFromToday(1) } },
      { method: 'POST', path: '/api/series/7/link', body: { linkId: 'link-new', key: 'key-new' } },
    ]);
    // the photos were asked for after day 1 and before the bind, and the days again after it
    const order = asked.map(({ method, path }) => `${method} ${path}`);
    expect(order.indexOf('GET /api/series/7/link-photos')).toBeGreaterThan(order.indexOf('POST /api/series/7/day1'));
    expect(order.indexOf('GET /api/series/7/link-photos')).toBeLessThan(order.indexOf('POST /api/series/7/link'));
    expect(order.lastIndexOf('GET /api/series/7/coming')).toBeGreaterThan(order.indexOf('POST /api/series/7/link'));
    expect(await within(section).findByTestId('series-family-address')).toHaveTextContent(
      'https://photos.example/share/key-new',
    );
  });

  it('makes it without a password once the switch is off', async () => {
    show();
    const section = await family();
    await fireEvent.click(passwordSwitch(section));
    await waitFor(() => expect(within(section).queryByLabelText('password')).not.toBeInTheDocument());
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_make' }));

    await waitFor(() => expect(mocks.createSharedLink).toHaveBeenCalledOnce());
    expect(mocks.createSharedLink.mock.calls[0][0].sharedLinkCreateDto.password).toBeUndefined();
  });

  it('asks for the password before anything is made while the switch is on', async () => {
    show();
    const section = await family();
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_make' }));

    expect(within(section).getByRole('alert')).toHaveTextContent('memory_series_password_missing');
    expect(curatorWrites()).toEqual([]);
    expect(mocks.createSharedLink).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'A family link must not have an end date'],
    // a link another series' family page has
    [409, "That link is another family page's; make a new one for this series"],
  ])(
    'takes the new link back when Curator will not bind it (%i), and says why in Curator’s words',
    async (status, words) => {
      bindStatus = status;
      bindRefusal = words;
      show();
      const section = await family();
      await fireEvent.click(passwordSwitch(section));
      await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_make' }));

      expect(await screen.findByTestId('series-message')).toHaveTextContent(words);
      expect(mocks.removeSharedLink).toHaveBeenCalledExactlyOnceWith({ id: 'link-new' });
      expect(gallery).toEqual([]);
      expect(section).toHaveAttribute('data-state', 'before');
    },
  );

  it('says so when Gallery cannot make the link, and asks Curator to bind nothing', async () => {
    mocks.createSharedLink.mockRejectedValueOnce(new Error('Gallery is down'));
    show();
    const section = await family();
    await fireEvent.click(passwordSwitch(section));
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_make' }));

    expect(await screen.findByTestId('series-message')).toHaveTextContent('memory_share_link_failed');
    expect(asked.some(({ path }) => path === '/api/series/7/link')).toBe(false);
  });

  it('saves day 1 as it is chosen, then asks for the days again', async () => {
    show();
    const section = await family();
    const before = comingAsked();
    await fireEvent.change(within(section).getByLabelText('memory_series_day_one'), {
      target: { value: dayFromToday(3) },
    });

    await waitFor(() => expect(comingAsked()).toBe(before + 1));
    expect(curatorWrites()).toEqual([{ method: 'POST', path: '/api/series/7/day1', body: { day: dayFromToday(3) } }]);
    expect(within(section).getByLabelText('memory_series_day_one')).toHaveValue(dayFromToday(3));

    // a day already set is not set again when the link is made
    await fireEvent.click(passwordSwitch(section));
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_make' }));
    await waitFor(() => expect(section).toHaveAttribute('data-state', 'live'));
    expect(curatorWrites().filter(({ path }) => path.endsWith('/day1'))).toHaveLength(1);
  });
});

describe('the family page while it is live', () => {
  beforeEach(() => {
    coming = live();
    gallery = [link({ password: 'riverton' })];
  });

  it('shows its address as the Share sheets give it out, and copies it', async () => {
    show();
    const section = await family();
    expect(section).toHaveAttribute('data-state', 'live');
    const address = await within(section).findByTestId('series-family-address');
    expect(address).toHaveTextContent('https://photos.example/share/key-1');
    expect(mocks.getAllSharedLinks).toHaveBeenCalledWith({ id: 'link-1' });

    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://photos.example/share/key-1'));
    expect(await within(section).findByRole('button', { name: 'memory_series_link_copied' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'memory_series_link_new' })).toBeEnabled();
    expect(within(section).getByRole('button', { name: 'memory_series_turn_off' })).toBeEnabled();
  });

  it('says in its quiet line since when it is live and how much went out, or when it starts', async () => {
    const { unmount } = show();
    const status = await screen.findByTestId('series-status');
    expect(within(status).getByTestId('series-live')).toHaveTextContent('memory_series_live_since');
    expect(status).not.toHaveTextContent('memory_series_provisional');
    unmount();

    coming = live({ series: seriesCard({ state: 'on', starts_on: dayFromToday(2) }), sent_count: 0 });
    const ahead = show();
    expect(await screen.findByTestId('series-live')).toHaveTextContent('memory_series_starts_on');
    ahead.unmount();

    // day 1 is today, and its memory has not gone out yet
    coming = live({ series: seriesCard({ state: 'on', starts_on: dayFromToday(0) }), sent_count: 0 });
    show();
    expect(await screen.findByTestId('series-live')).toHaveTextContent('memory_series_starts_on');
  });

  it('New link makes the next one with the same password, then turns the old one off in Gallery and in Curator', async () => {
    show();
    const section = await family();
    await within(section).findByTestId('series-family-address');
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_new' }));

    await waitFor(() =>
      expect(within(section).getByTestId('series-family-address')).toHaveTextContent(
        'https://photos.example/share/key-new',
      ),
    );
    expect(mocks.createSharedLink).toHaveBeenCalledOnce();
    expect(mocks.createSharedLink.mock.calls[0][0].sharedLinkCreateDto).toMatchObject({
      type: SharedLinkType.Individual,
      assetIds: ['photo-1', 'photo-3'],
      password: 'riverton',
      expiresAt: null,
      allowDownload: false,
      showMetadata: false,
    });
    expect(mocks.removeSharedLink).toHaveBeenCalledExactlyOnceWith({ id: 'link-1' });
    expect(curatorWrites()).toEqual([
      { method: 'POST', path: '/api/series/7/link', body: { linkId: 'link-new', key: 'key-new' } },
      { method: 'DELETE', path: '/api/series/7/link/link-1' },
    ]);
    expect(gallery.map(({ id }) => id)).toEqual(['link-new']);
    expect(mocks.showDialog).not.toHaveBeenCalled();
  });

  it('Turn off asks first, then deletes the link in Gallery and has Curator forget it', async () => {
    show();
    const section = await family();
    await within(section).findByTestId('series-family-address');
    mocks.showDialog.mockResolvedValueOnce(false);
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_turn_off' }));
    await waitFor(() => expect(mocks.showDialog).toHaveBeenCalledOnce());
    expect(mocks.showDialog).toHaveBeenCalledWith({
      title: 'memory_series_turn_off_title',
      prompt: 'memory_series_turn_off_prompt',
      confirmText: 'memory_series_turn_off',
    });
    expect(mocks.removeSharedLink).not.toHaveBeenCalled();

    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_turn_off' }));
    await waitFor(() => expect(section).toHaveAttribute('data-state', 'off'));
    expect(mocks.removeSharedLink).toHaveBeenCalledExactlyOnceWith({ id: 'link-1' });
    expect(curatorWrites()).toEqual([{ method: 'DELETE', path: '/api/series/7/link/link-1' }]);
    expect(within(section).getByTestId('series-family-words')).toHaveTextContent('memory_series_family_off');
    expect(within(section).getByRole('button', { name: 'memory_series_link_make_new' })).toBeInTheDocument();
    expect(within(section).queryByLabelText('memory_series_day_one')).not.toBeInTheDocument();
  });

  it('keeps the page and says so when Gallery cannot turn it off; Curator is not asked', async () => {
    mocks.removeSharedLink.mockRejectedValueOnce(new Error('Gallery is down'));
    show();
    const section = await family();
    await within(section).findByTestId('series-family-address');
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_turn_off' }));

    expect(await screen.findByTestId('series-message')).toHaveTextContent('memory_share_turn_off_failed');
    expect(curatorWrites()).toEqual([]);
    expect(section).toHaveAttribute('data-state', 'live');
  });
});

describe('the family page once it is off', () => {
  it('makes a new family link like New link, with the password asked for again', async () => {
    coming = comingDays({
      provisional: false,
      series: seriesCard({ state: 'on', starts_on: dayFromToday(-5) }),
      sent_count: 5,
    });
    show();
    const section = await family();
    expect(section).toHaveAttribute('data-state', 'off');
    await fireEvent.input(within(section).getByLabelText('password'), { target: { value: 'riverton' } });
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_make_new' }));

    await waitFor(() => expect(section).toHaveAttribute('data-state', 'live'));
    expect(mocks.createSharedLink.mock.calls[0][0].sharedLinkCreateDto.password).toBe('riverton');
    expect(curatorWrites()).toEqual([
      { method: 'POST', path: '/api/series/7/link', body: { linkId: 'link-new', key: 'key-new' } },
    ]);
  });

  it('is off where Gallery no longer has the link Curator holds, and the next link retires that one', async () => {
    coming = live();
    show();
    const section = await family();
    await waitFor(() => expect(section).toHaveAttribute('data-state', 'off'));
    await fireEvent.click(passwordSwitch(section));
    await fireEvent.click(within(section).getByRole('button', { name: 'memory_series_link_make_new' }));

    await waitFor(() => expect(section).toHaveAttribute('data-state', 'live'));
    // Gallery has none by that id any more: Curator forgets it all the same
    expect(curatorWrites()).toEqual([
      { method: 'POST', path: '/api/series/7/link', body: { linkId: 'link-new', key: 'key-new' } },
      { method: 'DELETE', path: '/api/series/7/link/link-1' },
    ]);
  });
});

describe('what went out to the family page', () => {
  beforeEach(() => {
    coming = live({ sent_count: 2 });
    gallery = [link()];
    sent = [
      sentMemory(),
      sentMemory({
        key: 'event:5',
        n: 1,
        day: dayFromToday(-2),
        title: 'The lake house',
        line: 'June 1998',
        cover: 'photo-5',
        state: 'withdrawn',
      }),
    ];
  });

  it('lists them newest first as the family has them, one taken off saying so', async () => {
    show();
    const list = await screen.findByTestId('series-sent');
    expect(within(list).getByRole('heading', { name: /memory_series_on_the_page/ })).toHaveTextContent('1');
    const [first, second] = within(list).getAllByTestId('series-sent-memory');

    expect(within(first).getByTestId('series-sent-when')).toHaveTextContent('memory_series_yesterday');
    expect(within(first).getByRole('heading', { name: 'Riverton in the snow' })).toBeInTheDocument();
    expect(first).toHaveTextContent('Riverton · January 2004');
    const cover = first.querySelector('img')!;
    expect(new URL(cover.getAttribute('src')!, location.href).pathname).toBe('/api/assets/photo-8/thumbnail');
    expect(within(first).getByRole('button', { name: 'memory_series_take_off' })).toBeInTheDocument();
    expect(within(first).queryByTestId('series-sent-off')).not.toBeInTheDocument();

    expect(second).toHaveAttribute('data-off');
    expect(within(second).getByTestId('series-sent-off')).toHaveTextContent('memory_series_taken_off');
    expect(within(second).getByRole('button', { name: 'memory_series_restore' })).toBeInTheDocument();
    expect(within(second).queryByRole('button', { name: 'memory_series_take_off' })).not.toBeInTheDocument();
  });

  it('takes one off the page after asking, and puts one back, then asks for the days and the list again', async () => {
    show();
    const list = await screen.findByTestId('series-sent');
    const [first] = within(list).getAllByTestId('series-sent-memory');
    const before = comingAsked();
    mocks.showDialog.mockResolvedValueOnce(false);
    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_take_off' }));
    await waitFor(() => expect(mocks.showDialog).toHaveBeenCalledOnce());
    expect(mocks.showDialog).toHaveBeenCalledWith({
      title: 'memory_series_take_off_title',
      prompt: 'memory_series_take_off_prompt',
      confirmText: 'memory_series_take_off_confirm',
    });
    expect(curatorWrites()).toEqual([]);

    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_take_off' }));
    await waitFor(() => expect(within(first).getByTestId('series-sent-off')).toBeInTheDocument());
    expect(comingAsked()).toBe(before + 1);

    await fireEvent.click(within(first).getByRole('button', { name: 'memory_series_restore' }));
    await waitFor(() => expect(within(first).queryByTestId('series-sent-off')).not.toBeInTheDocument());
    expect(curatorWrites()).toEqual([
      { method: 'POST', path: '/api/series/7/takeoff', body: { key: 'trip:8' } },
      { method: 'POST', path: '/api/series/7/putback', body: { key: 'trip:8' } },
    ]);
    expect(comingAsked()).toBe(before + 2);
    expect(asked.filter(({ path }) => path === '/api/series/7/sent')).toHaveLength(3);
  });

  it('is not there before anything went out', async () => {
    coming = comingDays();
    show();
    await family();
    expect(screen.queryByTestId('series-sent')).not.toBeInTheDocument();
    expect(asked.some(({ path }) => path === '/api/series/7/sent')).toBe(false);
  });
});

describe('the notes under the quiet line', () => {
  it('says when the story reaches today, and that the next memory waits', async () => {
    coming = live({ story_ends: dayFromToday(20), waiting_notice: true });
    gallery = [link()];
    show();
    const status = await screen.findByTestId('series-status');
    expect(within(status).getByTestId('series-story-ends')).toHaveTextContent('memory_series_story_ends');
    expect(within(status).getByTestId('series-waiting')).toHaveTextContent('memory_series_waiting_notice');
  });

  it('says neither while there is nothing to say', async () => {
    coming = live();
    gallery = [link()];
    show();
    const status = await screen.findByTestId('series-status');
    expect(within(status).queryByTestId('series-story-ends')).not.toBeInTheDocument();
    expect(within(status).queryByTestId('series-waiting')).not.toBeInTheDocument();
  });
});
