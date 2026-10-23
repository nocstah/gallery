import { AssetTypeEnum, AssetVisibility } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import type { Suggestion } from '$lib/utils/curator';
import { kindAction } from '$lib/utils/curator-inbox';
import { InboxFactsLoader } from '$lib/utils/inbox-facts';
import { assetFactory } from '@test-data/factories/asset-factory';
import ReviewMode from './ReviewMode.svelte';

// Local Omarchy layer: review mode decides from the keyboard, one suggestion at a time; a held key decides once (its
// repeats had applied item after item), and the repeats go nowhere else either.

const { curatorMock, waitingInMock } = vi.hoisted(() => ({
  curatorMock: { decide: vi.fn(), undo: vi.fn(), reopen: vi.fn() },
  waitingInMock: vi.fn(),
}));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: curatorMock,
}));
vi.mock('$lib/utils/curator-inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator-inbox')>()),
  waitingIn: waitingInMock,
}));
vi.mock('$lib/components/curator/ReviewStage.svelte', async () => {
  const { default: MockComponent } = await import('@test-data/mocks/noop-component.svelte');
  return { default: MockComponent };
});

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});

const clip = (n: number): Suggestion => ({
  id: 100 + n,
  kind: 'asset.archive',
  target_id: `asset-${n}`,
  title: `IMG_${5398 + n}.MOV`,
  detail: null,
  asset_ids: [`asset-${n}`],
  payload: { asset_id: `asset-${n}` },
  confidence: 0.8,
  status: 'pending',
  model: 'junk@1',
  error: null,
  created_at: '2026-10-10T20:00:00Z',
  story: null,
});

const key = (name: string, repeat = false) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: name, repeat });

describe('ReviewMode', () => {
  beforeEach(() => {
    for (const mock of [...Object.values(curatorMock), waitingInMock]) {
      mock.mockReset();
    }
    waitingInMock.mockResolvedValue([clip(1), clip(2), clip(3)]);
    curatorMock.decide.mockImplementation((ids: number[]) => Promise.resolve({ applied: ids }));
  });

  const renderReview = async () => {
    render(ReviewMode, {
      keys: ['asset.archive:short:2026-10-11'],
      title: 'Very short clips',
      action: kindAction('asset.archive:short', 'asset.archive'),
      onClose: vi.fn(),
    });
    expect(await screen.findByText('IMG_5399.MOV')).toBeInTheDocument();
  };

  it('decides once for a held →, whose repeats are swallowed', async () => {
    await renderReview();

    await key('ArrowRight');
    await waitFor(() => expect(screen.getByText('IMG_5400.MOV')).toBeInTheDocument());
    for (let repeat = 0; repeat < 5; repeat++) {
      expect(await key('ArrowRight', true)).toBe(false); // prevented: it scrolls nothing and presses nothing
    }

    expect(curatorMock.decide).toHaveBeenCalledTimes(1);
    expect(curatorMock.decide).toHaveBeenCalledWith([101], 'accept');
    expect(screen.getByText('IMG_5400.MOV')).toBeInTheDocument();
  });

  it('ignores the repeats of every other decision key too', async () => {
    await renderReview();

    for (const name of ['a', 'r', 'ArrowLeft', 's', ' ', 'u', 'Backspace']) {
      await key(name, true);
    }

    expect(curatorMock.decide).not.toHaveBeenCalled();
    expect(curatorMock.undo).not.toHaveBeenCalled();
    expect(curatorMock.reopen).not.toHaveBeenCalled();
    expect(screen.getByText('IMG_5399.MOV')).toBeInTheDocument(); // not skipped either
  });

  it('still decides each fresh press', async () => {
    await renderReview();

    await key('a');
    await waitFor(() => expect(screen.getByText('IMG_5400.MOV')).toBeInTheDocument());
    await key('r');
    await waitFor(() => expect(screen.getByText('IMG_5401.MOV')).toBeInTheDocument());

    expect(curatorMock.decide).toHaveBeenNthCalledWith(1, [101], 'accept');
    expect(curatorMock.decide).toHaveBeenNthCalledWith(2, [102], 'reject');
  });

  // Local Omarchy layer (the owner's "Inbox cards by when and where"): a suggestion about one clip is headed by when
  // and where, as its card is, the next one's facts asked for while this one is on screen
  it('heads a clip by when and where, and describes the buttons by it', async () => {
    const fetchAsset = vi.fn((id: string) =>
      Promise.resolve(
        assetFactory.build({
          id,
          type: AssetTypeEnum.Video,
          localDateTime: '2019-10-11T15:55:06.000Z',
          exifInfo: { city: 'Riverton', country: 'Testland' },
          duration: 100,
          originalFileName: `IMG_${5398 + Number(id.replace('asset-', ''))}.MOV`,
          visibility: AssetVisibility.Timeline,
          isTrashed: false,
          livePhotoVideoId: null,
          stack: null,
        }),
      ),
    );
    render(ReviewMode, {
      keys: ['asset.archive:short:2026-10-11'],
      title: 'Very short clips',
      action: kindAction('asset.archive:short', 'asset.archive'),
      facts: new InboxFactsLoader(fetchAsset),
      onClose: vi.fn(),
    });

    expect(await screen.findByText('Oct 11, 2019 · Riverton · 0.1 s')).toBeInTheDocument();
    expect(screen.getByText('IMG_5399.MOV')).toHaveClass('ws-inbox-meta');
    expect(fetchAsset.mock.calls.map(([id]) => id)).toEqual(['asset-1', 'asset-2']);
    expect(screen.getByRole('button', { name: 'Archive' })).toHaveAccessibleDescription(
      'Oct 11, 2019 · Riverton · 0.1 s IMG_5399.MOV',
    );

    await key('s');
    await waitFor(() => expect(screen.getByText('IMG_5400.MOV')).toBeInTheDocument());
    expect(fetchAsset.mock.calls.map(([id]) => id)).toEqual(['asset-1', 'asset-2', 'asset-3']);
  });
});
