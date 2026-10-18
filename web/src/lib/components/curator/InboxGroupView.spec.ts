import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import type { GroupPage, JobRow, Suggestion } from '$lib/utils/curator';
import InboxGroupView from './InboxGroupView.svelte';

// Local Omarchy layer: one kind of Curator's suggestions against a stand-in Curator. Every word says what accepting
// does for the kind (Archive, not Accept); Review one by one leads and the action for the whole kind comes second,
// saying before the click that Gallery's database is backed up first; after it a receipt with Undo all, which takes
// back exactly that action in one call, waiting again. The cards are a list of articles named by their titles, their
// keys announced; Delete is the danger role, and a confidence every card shares is left out.

const { curatorMock, waitForJobMock } = vi.hoisted(() => ({
  curatorMock: {
    group: vi.fn(),
    decide: vi.fn(),
    undo: vi.fn(),
    reopen: vi.fn(),
  },
  waitForJobMock: vi.fn(),
}));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: curatorMock,
  waitForJob: waitForJobMock,
}));

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});

const KEY = 'asset.archive:short:2026-10-11';

const clip = (n: number, confidence = 0.8): Suggestion => ({
  id: 100 + n,
  kind: 'asset.archive',
  target_id: `asset-${n}`,
  title: `IMG_${5398 + n}.MOV`,
  detail: 'A 0.1 s clip.',
  asset_ids: [`asset-${n}`],
  payload: { asset_id: `asset-${n}`, reasons: ['short'] },
  confidence,
  status: 'pending',
  model: 'junk@1',
  error: null,
  created_at: '2026-10-10T20:00:00Z',
  story: null,
});

const page = (items: Suggestion[]): GroupPage => ({
  group: {
    key: KEY,
    kind: 'asset.archive',
    title: 'Very short clips',
    description: 'Videos under two seconds, mostly a tap on the record button.',
    created_at: '2026-10-10T17:30:39Z',
    series: 'asset.archive:short',
    runs: ['2026-10-11'],
  },
  total: items.length,
  items,
});

const job = (fields: Partial<JobRow>): JobRow => ({
  id: 9,
  kind: 'apply',
  status: 'done',
  progress: {},
  result: null,
  error: null,
  created_at: '2026-10-18T08:00:00Z',
  started_at: null,
  finished_at: null,
  ...fields,
});

const waiting = (items: Suggestion[]) => curatorMock.group.mockResolvedValue(page(items));

const renderKind = async () => {
  render(InboxGroupView, { keys: [KEY], onChange: vi.fn() });
  return screen.findByRole('list', { name: 'Very short clips' });
};

beforeEach(() => {
  for (const mock of [...Object.values(curatorMock), waitForJobMock]) {
    mock.mockReset();
  }
});

