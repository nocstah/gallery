import { SharedLinkType, type SharedLinkResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { comingDays, dayFromToday, seriesCard } from '@test-data/factories/series-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';
import SeriesPage from './SeriesPage.svelte';
import type { Coming } from './series-api';

// Local Omarchy layer: Delete this series (gallery/series), against a stand-in Curator and a stand-in Gallery: it asks
// first, saying that the family link ends when there is one; every link the series still has is deleted in Gallery
// (one Gallery has no more counts as gone), as Curator holds them when asked again, and only then does Curator let
// the series go; a toast says so and the list opens. What stops it (Gallery, or Curator in its words) is a toast, and
// the page stays. Every word is an i18n key (the 'dev' locale). Synthetic ids only.

const mocks = vi.hoisted(() => ({
  auth: {
    authenticated: true,
    isSharedLink: false,
    user: { id: 'owner-id', isAdmin: true },
    params: {},
    preferences: { memories: { enabled: true, duration: 6 } },
  },
  showDialog: vi.fn(),
  success: vi.fn(),
  danger: vi.fn(),
  goto: vi.fn(),
  removeSharedLink: vi.fn(),
  getAllSharedLinks: vi.fn(),
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/managers/server-config-manager.svelte', () => ({
  serverConfigManager: { value: { externalDomain: 'https://photos.example' } },
}));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: stub } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: stub };
});
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { showDialog: mocks.showDialog },
  toastManager: { success: mocks.success, danger: mocks.danger },
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  removeSharedLink: mocks.removeSharedLink,
  getAllSharedLinks: mocks.getAllSharedLinks,
  isHttpError: (error: unknown) => typeof (error as { status?: unknown })?.status === 'number',
}));

type Asked = { method: string; path: string };
let asked: Asked[];
let coming: Coming | undefined;
/** the links the stand-in Gallery holds */
let gallery: SharedLinkResponseDto[];
/** what Curator answers the delete with, while it does not let the series go */
let refusal: Response | undefined;
/** in Gallery's order of events: what was deleted there, and when Curator was asked */
let events: string[];

const link = (id: string) =>
  sharedLinkFactory.build({ id, key: `key-${id}`, type: SharedLinkType.Individual, password: null, expiresAt: null });

const live = () =>
  comingDays({
    provisional: false,
    live: true,
    link_id: 'link-1',
    sent_count: 0,
    series: seriesCard({ state: 'on', status: 'live', starts_on: dayFromToday(-5), link_id: 'link-1' }),
  });

