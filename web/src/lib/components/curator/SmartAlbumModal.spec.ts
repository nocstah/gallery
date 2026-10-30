import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import SmartAlbumModal from '$lib/components/curator/SmartAlbumModal.svelte';
import { curator, type SmartAlbum, type SmartRule } from '$lib/utils/curator';

// Local Omarchy layer: the Save as smart album dialog (Curator, curator/smart.py). With two or more people in the
// search it asks how many of them each photo holds, from any of them to all of them together, the default; the count
// follows the choice, saving sends it, and changing a smart album starts from the one it was saved with.

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: { smartPreview: vi.fn(), smartCreate: vi.fn(), smartUpdate: vi.fn() },
}));

const PEOPLE = ['person:person-a', 'person:person-b', 'person:person-c', 'person:person-d', 'person:person-e'];
// what Curator counts for three people: all of them together, at least 2 of them, any of them
const COUNTS: Record<string, number> = { all: 160, '2': 911, '1': 5465 };

const searchFor = (count: number) => {
  const people = PEOPLE.slice(0, count);
  return { search: { personIds: people }, query: null, filters: { url: `/photos?people=${people.join(',')}` } };
};

const album = (rule: Partial<SmartRule>): SmartAlbum => ({
  id: 3,
  album_id: 'album-1',
  name: 'Person A, Person B and Person C',
  rule: { ...searchFor(3), strictness: 'normal', ...rule },
  count: 911,
  excluded: 0,
  synced_at: null,
});

const open = (people: number, editing?: SmartAlbum) => {
  const onClose = vi.fn();
  render(SmartAlbumModal, { rule: searchFor(people), suggestedName: 'Person A · Person B', editing, onClose });
  return onClose;
};

const choices = () =>
  within(screen.getByRole('group', { name: "Who's in each photo" }))
    .getAllByRole('button')
    .map((choice) => choice.textContent?.trim());

const lastPreview = () => vi.mocked(curator.smartPreview).mock.lastCall?.[0];

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});

beforeEach(() => {
  vi.mocked(curator.smartPreview).mockImplementation((rule: SmartRule) =>
    Promise.resolve({ count: COUNTS[String(rule.people_at_least ?? 'all')], newest: [], weakest: [] }),
  );
});

describe('SmartAlbumModal', () => {
  it('asks how many of three people each photo holds, all of them together unless told otherwise', async () => {
    open(3);
    expect(choices()).toEqual(['Any of them', 'At least 2 of them', 'All of them together']);
    expect(screen.getByRole('button', { name: 'All of them together' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('160 photos match')).toBeInTheDocument();
    expect(lastPreview()).not.toHaveProperty('people_at_least');
  });

  it('counts as many of them as chosen, and saves the choice', async () => {
    vi.mocked(curator.smartCreate).mockResolvedValue(album({ people_at_least: 2 }));
    const onClose = open(3);

    await userEvent.click(screen.getByRole('button', { name: 'Any of them' }));
    expect(await screen.findByText('5,465 photos match')).toBeInTheDocument();
    expect(lastPreview()).toMatchObject({ people_at_least: 1 });
    expect(screen.getByRole('button', { name: 'Any of them' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'All of them together' }));
    expect(await screen.findByText('160 photos match')).toBeInTheDocument();
    expect(lastPreview()).not.toHaveProperty('people_at_least');

    await userEvent.click(screen.getByRole('button', { name: 'At least 2 of them' }));
    expect(await screen.findByText('911 photos match')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save as smart album' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(album({ people_at_least: 2 })));
    expect(curator.smartCreate).toHaveBeenCalledWith('Person A · Person B', {
      ...searchFor(3),
      strictness: 'normal',
      people_at_least: 2,
    });
  });

  it('offers any of two people or both together', () => {
    open(2);
    expect(choices()).toEqual(['Any of them', 'All of them together']);
  });

  it('offers every count between any and all of five people', () => {
    open(5);
    expect(choices()).toEqual([
      'Any of them',
      'At least 2 of them',
      'At least 3 of them',
      'At least 4 of them',
      'All of them together',
    ]);
  });

  it('asks nothing of one person', async () => {
    open(1);
    expect(await screen.findByText('160 photos match')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: "Who's in each photo" })).not.toBeInTheDocument();
    expect(lastPreview()).not.toHaveProperty('people_at_least');
  });

  it('starts from the choice a smart album was saved with, and keeps it', async () => {
    const editing = album({ people_at_least: 2 });
    vi.mocked(curator.smartUpdate).mockResolvedValue(editing);
    const onClose = open(3, editing);

    expect(screen.getByRole('button', { name: 'At least 2 of them' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('911 photos match')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Update smart album' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(editing));
    expect(curator.smartUpdate).toHaveBeenCalledWith(3, expect.objectContaining({ people_at_least: 2 }));
  });
});
