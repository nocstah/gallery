import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import { personFactory } from '@test-data/factories/person-factory';
import MoveFaces from './MoveFaces.svelte';
import type { MoveFacesReport } from './mover';

// Local Omarchy layer: Faces in <library>, after a person's move (gallery/moves, D8). The people come through this
// library's own API, one read each; a proposal is a plain link into Kioku's own merge or person view; the counts are
// words; and nothing here ever merges, renames, hides or deletes anyone. Synthetic people only.

const sdk = vi.hoisted(() => ({
  getPerson: vi.fn(),
  // every people write the SDK has: none may ever be called from here
  mergePeople: vi.fn(),
  mergePersonLegacy: vi.fn(),
  mergeScopedPeople: vi.fn(),
  updatePerson: vi.fn(),
  updatePeople: vi.fn(),
  createPerson: vi.fn(),
  deletePerson: vi.fn(),
  deletePeople: vi.fn(),
  reassignFaces: vi.fn(),
  reassignFacesById: vi.fn(),
  detachScopedPerson: vi.fn(),
  updateSpacePerson: vi.fn(),
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  ...sdk,
}));

const NAMED = '3f1c8a52-8f6e-4e0a-9d7e-2b5f1c9a4d10';
const UNNAMED = '7d2e9b63-1a4c-4f8e-b0d5-6c3a2e1f9b07';
const names = { source: 'Second', library: 'Main' };

const report = (overrides: Partial<MoveFacesReport> = {}): MoveFacesReport => ({
  at: '2026-10-30T09:12:00Z',
  photos: 6,
  waiting: 2,
  unmatched: 1,
  unassigned: 3,
  people: [
    { id: NAMED, named: true, hidden: false, faces: 4 },
    { id: UNNAMED, named: false, hidden: false, faces: 3 },
  ],
  proposals: [{ merge: UNNAMED, into: NAMED }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  sdk.getPerson.mockImplementation(({ id }: { id: string }) =>
    Promise.resolve(personFactory.build({ id, name: id === NAMED ? 'Person A' : '', isHidden: false })),
  );
});

const rows = () => screen.getAllByTestId('move-faces-person');
const writes = () =>
  Object.entries(sdk)
    .filter(([name, spy]) => name !== 'getPerson' && spy.mock.calls.length > 0)
    .map(([name]) => name);

describe('MoveFaces', () => {
  it('lists each person this library put the faces on, named through its own API, with the counts', async () => {
    render(MoveFaces, { report: report(), names });
    expect(screen.getByTestId('move-faces')).toHaveTextContent('moves_faces_title');
    expect(rows()).toHaveLength(2);
    await waitFor(() => expect(within(rows()[0]).getByText('Person A')).toBeInTheDocument());
    expect(within(rows()[0]).getByText('4')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('moves_faces_unnamed')).toBeInTheDocument();
    expect(within(rows()[1]).getByText('3')).toBeInTheDocument();
    // each person read once, and their face from this library
    expect(sdk.getPerson).toHaveBeenCalledTimes(2);
    expect(sdk.getPerson.mock.calls.map(([{ id }]) => id)).toEqual(expect.arrayContaining([NAMED, UNNAMED]));
    await waitFor(() => expect(rows()[0].querySelector('img')).not.toBeNull());
    expect(rows()[0].querySelector('img')?.getAttribute('src')).toContain(`/people/${NAMED}/thumbnail`);
    // the counts, as words
    expect(screen.getByText('moves_faces_read')).toBeInTheDocument();
    expect(screen.getByText('moves_faces_unmatched')).toBeInTheDocument();
    expect(screen.getByText('moves_faces_unassigned')).toBeInTheDocument();
  });

  it('offers a merge as a link to Kioku’s own merge view on the named person, never as a call', async () => {
    render(MoveFaces, { report: report(), names });
    const merge = await within(rows()[1]).findByRole('link', { name: 'moves_faces_merge' });
    expect(merge).toHaveAttribute('href', `/people/${NAMED}?action=merge`);
    expect(within(rows()[0]).queryByRole('link')).not.toBeInTheDocument();
    expect(writes()).toEqual([]);
  });

  it('offers a name as a link to that person’s page', async () => {
    render(MoveFaces, {
      report: report({
        people: [{ id: UNNAMED, named: false, hidden: false, faces: 5 }],
        proposals: [{ name: UNNAMED }],
      }),
      names,
    });
    const name = await within(rows()[0]).findByRole('link', { name: 'moves_faces_name' });
    expect(name).toHaveAttribute('href', `/people/${UNNAMED}`);
    expect(writes()).toEqual([]);
  });

  it('leaves out the counts that are nought, and shows a row even when its person cannot be read', async () => {
    sdk.getPerson.mockRejectedValue(new Error('gone'));
    render(MoveFaces, {
      report: report({ waiting: 0, unmatched: 0, unassigned: 0, proposals: [{ merge: UNNAMED, into: NAMED }] }),
      names,
    });
    await waitFor(() => expect(sdk.getPerson).toHaveBeenCalledTimes(2));
    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]).getByText('moves_faces_unnamed')).toBeInTheDocument();
    // a merge into someone this page cannot name is not offered
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('moves_faces_read')).not.toBeInTheDocument();
    expect(screen.queryByText('moves_faces_unmatched')).not.toBeInTheDocument();
    expect(screen.queryByText('moves_faces_unassigned')).not.toBeInTheDocument();
    expect(writes()).toEqual([]);
  });
});