beforeEach(() => {
  asked = [];
  events = [];
  gallery = [];
  refusal = undefined;
  coming = comingDays();
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = { method: init?.method ?? 'GET', path: url.pathname };
    asked.push(request);
    if (request.path === '/api/series/7/coming') {
      return Promise.resolve(
        coming ? Response.json(coming) : Response.json({ detail: 'No such series' }, { status: 404 }),
      );
    }
    if (request.path === '/api/series/7' && request.method === 'GET') {
      return Promise.resolve(
        coming
          ? Response.json({ series: coming.series })
          : Response.json({ detail: 'No such series' }, { status: 404 }),
      );
    }
    if (request.path === '/api/series/7' && request.method === 'DELETE') {
      events.push('curator: delete');
      if (refusal) {
        return Promise.resolve(refusal);
      }
      if (gallery.length > 0) {
        return Promise.resolve(
          Response.json({ detail: "Gallery still has this series' family link; turn it off first" }, { status: 409 }),
        );
      }
      coming = undefined;
      return Promise.resolve(Response.json({ deleted: 7, forgotten: 2 }));
    }
    return Promise.resolve(Response.json({ detail: 'Not Found' }, { status: 404 }));
  });
  mocks.showDialog.mockResolvedValue(true);
  mocks.goto.mockResolvedValue(undefined);
  mocks.getAllSharedLinks.mockImplementation(({ id }: { id?: string }) =>
    Promise.resolve(gallery.filter((held) => held.id === id)),
  );
  mocks.removeSharedLink.mockImplementation(({ id }: { id: string }) => {
    events.push(`gallery: ${id}`);
    if (gallery.every((held) => held.id !== id)) {
      return Promise.reject({ status: 404, data: { message: 'Shared link not found', statusCode: 404 } });
    }
    gallery = gallery.filter((held) => held.id !== id);
    return Promise.resolve('');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const show = () => render(SeriesPage, { props: { title: 'memory_series_title', seriesId: 7 } });
const deleteButton = () => screen.findByRole('button', { name: 'memory_series_delete' });

describe('Delete this series', () => {
  it('asks first, and deletes nothing when the owner says no', async () => {
    show();
    mocks.showDialog.mockResolvedValueOnce(false);
    await fireEvent.click(await deleteButton());
    await waitFor(() => expect(mocks.showDialog).toHaveBeenCalledOnce());
    expect(mocks.showDialog).toHaveBeenCalledWith({
      title: 'memory_series_delete_title',
      prompt: 'memory_series_delete_prompt',
      confirmText: 'delete',
    });
    expect(asked.filter(({ method }) => method !== 'GET')).toEqual([]);
    expect(mocks.goto).not.toHaveBeenCalled();
  });

  it('lets a series without a family link go, says so, and opens the list', async () => {
    show();
    await fireEvent.click(await deleteButton());
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledExactlyOnceWith('/from-the-beginning'));
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith('memory_series_deleted');
    expect(mocks.removeSharedLink).not.toHaveBeenCalled();
    expect(asked.filter(({ method }) => method !== 'GET')).toEqual([{ method: 'DELETE', path: '/api/series/7' }]);
  });

  it('says the family link ends, then deletes every link in Gallery before Curator lets the series go', async () => {
    coming = live();
    gallery = [link('link-1')];
    let confirm: (yes: boolean) => void = () => {};
    mocks.showDialog.mockImplementationOnce(() => new Promise<boolean>((resolve) => (confirm = resolve)));
    show();
    await fireEvent.click(await deleteButton());
    await waitFor(() => expect(mocks.showDialog).toHaveBeenCalledOnce());
    expect(mocks.showDialog).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'memory_series_delete_prompt_link' }),
    );

    // meanwhile another tab made a new link, the old one's page not yet forgotten: Curator says so when asked again
    coming = { ...live(), series: seriesCard({ ...live().series, link_id: 'link-2', links: ['link-1', 'link-2'] }) };
    gallery = [link('link-1'), link('link-2')];
    confirm(true);
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledExactlyOnceWith('/from-the-beginning'));
    expect(events).toEqual(['gallery: link-2', 'gallery: link-1', 'curator: delete']);
    expect(gallery).toEqual([]);
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith('memory_series_deleted');
  });

  it('counts a link Gallery no longer has as gone', async () => {
    coming = { ...live(), series: seriesCard({ ...live().series, links: ['link-0', 'link-1'] }) };
    gallery = [link('link-1')];
    show();
    await fireEvent.click(await deleteButton());
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledOnce());
    expect(events).toEqual(['gallery: link-1', 'gallery: link-0', 'curator: delete']);
  });

  it('stops when Gallery cannot turn a link off, asking Curator nothing, and says so', async () => {
    coming = live();
    gallery = [link('link-1')];
    mocks.removeSharedLink.mockRejectedValueOnce(new Error('Gallery is down'));
    show();
    await fireEvent.click(await deleteButton());
    await waitFor(() => expect(mocks.danger).toHaveBeenCalledExactlyOnceWith('memory_share_turn_off_failed'));
    expect(events).toEqual([]);
    expect(mocks.goto).not.toHaveBeenCalled();
    expect(await deleteButton()).toBeEnabled();
  });

  it('says what Curator would not do, in its words, and keeps the page', async () => {
    refusal = Response.json(
      { detail: 'Gallery did not say whether the family link is off; try again' },
      { status: 502 },
    );
    show();
    await fireEvent.click(await deleteButton());
    await waitFor(() =>
      expect(mocks.danger).toHaveBeenCalledExactlyOnceWith(
        'Gallery did not say whether the family link is off; try again',
      ),
    );
    expect(mocks.goto).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('series-day')).toHaveLength(2);
  });

  it('opens the list for a series Curator no longer has', async () => {
    show();
    const button = await deleteButton();
    coming = undefined;
    await fireEvent.click(button);
    await waitFor(() => expect(mocks.goto).toHaveBeenCalledExactlyOnceWith('/from-the-beginning'));
    expect(asked.filter(({ method }) => method === 'DELETE')).toEqual([]);
  });
});
