import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import MoveDialog from './MoveDialog.svelte';
import { moveManager, type MoveRequest } from './move-manager.svelte';
import { MOVE_ID } from './mover';

// Local Omarchy layer: Move to <library>'s dialog (gallery/moves, S2 and S3). It asks the mover what is under way
// before anything is made, opens the destination's move page inside the click, then hands the move over and says how
// the checks went. A fake receiver answers through fetch. Synthetic libraries, people, ids and keys only.

const mocks = vi.hoisted(() => ({
  getPersonStatistics: vi.fn(),
  searchAssetStatistics: vi.fn(),
  createApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  getApiKeys: vi.fn(),
}));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(), goto: vi.fn() }));
vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({ assetMultiSelectManager: { clear: vi.fn() } }));
vi.mock('$lib/managers/server-config-manager.svelte', () => ({ serverConfigManager: { value: { trashDays: 30 } } }));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  ...mocks,
}));

const KEY = { id: '6a3c3a9e-1f6b-4f53-9b2e-6f0f7f0c1d11', secret: 'SyntheticSecretAbcdefghij0123456789' };
const RUNNING = '9b2f6c51-3e0a-4b8d-a1c4-5d7e8f9a0b1c';

type Route = { method: string; path: string; body?: Record<string, unknown> };
let routes: (request: Route) => Response;
let requests: Route[];

const receiver = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(String(input));
    const request = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    };
    requests.push(request);
    try {
      return Promise.resolve(routes(request));
    } catch (error) {
      return Promise.reject(error);
    }
  });

/** A receiver with nothing under way, which takes the hand-off and then reports the move in `after`. */
const takes = (after: Record<string, unknown>) => (request: Route) => {
  if (request.method === 'POST') {
    return Response.json({ v: 1, move: request.body?.move, state: 'checking' }, { status: 202 });
  }
  if (request.path === '/v1/moves') {
    return Response.json({ v: 1, moves: [] });
  }
  const move = request.path.split('/', 4)[3];
  return Response.json({ move, source: 'second', destination: 'main', ...after });
};

const selection = (ids = ['a', 'b'], notOwned = 0): MoveRequest => ({ kind: 'selection', ids, notOwned });

const open = (request: MoveRequest = selection()) =>
  render(MoveDialog, { request, destination: mainLibrary, onClose: vi.fn() });

const continueButton = () => screen.getByTestId('move-continue');

