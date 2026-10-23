import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init, register, waitLocale } from 'svelte-i18n';
import type { GroupPage, JobRow, Suggestion } from '$lib/utils/curator';
import { FACTS_AT_ONCE } from '$lib/utils/inbox-facts';
import { assetFactory } from '@test-data/factories/asset-factory';
import InboxGroupView from './InboxGroupView.svelte';

// Local Omarchy layer: one kind of Curator's suggestions against a stand-in Curator. Every word says what accepting
// does for the kind (Archive, not Accept); Review one by one leads and the action for the whole kind comes second,
// saying before the click that Gallery's database is backed up first; after it a receipt with Undo all, which takes
// back exactly that action in one call, waiting again. The cards are a list of articles named by their titles, their
// keys announced; Delete is the danger role, and a confidence every card shares is left out.

const { curatorMock, waitForJobMock, getAssetInfoMock } = vi.hoisted(() => ({
  curatorMock: {
    group: vi.fn(),
    decide: vi.fn(),
    undo: vi.fn(),
    reopen: vi.fn(),
  },
  waitForJobMock: vi.fn(),
  getAssetInfoMock: vi.fn(),
}));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: curatorMock,
  waitForJob: waitForJobMock,
}));

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getAssetInfo: getAssetInfoMock,
}));

