import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import type { JobRow } from '$lib/utils/curator';
import { assetFactory } from '@test-data/factories/asset-factory';
import AdjustPhoto from './AdjustPhoto.svelte';

// Local Omarchy layer: the photo viewer's Adjust panel against a stand-in Curator. happy-dom has no WebGL, so the panel
// shows the photo as it is and says the preview needs WebGL 2; everything else works the same: the sliders, filters
// and straighten make the settings, Keep sends them, follows the job and accepts its suggestion, and the undo goes
// through Curator's.

const { curatorMock, sdkMock, toastMock, dialogMock } = vi.hoisted(() => ({
  curatorMock: {
    adjust: vi.fn(),
    jobs: vi.fn(),
    decide: vi.fn(),
    undo: vi.fn(),
    cancelJob: vi.fn(),
  },
  sdkMock: { getAssetInfo: vi.fn(), getStack: vi.fn() },
  toastMock: { primary: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
  dialogMock: vi.fn(),
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
  modalManager: { showDialog: dialogMock },
}));

const job = (fields: Partial<JobRow>): JobRow => ({
  id: 7,
  kind: 'live.adjust',
  status: 'queued',
  progress: {},
  result: null,
  error: null,
  created_at: '2026-10-15T10:00:00Z',
  started_at: null,
  finished_at: null,
  ...fields,
});

const original = assetFactory.build({ id: 'a' });
const version = assetFactory.build({ id: 'v', thumbhash: 'drawn' });

const slider = (name: string) => screen.getByRole('slider', { name: new RegExp(name) });

describe('AdjustPhoto', () => {
  beforeEach(() => {
    HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
    curatorMock.adjust.mockResolvedValue({ job: 7 });
    curatorMock.jobs.mockResolvedValue([job({ status: 'done', result: { suggestion_id: 99 } })]);
    curatorMock.decide.mockResolvedValue({ applied: [99], failed: [] });
    curatorMock.undo.mockResolvedValue({ undone: [99], conflicts: [] });
    curatorMock.cancelJob.mockResolvedValue({ cancelled: true });
    sdkMock.getAssetInfo.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve(id === 'v' ? version : { ...original, stack: { id: 's', primaryAssetId: 'v', assetCount: 2 } }),
    );
    sdkMock.getStack.mockResolvedValue({ id: 's', primaryAssetId: 'v', assets: [version, original] });
  });

  afterEach(() => {
    undoManager.entries = [];
  });

  it('offers Keep and Reset only once something is changed', async () => {
    render(AdjustPhoto, { asset: original, onClose: vi.fn() });
    expect(screen.getByRole('button', { name: 'keep' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'reset' })).toBeDisabled();

    await fireEvent.input(slider('adjust_exposure'), { target: { value: '20' } });
    expect(screen.getByText('+20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'keep' })).toBeEnabled();

    await fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(screen.getByRole('button', { name: 'keep' })).toBeDisabled();
  });

  it('says when the browser cannot show the preview', async () => {
    render(AdjustPhoto, { asset: original, onClose: vi.fn() });
    expect(await screen.findByText('adjust_no_preview')).toBeInTheDocument();
  });

  it('keeps: sends the settings, accepts the new version, shows it and records the undo', async () => {
    const onClose = vi.fn();
    const onKept = vi.fn();
    render(AdjustPhoto, { asset: original, onClose, onKept });
    await fireEvent.input(slider('adjust_contrast'), { target: { value: '-35' } });
    await fireEvent.click(screen.getByRole('button', { name: 'adjust_filters' }));
    await fireEvent.click(screen.getByRole('button', { name: 'adjust_filter_noir' }));
    await fireEvent.input(slider('adjust_intensity'), { target: { value: '60' } });
    await fireEvent.click(screen.getByRole('button', { name: 'adjust_straighten' }));
    await fireEvent.input(slider('adjust_straighten'), { target: { value: '2.5' } });
    expect(screen.getByText('+2.5°')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'keep' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const [assetId, settings] = curatorMock.adjust.mock.calls[0];
    expect(assetId).toBe('a');
    expect(settings).toMatchObject({ contrast: -0.35, filter: 'noir', intensity: 0.6, angle: 2.5, exposure: 0 });
    expect(curatorMock.decide).toHaveBeenCalledWith([99], 'accept');
    expect(onKept).toHaveBeenCalledWith(version);
    expect(toastMock.primary).toHaveBeenCalledWith(expect.objectContaining({ description: 'adjust_kept' }), {
      timeout: 8000,
    });

    // the bar's undo takes it back through Curator
    expect(undoManager.entries[0].label).toBe('adjust_kept');
    await undoManager.undo();
    expect(curatorMock.undo).toHaveBeenCalledWith([99]);
  });

  it('stays open with the settings when Curator fails', async () => {
    curatorMock.jobs.mockResolvedValue([job({ status: 'failed', error: 'the photo is too large\nTraceback' })]);
    const onClose = vi.fn();
    render(AdjustPhoto, { asset: original, onClose });
    await fireEvent.input(slider('adjust_warmth'), { target: { value: '40' } });
    await fireEvent.click(screen.getByRole('button', { name: 'keep' }));
    expect(await screen.findByText('adjust_failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'keep' })).toBeEnabled();
    expect(curatorMock.decide).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before throwing changes away, and leaves at once when there are none', async () => {
    const onClose = vi.fn();
    render(AdjustPhoto, { asset: original, onClose });
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogMock).not.toHaveBeenCalled();

    await fireEvent.input(slider('adjust_tint'), { target: { value: '10' } });
    dialogMock.mockResolvedValueOnce(false);
    await fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    await waitFor(() => expect(dialogMock).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);

    dialogMock.mockResolvedValueOnce(true);
    await fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('keeps the viewer from its own keys while open', async () => {
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    render(AdjustPhoto, { asset: original, onClose: vi.fn() });
    await fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(outside).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outside);
  });
});