beforeEach(async () => {
  vi.clearAllMocks();
  resetLibraryContext();
  await loadLibraryContext(serving(libraryContextFile(secondLibrary, [mainLibrary, secondLibrary])));
  moveManager.reset();
  requests = [];
  routes = takes({ state: 'planning' });
  receiver();
  vi.spyOn(globalThis, 'open').mockReturnValue(null);
  mocks.getApiKeys.mockResolvedValue([]);
  mocks.deleteApiKey.mockResolvedValue(undefined);
  mocks.createApiKey.mockResolvedValue({ id: KEY.id, secret: KEY.secret });
  mocks.getPersonStatistics.mockResolvedValue({ assets: 1240, faces: 1300 });
  mocks.searchAssetStatistics.mockResolvedValue({ total: 37 });
});

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears down `document`.
afterEach(async () => {
  moveManager.reset();
  vi.restoreAllMocks();
  resetLibraryContext();
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe('MoveDialog', () => {
  it('says what goes and what stays for a selection', async () => {
    open(selection(['a', 'b', 'c'], 2));
    expect(screen.getByText('moves_dialog_title')).toBeInTheDocument();
    expect(screen.getByText('moves_dialog_count')).toBeInTheDocument();
    expect(screen.getByText('moves_not_owned')).toBeInTheDocument();
    expect(screen.getByText('moves_dialog_carried')).toBeInTheDocument();
    expect(screen.getByText('moves_dialog_trash')).toBeInTheDocument();
    expect(screen.queryByText('moves_group_photos')).not.toBeInTheDocument();
    expect(screen.queryByText('moves_source_shares_dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(continueButton()).toBeEnabled());
  });

  it('says the mover is not running, and keeps Continue closed', async () => {
    routes = () => {
      throw new TypeError('Failed to fetch');
    };
    open();
    expect(await screen.findByText('moves_mover_missing')).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it('names a move under way with its progress, and keeps Continue closed', async () => {
    routes = () =>
      Response.json({
        v: 1,
        moves: [{ move: RUNNING, source: 'second', destination: 'main', state: 'running', progress: {} }],
      });
    open();
    expect(await screen.findByText(/moves_busy/)).toHaveTextContent('moves_busy moves_progress');
    expect(continueButton()).toBeDisabled();
  });

  it('takes at most 50,000 at a time', async () => {
    open(selection(Array.from({ length: 50_001 }, (_, index) => `id-${index}`)));
    expect(screen.getByText('moves_too_many')).toBeInTheDocument();
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(continueButton()).toBeDisabled();
  });

  it('opens the destination’s move page inside the click, then hands the move over', async () => {
    open(selection(['a', 'b']));
    await waitFor(() => expect(continueButton()).toBeEnabled());
    expect(mocks.createApiKey).not.toHaveBeenCalled();

    void fireEvent.click(continueButton());
    // inside the click: the tab is open before anything was awaited, and no key has been made yet
    expect(globalThis.open).toHaveBeenCalledTimes(1);
    const [address, target, features] = vi.mocked(globalThis.open).mock.calls[0];
    const page = new URL(String(address));
    expect(page.origin).toBe(mainLibrary.url);
    expect(page.pathname).toBe('/moves');
    expect(page.searchParams.get('move')).toMatch(MOVE_ID);
    expect(page.searchParams.get('from')).toBe('second');
    expect([target, features]).toEqual(['_blank', 'noopener']);
    expect(mocks.createApiKey).not.toHaveBeenCalled();
    expect(screen.getByText('moves_checking')).toBeInTheDocument();

    expect(await screen.findByText('moves_confirm_there')).toBeInTheDocument();
    const posted = requests.find(({ method }) => method === 'POST');
    expect(posted?.body).toMatchObject({ move: page.searchParams.get('move'), assets: ['a', 'b'] });
    expect(screen.getByTestId('move-open')).toHaveAttribute('href', String(address));
  });

  it('says the checks’ refusal in its words', async () => {
    routes = takes({ state: 'refused', reason: 'versions' });
    open();
    await waitFor(() => expect(continueButton()).toBeEnabled());
    void fireEvent.click(continueButton());
    expect(await screen.findByText('moves_error_versions')).toBeInTheDocument();
    expect(screen.queryByTestId('move-open')).not.toBeInTheDocument();
  });

  it('says busy when another move got there first, and deletes its key', async () => {
    routes = (request) =>
      request.method === 'POST'
        ? Response.json({ error: 'busy' }, { status: 409 })
        : Response.json({ v: 1, moves: [] });
    open();
    await waitFor(() => expect(continueButton()).toBeEnabled());
    void fireEvent.click(continueButton());
    expect(await screen.findByText('moves_busy')).toBeInTheDocument();
    expect(mocks.deleteApiKey).toHaveBeenCalledWith({ id: KEY.id });
  });

  it('moves a person’s photos: their name, the page’s count, and the group photos', async () => {
    open({ kind: 'person', person: { id: 'p', name: 'Person A' } });
    expect(screen.getByText('moves_dialog_title_person')).toBeInTheDocument();
    expect(await screen.findByText('moves_dialog_count_person')).toBeInTheDocument();
    expect(mocks.getPersonStatistics).toHaveBeenCalledWith({ id: 'p' });
    expect(screen.getByText('moves_group_photos')).toBeInTheDocument();
    expect(screen.queryByText('moves_person_rest')).not.toBeInTheDocument();
    await waitFor(() => expect(continueButton()).toBeEnabled());
    void fireEvent.click(continueButton());
    await screen.findByText('moves_confirm_there');
    const posted = requests.find(({ method }) => method === 'POST');
    expect(posted?.body).toMatchObject({ person: { id: 'p', name: 'Person A' } });
    expect(posted?.body).not.toHaveProperty('assets');
  });

  it('says the first 50,000 of a person go now, and does not refuse them', async () => {
    mocks.getPersonStatistics.mockResolvedValue({ assets: 60_000, faces: 1 });
    open({ kind: 'person', person: { id: 'p', name: null } });
    expect(screen.getByText('moves_dialog_title_person_unnamed')).toBeInTheDocument();
    expect(await screen.findByText('moves_person_rest')).toBeInTheDocument();
    expect(screen.getByText('moves_dialog_count_person_unnamed')).toBeInTheDocument();
    await waitFor(() => expect(continueButton()).toBeEnabled());
  });

  it('offers a person’s archived photos with their count, off until ticked, and brings them only then', async () => {
    const person = { kind: 'person' as const, person: { id: 'p', name: 'Person A' } };
    const { unmount } = open(person);
    const tick = await screen.findByTestId('move-archived');
    expect(mocks.searchAssetStatistics).toHaveBeenCalledWith({
      statisticsSearchDto: { personIds: ['p'], visibility: 'archive' },
    });
    expect(tick).not.toBeChecked();
    expect(screen.getByText('moves_include_archived')).toBeInTheDocument();
    await waitFor(() => expect(continueButton()).toBeEnabled());
    void fireEvent.click(continueButton());
    await screen.findByText('moves_confirm_there');
    expect(requests.find(({ method }) => method === 'POST')?.body?.person).toEqual({ id: 'p', name: 'Person A' });
    unmount();

    moveManager.reset();
    requests = [];
    open(person);
    await fireEvent.click(await screen.findByTestId('move-archived'));
    expect(screen.getByTestId('move-archived')).toBeChecked();
    await waitFor(() => expect(continueButton()).toBeEnabled());
    void fireEvent.click(continueButton());
    await screen.findByText('moves_confirm_there');
    expect(requests.find(({ method }) => method === 'POST')?.body?.person).toEqual({
      id: 'p',
      name: 'Person A',
      archived: true,
    });
  });

  it('offers no archived tick for a selection, nor for a person with nothing archived', async () => {
    const { unmount } = open(selection());
    await waitFor(() => expect(continueButton()).toBeEnabled());
    expect(screen.queryByTestId('move-archived')).not.toBeInTheDocument();
    expect(mocks.searchAssetStatistics).not.toHaveBeenCalled();
    unmount();

    mocks.searchAssetStatistics.mockResolvedValue({ total: 0 });
    open({ kind: 'person', person: { id: 'p', name: 'Person A' } });
    await waitFor(() => expect(mocks.searchAssetStatistics).toHaveBeenCalled());
    await waitFor(() => expect(continueButton()).toBeEnabled());
    expect(screen.queryByTestId('move-archived')).not.toBeInTheDocument();
  });

  it('offers the tick without a number when the archived ones cannot be counted', async () => {
    mocks.searchAssetStatistics.mockRejectedValue(new Error('down'));
    open({ kind: 'person', person: { id: 'p', name: null } });
    expect(await screen.findByTestId('move-archived')).not.toBeChecked();
    expect(screen.getByText('moves_include_archived_any')).toBeInTheDocument();
  });

  it('counts the archived ones toward the first 50,000 once they are ticked', async () => {
    mocks.getPersonStatistics.mockResolvedValue({ assets: 49_990, faces: 1 });
    open({ kind: 'person', person: { id: 'p', name: 'Person A' } });
    await fireEvent.click(await screen.findByTestId('move-archived'));
    expect(await screen.findByText('moves_person_rest')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('move-archived'));
    await waitFor(() => expect(screen.queryByText('moves_person_rest')).not.toBeInTheDocument());
  });

  it('says, from Main, that the photos leave Main’s shared links, Spaces, albums and memories', async () => {
    resetLibraryContext();
    await loadLibraryContext(serving(libraryContextFile(mainLibrary, [mainLibrary, secondLibrary])));
    render(MoveDialog, { request: selection(), destination: secondLibrary, onClose: vi.fn() });
    expect(screen.getByText('moves_source_shares_dialog')).toBeInTheDocument();
  });
});
