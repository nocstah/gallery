import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { type Suggestion } from '$lib/utils/curator';
import { kindAction } from '$lib/utils/curator-inbox';
import InboxInspector from './InboxInspector.svelte';
import ReviewMode from './ReviewMode.svelte';
import SuggestionVisual from './SuggestionVisual.svelte';

const { decide, waitingIn } = vi.hoisted(() => ({ decide: vi.fn(), waitingIn: vi.fn() }));
vi.mock('$lib/utils/curator', async (original) => ({
  ...(await original<typeof import('$lib/utils/curator')>()),
  curator: { decide, undo: vi.fn(), reopen: vi.fn() },
}));
vi.mock('$lib/utils/curator-inbox', async (original) => ({
  ...(await original<typeof import('$lib/utils/curator-inbox')>()),
  waitingIn,
}));
vi.mock('@immich/sdk', async (original) => ({
  ...(await original<typeof import('@immich/sdk')>()),
  getAssetInfo: vi.fn().mockRejectedValue(new Error('metadata unavailable')),
}));

const suggestion = (overrides: Partial<Suggestion> = {}): Suggestion => ({
  id: 19,
  kind: 'restore.publish',
  target_id: 'photo-1',
  title: 'Restored print',
  detail: null,
  asset_ids: ['photo-1'],
  payload: { width: 2320, height: 1568 },
  confidence: 0.8,
  status: 'pending',
  model: 'restore@1',
  error: null,
  created_at: '2026-10-20T00:00:00Z',
  story: null,
  ...overrides,
});

beforeAll(async () => {
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
  await waitLocale('en-US');
});
beforeEach(() => {
  decide.mockReset();
  waitingIn.mockReset();
});

describe('inbox inspection', () => {
  it('distinguishes comparison dragging from clicking and loads full-resolution comparison images', async () => {
    render(SuggestionVisual, { suggestion: suggestion() });
    const divider = screen.getByRole('slider');
    await fireEvent.pointerDown(divider, { clientX: 100, clientY: 100, pointerId: 1 });
    await fireEvent.pointerMove(divider, { clientX: 200, clientY: 100, pointerId: 1 });
    await fireEvent.pointerUp(divider, { clientX: 200, clientY: 100, pointerId: 1 });
    await fireEvent.click(divider);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await fireEvent.pointerDown(divider, { clientX: 100, clientY: 100, pointerId: 2 });
    await fireEvent.pointerUp(divider, { clientX: 100, clientY: 100, pointerId: 2 });
    await fireEvent.click(divider);
    const dialog = screen.getByRole('dialog', { name: 'Restored print' });
    const urls = [...dialog.querySelectorAll('img')].map((image) => image.src);
    expect(urls).toHaveLength(2);
    expect(urls.every((url) => !new URL(url).searchParams.has('width'))).toBe(true);
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }));
    expect(within(dialog).getByText('150%')).toBeInTheDocument();
    await fireEvent.input(within(dialog).getByRole('slider'), { target: { value: 80 } });
    expect(within(dialog).getByRole('slider')).toHaveValue('80');
    expect(within(dialog).getByText('150%')).toBeInTheDocument();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Fit to screen' }));
    expect(within(dialog).getByText('100%')).toBeInTheDocument();
  });

  it('opens face crops and retains both choices and the source photo', async () => {
    render(SuggestionVisual, {
      suggestion: suggestion({ kind: 'person.portrait', target_id: 'person-1', payload: { face_id: 'face-2' } }),
    });
    const trigger = screen.getByRole('button', { name: 'Proposed: Open large preview' });
    trigger.focus();
    await fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('img', { name: 'Proposed' })).toHaveAttribute(
      'src',
      '/api/people/person-1/faces/face-2/thumbnail',
    );
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Previous' }));
    expect(within(dialog).getByRole('img', { name: 'Now' })).toHaveAttribute('src', '/api/people/person-1/thumbnail');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('isolates preview keys from the review queue and Escape closes only the preview', async () => {
    waitingIn.mockResolvedValue([suggestion(), suggestion({ id: 20, title: 'Second print' })]);
    const closeReview = vi.fn();
    render(ReviewMode, {
      keys: ['restore.publish:prints'],
      title: 'Prints',
      action: kindAction('restore.publish:prints', 'restore.publish'),
      onClose: closeReview,
    });
    const trigger = await screen.findByRole('button', { name: 'Open large preview' });
    trigger.focus();
    await fireEvent.click(trigger);
    const inspector = screen.getByRole('dialog', { name: 'Restored print' });
    for (const key of ['a', 'r', 'ArrowRight', 'ArrowLeft', 's', ' ', 'u', 'Backspace']) {
      await fireEvent.keyDown(inspector, { key });
    }
    // Even window-directed events cannot reach the underlying decision handler.
    dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(decide).not.toHaveBeenCalled();
    await fireEvent.keyDown(inspector, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Restored print' })).not.toBeInTheDocument();
    expect(closeReview).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('keeps failed media recoverable and resets zoom when moving to another photo', async () => {
    render(InboxInspector, {
      title: 'Evidence',
      items: [{ src: '/first.jpg' }, { src: '/second.jpg' }],
      onClose: vi.fn(),
    });
    await fireEvent.error(screen.getByRole('img', { name: 'Evidence' }));
    expect(screen.getByText('Error loading image')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('img', { name: 'Evidence' })).toHaveAttribute('src', '/first.jpg');
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'Evidence' })).toHaveAttribute('src', '/second.jpg');
  });
});
