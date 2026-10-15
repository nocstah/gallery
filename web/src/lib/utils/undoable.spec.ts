// Local Omarchy layer: the undo history (managers/undo-manager) and the undos that need more than setting a value
// back: tags (only the ones an action added come off), edits (each photo gets its own edits from before) and people
// shown and hidden in bulk (only those that changed go back).
import { AssetEditAction, type AssetResponseDto } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import type { MessageFormatter } from 'svelte-i18n';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import { visibilitiesDone } from '$lib/services/person.service';
import { waitForWebsocketEvent } from '$lib/stores/websocket';
import { refreshAssets } from '$lib/utils/asset-refresh';
import { beforeChange, editsDone, taggedDone, untaggedDone } from '$lib/utils/undoable';
import { personFactory } from '@test-data/factories/person-factory';

vi.mock('$lib/stores/websocket');
vi.mock('$lib/utils/asset-refresh', () => ({ refreshAssets: vi.fn() }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { primary: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() },
}));

const $t = ((key: string) => key) as MessageFormatter;

/** an asset as getAssetInfo answers it, with just the tags these tests read */
const withTags = (id: string, tagIds: string[]) =>
  ({ id, exifInfo: {}, tags: tagIds.map((tagId) => ({ id: tagId })) }) as unknown as AssetResponseDto;

describe('undo history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    undoManager.entries = [];
    vi.mocked(waitForWebsocketEvent).mockResolvedValue(undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('tagging', () => {
    it('takes off only the tags each photo did not have before', async () => {
      sdkMock.getAssetInfo.mockImplementation(({ id }) =>
        Promise.resolve(withTags(id, id === 'asset-a' ? ['tag-1'] : [])),
      );
      const before = await beforeChange(['asset-a', 'asset-b']);

      taggedDone(['asset-a', 'asset-b'], ['tag-1', 'tag-2'], before, 'tagged');
      expect(undoManager.entries).toHaveLength(1);
      // the toast stays long enough to reach its Undo
      expect(toastManager.primary).toHaveBeenCalledWith(expect.objectContaining({ description: 'tagged' }), {
        timeout: 8000,
      });

      await undoManager.undo();

      expect(sdkMock.untagAssets).toHaveBeenCalledTimes(2);
      expect(sdkMock.untagAssets).toHaveBeenCalledWith({ id: 'tag-1', bulkIdsDto: { ids: ['asset-b'] } });
      expect(sdkMock.untagAssets).toHaveBeenCalledWith({ id: 'tag-2', bulkIdsDto: { ids: ['asset-a', 'asset-b'] } });
      expect(refreshAssets).toHaveBeenCalledWith(['asset-b', 'asset-a']);
      expect(undoManager.entries).toHaveLength(0);
    });

    it('records no undo when every photo already had the tags', async () => {
      sdkMock.getAssetInfo.mockImplementation(({ id }) => Promise.resolve(withTags(id, ['tag-1'])));
      const before = await beforeChange(['asset-a']);

      taggedDone(['asset-a'], ['tag-1'], before, 'tagged');

      expect(undoManager.entries).toHaveLength(0);
      expect(toastManager.primary).toHaveBeenCalledWith('tagged');
    });

    it('records no undo when the photos could not be read beforehand', async () => {
      sdkMock.getAssetInfo.mockRejectedValue(new Error('offline'));
      const before = await beforeChange(['asset-a']);

      taggedDone(['asset-a'], ['tag-1'], before, 'tagged');

      expect(before).toBeUndefined();
      expect(undoManager.entries).toHaveLength(0);
      expect(toastManager.primary).toHaveBeenCalledWith('tagged');
    });

    it('puts a removed tag back', async () => {
      untaggedDone('asset-a', { id: 'tag-1', value: 'Travel/Bangkok' });

      await undoManager.undo();

      expect(sdkMock.bulkTagAssets).toHaveBeenCalledWith({
        tagBulkAssetsDto: { assetIds: ['asset-a'], tagIds: ['tag-1'] },
      });
    });

    it('keeps an entry whose undo failed, to try again', async () => {
      sdkMock.bulkTagAssets.mockRejectedValueOnce(new Error('offline'));
      untaggedDone('asset-a', { id: 'tag-1', value: 'Travel' });

      await undoManager.undo();

      expect(undoManager.entries).toHaveLength(1);
      expect(toastManager.danger).toHaveBeenCalled();
    });
  });

  describe('edits', () => {
    const rotate = { action: AssetEditAction.Rotate, parameters: { angle: 90 } };

    it('gives each photo its edits from before, clearing those of a photo that had none', async () => {
      editsDone(
        'rotated',
        [
          { id: 'asset-a', edits: [] },
          { id: 'asset-b', edits: [rotate] },
        ],
        { toast: 'rotated', tone: 'success' },
      );
      expect(toastManager.success).toHaveBeenCalledWith(expect.objectContaining({ description: 'rotated' }), {
        timeout: 8000,
      });

      await undoManager.undo();

      expect(sdkMock.removeAssetEdits).toHaveBeenCalledWith({ id: 'asset-a' });
      expect(sdkMock.editAsset).toHaveBeenCalledWith({ id: 'asset-b', assetEditsCreateDto: { edits: [rotate] } });
      expect(refreshAssets).toHaveBeenCalledWith(['asset-a', 'asset-b']);
    });

    it('records quietly without a toast of its own', () => {
      editsDone('rotate_right', [{ id: 'asset-a', edits: [] }]);

      expect(undoManager.entries).toHaveLength(1);
      expect(toastManager.primary).not.toHaveBeenCalled();
    });

    it('still shows the toast when nothing was changed', () => {
      editsDone('rotated', [], { toast: 'rotated (2 failed)', tone: 'warning' });

      expect(undoManager.entries).toHaveLength(0);
      expect(toastManager.warning).toHaveBeenCalledWith('rotated (2 failed)');
    });
  });

  describe('people shown and hidden in bulk', () => {
    it('sets back only those the undo changed, and keeps the entry while any failed', async () => {
      const anna = personFactory.build({ id: 'anna', isHidden: true });
      const ben = personFactory.build({ id: 'ben', isHidden: false });
      const emit = vi.spyOn(eventManager, 'emit');
      sdkMock.updatePeople.mockResolvedValue([
        { id: 'anna', success: true },
        { id: 'ben', success: false },
      ]);

      const entry = visibilitiesDone(
        $t,
        [
          { id: 'anna', isHidden: true },
          { id: 'ben', isHidden: false },
        ],
        [anna, ben],
      );
      expect(entry).toBeDefined();

      await undoManager.undo(entry);

      expect(sdkMock.updatePeople).toHaveBeenCalledWith({
        peopleUpdateDto: {
          people: [
            { id: 'anna', isHidden: false },
            { id: 'ben', isHidden: true },
          ],
        },
      });
      expect(emit).toHaveBeenCalledWith('PersonUpdate', { ...anna, isHidden: false });
      expect(emit).not.toHaveBeenCalledWith('PersonUpdate', expect.objectContaining({ id: 'ben' }));
      expect(undoManager.entries).toHaveLength(1);
    });

    it('records nothing when nothing changed', () => {
      expect(visibilitiesDone($t, [], [])).toBeUndefined();
      expect(undoManager.entries).toHaveLength(0);
    });
  });
});
