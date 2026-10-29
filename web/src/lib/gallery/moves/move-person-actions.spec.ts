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
import { getMovePersonActions } from './move-person-actions';

// Local Omarchy layer: the person's own ⋮ (gallery/moves): Move this person's photos to <library>, one row for each
// other library, which hands over the person alone, with no selection. Synthetic people only.

const mocks = vi.hoisted(() => ({
  page: { url: new URL('about:blank') },
  auth: { authenticated: true, isSharedLink: false, user: { id: 'owner-id', isAdmin: true } },
  show: vi.fn(),
}));
vi.mock('$app/state', () => ({ page: mocks.page }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: mocks.show },
}));

const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';
const $t = ((key: string, options?: { values?: Record<string, unknown> }) =>
  options?.values ? `${key} ${JSON.stringify(options.values)}` : key) as never;
const person = personFactory.build({ id: '3f1c8a52-8f6e-4e0a-9d7e-2b5f1c9a4d10', name: 'Person A' });

// the page's address, for the page conditions
const at = (address: string) => (mocks.page.url = new URL(address));

beforeEach(async () => {
  vi.clearAllMocks();
  resetLibraryContext();
  await loadLibraryContext(serving(libraryContextFile(secondLibrary, [mainLibrary, secondLibrary, cleanupLibrary])));
  at(`${secondLibrary.url}/people/${person.id}`);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(desktop);
  mocks.auth.user = { id: 'owner-id', isAdmin: true };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetLibraryContext();
});

describe('getMovePersonActions', () => {
  it('has one row for every other library, naming it', () => {
    const rows = getMovePersonActions($t, person);
    expect(rows.map(({ title }) => title)).toEqual([
      `moves_move_person_to ${JSON.stringify({ library: 'Main' })}`,
      `moves_move_person_to ${JSON.stringify({ library: 'Cleanup' })}`,
    ]);
  });

  it('hands over the person alone, with no selection', () => {
    const [row] = getMovePersonActions($t, person);
    void row.onAction({ action: row } as never);
    expect(mocks.show).toHaveBeenCalledWith(MoveDialog, {
      request: { kind: 'person', person: { id: person.id, name: 'Person A' } },
      destination: expect.objectContaining({ id: 'main' }),
    });
    const request = mocks.show.mock.calls[0][1].request as Record<string, unknown>;
    expect(request).not.toHaveProperty('ids');
  });

  it.each([
    ['a grouped person', () => ({ ...person, filterId: `person:${person.id}` })],
    ['a Space’s person', () => ({ ...person, spacePersonId: 'space-person' })],
  ])('has no row for %s', (_case, make) => {
    expect(getMovePersonActions($t, make())).toEqual([]);
  });

  it('has no row for anyone but the owner, nor in a vault’s Gallery, nor away from this library’s address', () => {
    mocks.auth.user = { id: 'owner-id', isAdmin: false };
    expect(getMovePersonActions($t, person)).toEqual([]);
    mocks.auth.user = { id: 'owner-id', isAdmin: true };
    at(`http://127.0.0.1:2286/people/${person.id}`);
    expect(getMovePersonActions($t, person)).toEqual([]);
    at(`${secondLibrary.url}/people/${person.id}`);
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(getMovePersonActions($t, person)).toEqual([]);
  });
});
