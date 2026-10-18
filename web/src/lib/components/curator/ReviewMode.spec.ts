import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import type { Suggestion } from '$lib/utils/curator';
import { kindAction } from '$lib/utils/curator-inbox';
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
});
