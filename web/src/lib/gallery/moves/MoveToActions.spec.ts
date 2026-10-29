import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import {
  cleanupLibrary,
  libraryContextFile,
  mainLibrary,
  secondLibrary,
  serving,
} from '@test-data/factories/library-context-factory';
import { personFactory } from '@test-data/factories/person-factory';
import MoveDialog from './MoveDialog.svelte';
import MoveToActions from './MoveToActions.svelte';

// Local Omarchy layer: Move to <library>'s rows (gallery/moves): one for each other library, only where a move can
// start, and a click opens the dialog with the owner's own photos of the selection, naming the person on their page.

const mocks = vi.hoisted(() => ({
  page: { url: new URL('about:blank') },
  selection: { assets: [] as { id: string; ownerId: string; isTrashed: boolean }[] },
  auth: { authenticated: true, isSharedLink: false, user: { id: 'owner-id', isAdmin: true } },
  show: vi.fn(),
}));
vi.mock('$app/state', () => ({ page: mocks.page }));
vi.mock('$lib/managers/asset-multi-select-manager.svelte', () => ({ assetMultiSelectManager: mocks.selection }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: mocks.show },
}));

const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';
const useAgent = (agent: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
const owned = (id: string) => ({ id, ownerId: 'owner-id', isTrashed: false });

const load = (libraries = [mainLibrary, secondLibrary, cleanupLibrary]) =>
  loadLibraryContext(serving(libraryContextFile(secondLibrary, libraries)));

beforeEach(async () => {
  vi.clearAllMocks();
  resetLibraryContext();
  await load();
  mocks.page.url = new URL('/photos', secondLibrary.url);
  mocks.selection.assets = [owned('a'), { id: 'b', ownerId: 'partner', isTrashed: false }];
  mocks.auth.authenticated = true;
  mocks.auth.isSharedLink = false;
  mocks.auth.user = { id: 'owner-id', isAdmin: true };
  useAgent(desktop);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetLibraryContext();
});

const rows = () => screen.queryAllByTestId('move-to-library');

describe('MoveToActions', () => {
  it('has one row for every other library, in the context’s order', async () => {
    render(MoveToActions, { menuItem: true });
    await tick();
    expect(rows().map((row) => row.textContent?.trim())).toEqual(['moves_move_to', 'moves_move_to']);
  });

  it('opens the dialog with the owner’s own photos and the count of the others', async () => {
    render(MoveToActions, { menuItem: true });
    await tick();
    await userEvent.click(rows()[0]);
    expect(mocks.show).toHaveBeenCalledWith(MoveDialog, {
      request: { kind: 'selection', ids: ['a'], notOwned: 1 },
      destination: expect.objectContaining({ id: 'main', url: mainLibrary.url }),
    });
    await userEvent.click(rows()[1]);
    expect(mocks.show).toHaveBeenLastCalledWith(MoveDialog, {
      request: expect.anything(),
      destination: expect.objectContaining({ id: 'my-cleanup' }),
    });
  });

  it('names the person on their page', async () => {
    const person = personFactory.build({ id: '3f1c8a52-8f6e-4e0a-9d7e-2b5f1c9a4d10', name: 'Person A' });
    render(MoveToActions, { menuItem: true, person });
    await tick();
    await userEvent.click(rows()[0]);
    expect(mocks.show).toHaveBeenCalledWith(MoveDialog, {
      request: { kind: 'selection', ids: ['a'], notOwned: 1, person: { id: person.id, name: 'Person A' } },
      destination: expect.objectContaining({ id: 'main' }),
    });
  });

  it('sends the selection alone from a grouped person’s page', async () => {
    const person = personFactory.build({ id: 'p', name: 'Person A', filterId: 'person:p' });
    render(MoveToActions, { menuItem: true, person });
    await tick();
    await userEvent.click(rows()[0]);
    expect(mocks.show).toHaveBeenCalledWith(MoveDialog, {
      request: { kind: 'selection', ids: ['a'], notOwned: 1 },
      destination: expect.anything(),
    });
  });

  it('draws buttons outside a menu', async () => {
    render(MoveToActions);
    await tick();
    expect(screen.getAllByRole('button', { name: 'moves_move_to' })).toHaveLength(2);
  });

  it.each([
    ['a photo in the trash', () => (mocks.selection.assets = [owned('a'), { ...owned('t'), isTrashed: true }])],
    ['none of the owner’s own', () => (mocks.selection.assets = [{ id: 'b', ownerId: 'partner', isTrashed: false }])],
    ['a phone', () => useAgent('Mozilla/5.0 (Linux; Android 16) Mobile')],
    ['another address', () => (mocks.page.url = new URL('http://127.0.0.1:2286/photos'))],
    ['a family account', () => (mocks.auth.user = { id: 'owner-id', isAdmin: false })],
    ['a shared link', () => (mocks.auth.isSharedLink = true)],
    ['a vault’s Gallery', () => vi.stubEnv('VITE_KIOKU_EDITION', 'vault')],
  ])('shows nothing for %s', async (_case, arrange) => {
    arrange();
    render(MoveToActions, { menuItem: true });
    await tick();
    expect(rows()).toHaveLength(0);
  });

  it('shows nothing when the context lists this library alone', async () => {
    resetLibraryContext();
    await load([secondLibrary]);
    render(MoveToActions, { menuItem: true });
    await tick();
    expect(rows()).toHaveLength(0);
  });
});