describe('InboxGroupView', () => {
  it('says what accepting does, leads with Review one by one, and says the backup before the click', async () => {
    waiting(Array.from({ length: 25 }, (_, n) => clip(n)));
    await renderKind();

    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(25);
    expect(within(cards[0]).getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Accept/ })).not.toBeInTheDocument();
    // the ink action is the review; the whole kind at once is named and says what follows
    expect(screen.getByRole('button', { name: 'Review one by one' })).toHaveClass('ws-btn');
    const all = screen.getByRole('button', { name: 'Archive all 25' });
    expect(all).not.toHaveClass('ws-btn');
    expect(all).toHaveAccessibleDescription("Gallery's database is backed up first, and Undo all takes them back.");
    expect(screen.getByRole('button', { name: 'Reject all 25' })).toHaveAccessibleDescription(
      /Curator won't suggest them again/,
    );
    expect(screen.getByText('J K move · A Archive · R Reject · D Delete · U Undo')).toBeInTheDocument();
  });

  it('says no backup where 20 or fewer change', async () => {
    waiting([clip(1), clip(2)]);
    await renderKind();
    expect(await screen.findByRole('button', { name: 'Archive all 2' })).toHaveAccessibleDescription(
      'Undo all takes them back.',
    );
  });

  it('offers nothing for all of one: its card has the button', async () => {
    waiting([clip(1)]);
    await renderKind();
    expect(await screen.findByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /all/ })).not.toBeInTheDocument();
  });

  it('is a list of articles named by their titles, each button announcing its key', async () => {
    waiting([clip(1), clip(2)]);
    const list = await renderKind();

    const [first] = within(list).getAllByRole('article');
    expect(first).toHaveAccessibleName('IMG_5399.MOV');
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(within(first).getByRole('button', { name: 'Archive' })).toHaveAttribute('aria-keyshortcuts', 'A');
    expect(within(first).getByRole('button', { name: 'Reject' })).toHaveAttribute('aria-keyshortcuts', 'R');
    // Delete sends the photo to the Trash: the danger role, not Reject's look
    const remove = within(first).getByRole('button', { name: 'Delete' });
    expect(remove).toHaveAttribute('aria-keyshortcuts', 'D');
    expect(remove).toHaveClass('item-delete');
    expect(list).toHaveAccessibleDescription('J K move · A Archive · R Reject · D Delete · U Undo');
  });

  it('leaves out a confidence every card shares', async () => {
    waiting([clip(1), clip(2), clip(3)]);
    await renderKind();
    await screen.findAllByRole('article');
    expect(screen.queryByText('80% sure')).not.toBeInTheDocument();
  });

  it('keeps a confidence that tells cards apart', async () => {
    waiting([clip(1), clip(2, 0.65)]);
    await renderKind();
    expect(await screen.findByText('80% sure')).toBeInTheDocument();
    expect(screen.getByText('65% sure')).toBeInTheDocument();
  });

  it('moves with J and K, and A does what the button says', async () => {
    waiting([clip(1), clip(2), clip(3)]);
    curatorMock.decide.mockResolvedValue({ applied: [102], failed: [] });
    const user = userEvent.setup();
    await renderKind();
    const cards = await screen.findAllByRole('article');

    await user.keyboard('j');
    expect(cards[0]).toHaveFocus();
    await user.keyboard('jjk');
    expect(cards[1]).toHaveFocus();
    await user.keyboard('a');
    expect(curatorMock.decide).toHaveBeenCalledWith([102], 'accept');
    // decided, it sinks to the bottom with its Undo
    await waitFor(() => expect(within(screen.getAllByRole('article')[2]).getByText('Applied')).toBeInTheDocument());
  });

  // a held A had accepted card after card: each decided card moves the next one up under the focus
  it('acts once for a held A, R or D, and keeps J repeating', async () => {
    waiting([clip(1), clip(2), clip(3), clip(4)]);
    curatorMock.decide.mockImplementation((ids: number[]) => Promise.resolve({ applied: ids }));
    await renderKind();
    const cards = await screen.findAllByRole('article');
    cards[0].focus();

    await fireEvent.keyDown(document.activeElement!, { key: 'a' });
    await waitFor(() => expect(curatorMock.decide).toHaveBeenCalledTimes(1));
    for (const key of ['a', 'r', 'x', 'd', 'u']) {
      await fireEvent.keyDown(document.activeElement!, { key, repeat: true });
    }
    expect(curatorMock.decide).toHaveBeenCalledTimes(1);
    expect(curatorMock.undo).not.toHaveBeenCalled();

    const first = screen.getAllByRole('article')[0];
    first.focus();
    await fireEvent.keyDown(document.activeElement!, { key: 'j', repeat: true });
    expect(screen.getAllByRole('article')[1]).toHaveFocus();
  });

  it('leaves a receipt after Archive all, and Undo all takes exactly that back in one call', async () => {
    const items = [clip(1), clip(2), clip(3)];
    waiting(items);
    curatorMock.decide.mockResolvedValue({ applied: [101, 102, 103], failed: [] });
    curatorMock.undo.mockResolvedValue({
      undone: [103, 102, 101],
      reopened: [103, 102, 101],
      conflicts: [],
      failed: [],
    });
    const user = userEvent.setup();
    await renderKind();

    await user.click(await screen.findByRole('button', { name: 'Archive all 3' }));
    expect(curatorMock.decide).toHaveBeenCalledWith([101, 102, 103], 'accept');
    expect(await screen.findByText('Archived 3 clips.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive all 3' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo all' }));
    expect(curatorMock.undo).toHaveBeenCalledTimes(1);
    expect(curatorMock.undo).toHaveBeenCalledWith([101, 102, 103], true);
    await waitFor(() => expect(screen.queryByText('Archived 3 clips.')).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Archive all 3' })).toBeInTheDocument(); // waiting again
  });

  it("follows Curator's jobs for a large Archive all and its Undo all, and says what could not be taken back", async () => {
    waiting(Array.from({ length: 25 }, (_, n) => clip(n)));
    curatorMock.decide.mockResolvedValue({ job: 9 });
    curatorMock.undo.mockResolvedValue({ job: 10, undone: [], conflicts: [] });
    waitForJobMock.mockResolvedValueOnce(job({ id: 9, result: { applied: 23, failed: 2 } })).mockResolvedValueOnce(
      job({
        id: 10,
        kind: 'apply.undo',
        result: {
          undone: 22,
          reopened: 22,
          conflicts: 1,
          failed: 0,
          skipped: 2,
          problems: [{ id: 103, reason: 'the photo was moved since' }],
        },
      }),
    );
    const user = userEvent.setup();
    await renderKind();

    await user.click(await screen.findByRole('button', { name: 'Archive all 25' }));
    expect(await screen.findByText('Archived 23 clips.')).toBeInTheDocument();
    expect(screen.getByText('2 could not be applied and are marked Failed.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo all' }));
    expect(curatorMock.undo).toHaveBeenCalledWith(
      Array.from({ length: 25 }, (_, n) => 100 + n),
      true,
    );
    expect(await screen.findByText('1 could not be taken back: the photo was moved since')).toBeInTheDocument();
  });

  it('leaves the same receipt after Reject all, whose Undo all puts them all back', async () => {
    waiting([clip(1), clip(2)]);
    curatorMock.decide.mockResolvedValue({ rejected: 2 });
    curatorMock.reopen.mockResolvedValue({ reopened: [101, 102] });
    const user = userEvent.setup();
    await renderKind();

    await user.click(await screen.findByRole('button', { name: 'Reject all 2' }));
    expect(curatorMock.decide).toHaveBeenCalledWith([101, 102], 'reject');
    expect(
      await screen.findByText("2 rejected. Curator won't suggest them again; they wait under Rejected."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo all' }));
    expect(curatorMock.reopen).toHaveBeenCalledWith([101, 102]);
    expect(curatorMock.undo).not.toHaveBeenCalled();
  });

  it("an accepted card's Undo takes the change back and leaves the card waiting again", async () => {
    waiting([{ ...clip(1), status: 'applied' }]);
    curatorMock.undo.mockResolvedValue({ undone: [101], reopened: [101], conflicts: [], failed: [] });
    const user = userEvent.setup();
    await renderKind();

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(curatorMock.undo).toHaveBeenCalledWith([101], true);
    expect(await screen.findByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });
});