// the cards a test brings near the screen (`enter`); none comes near by itself
class NearObserver {
  static all: NearObserver[] = [];
  targets = new Set<Element>();
  constructor(private callback: IntersectionObserverCallback) {
    NearObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
  static enter(elements: Element[]) {
    for (const observer of NearObserver.all) {
      const near = elements.filter((element) => observer.targets.has(element));
      if (near.length > 0) {
        observer.callback(
          near.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
          observer as unknown as IntersectionObserver,
        );
      }
    }
  }
}

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
  for (const mock of [...Object.values(curatorMock), waitForJobMock, getAssetInfoMock]) {
    mock.mockReset();
  }
  getAssetInfoMock.mockRejectedValue(new Error('not asked for in this test'));
  NearObserver.all = [];
  vi.stubGlobal('IntersectionObserver', NearObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Gallery's asset for a card's clip (stand-in places) */
const clipAsset = (n: number, fields: Partial<AssetResponseDto> = {}): AssetResponseDto =>
  assetFactory.build({
    id: `asset-${n}`,
    type: AssetTypeEnum.Video,
    localDateTime: '2019-10-11T15:55:06.000Z',
    exifInfo: { city: 'Riverton', country: 'Testland' },
    duration: 100,
    originalFileName: `IMG_${5398 + n}.MOV`,
    visibility: AssetVisibility.Timeline,
    isTrashed: false,
    livePhotoVideoId: null,
    stack: null,
    ...fields,
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

  // Local Omarchy layer (2026-10-18, the owner's "Divider + Delete set apart"): two percentages over 42 cards are said
  // once each, where they start, and every card still says its own to a screen reader
  it('says each confidence once where it changes, with how many cards it holds', async () => {
    waiting([
      ...Array.from({ length: 17 }, (_, n) => clip(n)),
      ...Array.from({ length: 25 }, (_, n) => clip(17 + n, 0.65)),
    ]);
    await renderKind();
    const cards = await screen.findAllByRole('article');

    expect(screen.getAllByText('80% sure')).toHaveLength(1);
    expect(screen.getAllByText('65% sure')).toHaveLength(1);
    expect(screen.getByText('80% sure').parentElement).toHaveTextContent(/^80% sure 17$/);
    expect(screen.getByText('65% sure').parentElement).toHaveTextContent(/^65% sure 25$/);
    // the line stands before the first card of its run, outside the card
    expect(cards[17].previousElementSibling).toHaveTextContent('65% sure');
    expect(cards[0]).toHaveAccessibleDescription('80% sure');
    expect(cards[16]).toHaveAccessibleDescription('80% sure');
    expect(cards[41]).toHaveAccessibleDescription('65% sure');
  });

  it('moves the line on, and counts one fewer, when the first card of a run is decided', async () => {
    waiting([clip(1), clip(2), clip(3, 0.65), clip(4, 0.65), clip(5, 0.65)]);
    curatorMock.decide.mockResolvedValue({ rejected: 1 });
    const user = userEvent.setup();
    await renderKind();
    const cards = await screen.findAllByRole('article');

    await user.click(within(cards[2]).getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(screen.getByText('65% sure').parentElement).toHaveTextContent(/^65% sure 2$/));
    const now = screen.getAllByRole('article');
    expect(now[2]).toHaveAccessibleName('IMG_5402.MOV');
    expect(now[2].previousElementSibling).toHaveTextContent('65% sure');
    // the decided card, sunk to the bottom, says nothing of it
    expect(now[4]).toHaveAccessibleName('IMG_5401.MOV');
    expect(now[4]).not.toHaveAccessibleDescription();
  });

  it('sets Delete apart from Reject, after it, with its key and the danger role', async () => {
    waiting([clip(1), clip(2)]);
    await renderKind();
    const [first] = await screen.findAllByRole('article');

    const buttons = within(first).getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Archive', 'Reject', 'Delete']);
    const remove = buttons[2];
    expect(remove.parentElement).toHaveClass('item-apart');
    expect(remove).toHaveClass('item-delete');
    expect(remove).toHaveAttribute('aria-keyshortcuts', 'D');
  });

  it('keeps the cards Curator is as sure of together when Show more brings another batch’s', async () => {
    const other = 'asset.archive:short:2026-10-12';
    curatorMock.group.mockImplementation((key: string, _status: string, _limit: number, offset: number) => {
      const batch =
        key === KEY ? [clip(1), clip(2)] : offset === 0 ? [clip(3, 0.65), clip(4, 0.65)] : [clip(5), clip(6)];
      return Promise.resolve({ ...page(batch), group: { ...page(batch).group, key }, total: key === KEY ? 2 : 4 });
    });
    const user = userEvent.setup();
    render(InboxGroupView, { keys: [KEY, other], onChange: vi.fn() });
    await screen.findAllByRole('article');

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(6));
    expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-labelledby'))).toEqual(
      [101, 102, 105, 106, 103, 104].map((id) => `item-${id}-title`),
    );
    expect(screen.getAllByText('80% sure')).toHaveLength(1);
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

// Local Omarchy layer (2026-10-23, the owner's "Inbox cards by when and where"): a card about one photo or clip is
// headed by when and where from Gallery's asset, the file's name moving to the muted line under it, and every button on
// it is described by that heading and line. Gallery is asked only for the cards near the screen, a few at a time.
describe('InboxGroupView by when and where', () => {
  const near = async (cards: HTMLElement[]) => {
    NearObserver.enter(cards);
    await Promise.resolve();
  };

  it("keeps Curator's heading, its line held, until the card comes near the screen", async () => {
    waiting([clip(1), clip(2)]);
    await renderKind();
    const [first] = await screen.findAllByRole('article');

    expect(first).toHaveAccessibleName('IMG_5399.MOV');
    expect(first).toHaveAttribute('data-facts', 'waiting');
    // the line is there, empty, so the card keeps its height when the facts come
    expect(first.querySelector('.item-facts')).toHaveTextContent(/^$/);
    expect(getAssetInfoMock).not.toHaveBeenCalled();
  });

  it('heads the card by when and where once Gallery says them, the file’s name under it', async () => {
    waiting([clip(1), clip(2)]);
    getAssetInfoMock.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve(
        id === 'asset-1'
          ? clipAsset(1, { stack: { id: 'stack', assetCount: 3, primaryAssetId: 'other' } })
          : clipAsset(2, { exifInfo: { city: null, country: 'Testland' }, duration: 2400, isTrashed: true }),
      ),
    );
    await renderKind();
    const cards = await screen.findAllByRole('article');

    await near(cards);

    await waitFor(() => expect(cards[0]).toHaveAccessibleName('Oct 11, 2019 · Riverton · 0.1 s'));
    expect(cards[0]).toHaveAttribute('data-facts', 'shown');
    expect(within(cards[0]).getByText('IMG_5399.MOV · In a stack of 3 photos')).toHaveClass('ws-inbox-meta');
    await waitFor(() => expect(cards[1]).toHaveAccessibleName('Oct 11, 2019 · Testland · 0:02'));
    expect(within(cards[1]).getByText('IMG_5400.MOV · In the Trash')).toBeInTheDocument();
    expect(getAssetInfoMock).toHaveBeenCalledTimes(2);
  });

  it('describes every button and photo on a card by its heading and line', async () => {
    waiting([clip(1), clip(2)]);
    getAssetInfoMock.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve(id === 'asset-1' ? clipAsset(1, { visibility: AssetVisibility.Hidden }) : clipAsset(2)),
    );
    await renderKind();
    const cards = await screen.findAllByRole('article');

    await near(cards);

    const about = 'Oct 11, 2019 · Riverton · 0.1 s IMG_5399.MOV · Part of a Live Photo';
    await waitFor(() =>
      expect(within(cards[0]).getByRole('button', { name: 'Archive' })).toHaveAccessibleDescription(about),
    );
    expect(within(cards[0]).getByRole('button', { name: 'Reject' })).toHaveAccessibleDescription(about);
    expect(within(cards[0]).getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription(about);
    expect(within(cards[0]).getByRole('link', { name: 'Open large preview' })).toHaveAccessibleDescription(about);
    // the card itself says its line, then its run's confidence where it has one
    expect(cards[0]).toHaveAccessibleDescription('IMG_5399.MOV · Part of a Live Photo');
    // and the next card is told apart from it
    expect(within(cards[1]).getByRole('button', { name: 'Delete' })).toHaveAccessibleDescription(
      'Oct 11, 2019 · Riverton · 0.1 s IMG_5400.MOV',
    );
  });

  it("names a card's buttons by Curator's heading where Gallery could not say", async () => {
    waiting([clip(1)]);
    getAssetInfoMock.mockRejectedValue(new Error('400'));
    await renderKind();
    const [card] = await screen.findAllByRole('article');

    await near([card]);

    await waitFor(() => expect(card).toHaveAttribute('data-facts', 'failed'));
    expect(card).toHaveAccessibleName('IMG_5399.MOV');
    expect(within(card).getByRole('button', { name: 'Archive' })).toHaveAccessibleDescription('IMG_5399.MOV');
  });

  it('asks only for the cards near the screen, a few at a time, each photo once', async () => {
    waiting(Array.from({ length: 12 }, (_, n) => clip(n)));
    const answers: (() => void)[] = [];
    getAssetInfoMock.mockImplementation(
      ({ id }: { id: string }) =>
        new Promise((resolve) => {
          answers.push(() => resolve(clipAsset(Number(id.replace('asset-', '')))));
        }),
    );
    await renderKind();
    const cards = await screen.findAllByRole('article');

    await near(cards.slice(0, 6));
    expect(getAssetInfoMock).toHaveBeenCalledTimes(FACTS_AT_ONCE);
    answers.shift()!();
    await waitFor(() => expect(getAssetInfoMock).toHaveBeenCalledTimes(FACTS_AT_ONCE + 1));
    for (const answer of answers.splice(0)) {
      answer();
    }
    await waitFor(() => expect(getAssetInfoMock).toHaveBeenCalledTimes(6));
    for (const answer of answers.splice(0)) {
      answer();
    }
    await waitFor(() => expect(cards[5]).toHaveAttribute('data-facts', 'shown'));
    // the cards further down are not asked about, and a card seen again asks nothing
    expect(cards[6]).toHaveAttribute('data-facts', 'waiting');
    await near(cards.slice(0, 2));
    expect(getAssetInfoMock).toHaveBeenCalledTimes(6);
    expect(getAssetInfoMock.mock.calls.map(([{ id }]) => id)).toEqual(
      Array.from({ length: 6 }, (_, n) => `asset-${n}`),
    );
  });

  it("keeps a title of the card's own, when and where on the line under it", async () => {
    const caption: Suggestion = {
      ...clip(1),
      kind: 'asset.describe',
      title: 'A dog on the beach',
      payload: { asset_id: 'asset-1', description: 'A dog on the beach (AI)' },
    };
    waiting([caption]);
    getAssetInfoMock.mockResolvedValue(clipAsset(1, { type: AssetTypeEnum.Image, duration: null }));
    await renderKind();
    const [card] = await screen.findAllByRole('article');

    await near([card]);

    await waitFor(() => expect(within(card).getByText('Oct 11, 2019 · Riverton')).toBeInTheDocument());
    expect(card).toHaveAccessibleName('A dog on the beach');
  });

  it('asks nothing for a card about many photos, and holds no line for it', async () => {
    const album: Suggestion = {
      ...clip(1),
      kind: 'album.create',
      title: 'Best of 2003',
      asset_ids: ['a', 'b', 'c'],
      payload: { name: 'Best of 2003', asset_ids: ['a', 'b', 'c'] },
    };
    waiting([album]);
    await renderKind();
    const [card] = await screen.findAllByRole('article');

    await near([card]);

    expect(getAssetInfoMock).not.toHaveBeenCalled();
    expect(card).not.toHaveAttribute('data-facts');
    expect(card.querySelector('.item-facts')).toBeNull();
    expect(within(card).getByRole('button', { name: 'Archive' })).toHaveAccessibleDescription('Best of 2003');
  });
});
