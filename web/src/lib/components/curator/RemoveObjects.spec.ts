import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { CuratorError, type JobRow, type Suggestion } from '$lib/utils/curator';
import { assetFactory } from '@test-data/factories/asset-factory';
import RemoveObjects from './RemoveObjects.svelte';

// Local Omarchy layer: the object-removal brush against a stand-in Curator: painting enables Remove, the mask goes to
// /api/inpaint, the job is followed until its suggestion arrives, and Keep / Discard decide that suggestion.

const { curatorMock, sdkMock, toastMock } = vi.hoisted(() => ({
  curatorMock: {
    inpaint: vi.fn(),
    jobs: vi.fn(),
    suggestion: vi.fn(),
    decide: vi.fn(),
    cancelJob: vi.fn(),
  },
  sdkMock: { getAssetInfo: vi.fn(), getStack: vi.fn() },
  toastMock: { primary: vi.fn() },
}));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: curatorMock,
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  ...sdkMock,
}));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: toastMock,
}));

const job = (fields: Partial<JobRow>): JobRow => ({
  id: 7,
  kind: 'restore.inpaint',
  status: 'queued',
  progress: {},
  result: null,
  error: null,
  created_at: '2026-10-10T16:00:00Z',
  started_at: null,
  finished_at: null,
  ...fields,
});

const retouched: Suggestion = {
  id: 99,
  kind: 'restore.publish',
  target_id: 'retouch:a:7',
  title: 'IMG_0842, retouched',
  detail: null,
  asset_ids: ['a'],
  payload: { asset_id: 'a', variant: 'retouched', width: 400, height: 300, file: '0123456789abcdef.jpg' },
  confidence: null,
  status: 'pending',
  model: 'retouch@1',
  error: null,
  created_at: '2026-10-10T16:00:00Z',
};

const context = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
};

const paint = async (container: HTMLElement) => {
  const image = container.querySelector('img')!;
  Object.defineProperties(image, {
    naturalWidth: { value: 400 },
    naturalHeight: { value: 300 },
  });
  await fireEvent.load(image);
  const canvas = container.querySelector('canvas')!;
  await fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerType: 'mouse', button: 0 });
  await fireEvent.pointerMove(canvas, { clientX: 40, clientY: 25, pointerType: 'mouse' });
  await fireEvent.pointerUp(canvas, { pointerType: 'mouse' });
};

describe('RemoveObjects', () => {
  beforeEach(() => {
    Object.defineProperties(HTMLCanvasElement.prototype, {
      getContext: { value: () => context, configurable: true },
      toDataURL: {
        value: () => 'data:image/png;base64,TUFTSw==',
        configurable: true,
      },
    });
    curatorMock.inpaint.mockResolvedValue({ job: 7, mask: '0123456789abcdef.png' });
    curatorMock.suggestion.mockResolvedValue(retouched);
    curatorMock.cancelJob.mockResolvedValue({ cancelled: true });
    sdkMock.getAssetInfo.mockResolvedValue({ id: 'a', stack: null });
  });

  it('only offers Remove once something is painted', async () => {
    const { container } = render(RemoveObjects, { asset: assetFactory.build({ id: 'a' }), onClose: vi.fn() });
    expect(screen.getByRole('button', { name: 'remove_objects_submit' })).toBeDisabled();
    await paint(container);
    expect(screen.getByRole('button', { name: 'remove_objects_submit' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'remove_objects_undo' }));
    expect(screen.getByRole('button', { name: 'remove_objects_submit' })).toBeDisabled();
  });

  it('sends the mask, says what it waits for, and keeps the new version', async () => {
    curatorMock.jobs
      .mockResolvedValueOnce([
        job({ status: 'queued' }),
        job({ id: 5, kind: 'restore.photos', status: 'running', progress: { done: 3, total: 40, paused: true } }),
      ])
      .mockResolvedValue([job({ status: 'done', result: { suggestion_id: 99 } })]);
    curatorMock.decide.mockResolvedValue({ applied: [99] });
    const onClose = vi.fn();
    const { container } = render(RemoveObjects, { asset: assetFactory.build({ id: 'a' }), onClose });
    await paint(container);
    await fireEvent.click(screen.getByRole('button', { name: 'remove_objects_submit' }));

    expect(curatorMock.inpaint).toHaveBeenCalledWith('a', 'data:image/png;base64,TUFTSw==');
    expect(await screen.findByText('remove_objects_waiting_paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cancel' })).toBeInTheDocument();

    const keep = await screen.findByRole('button', { name: 'remove_objects_keep' }, { timeout: 3000 });
    expect(curatorMock.suggestion).toHaveBeenCalledWith(99);
    await fireEvent.click(keep);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(curatorMock.decide).toHaveBeenCalledWith([99], 'accept');
    expect(toastMock.primary).toHaveBeenCalledWith('remove_objects_kept');
  });

  it('goes back to the strokes when the new version is discarded', async () => {
    curatorMock.jobs.mockResolvedValue([job({ status: 'done', result: { suggestion_id: 99 } })]);
    curatorMock.decide.mockResolvedValue({ rejected: 1 });
    const { container } = render(RemoveObjects, { asset: assetFactory.build({ id: 'a' }), onClose: vi.fn() });
    await paint(container);
    await fireEvent.click(screen.getByRole('button', { name: 'remove_objects_submit' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'remove_objects_discard' }));

    expect(curatorMock.decide).toHaveBeenCalledWith([99], 'reject');
    expect(await screen.findByRole('button', { name: 'remove_objects_submit' })).toBeEnabled();
  });

  it("shows Curator's refusal and stays on the strokes", async () => {
    curatorMock.inpaint.mockRejectedValue(new CuratorError('Paint over what should go first', 400));
    const { container } = render(RemoveObjects, { asset: assetFactory.build({ id: 'a' }), onClose: vi.fn() });
    await paint(container);
    await fireEvent.click(screen.getByRole('button', { name: 'remove_objects_submit' }));

    expect(await screen.findByText('remove_objects_failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'remove_objects_submit' })).toBeEnabled();
    expect(curatorMock.jobs).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(RemoveObjects, { asset: assetFactory.build({ id: 'a' }), onClose });
    await fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
