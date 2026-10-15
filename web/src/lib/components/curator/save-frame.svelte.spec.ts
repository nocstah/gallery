import type { AssetResponseDto } from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { assetViewerManager } from '$lib/managers/asset-viewer-manager.svelte';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { specialAlbums } from '$lib/managers/special-albums.svelte';
import { undoManager } from '$lib/managers/undo-manager.svelte';
import type { JobRow } from '$lib/utils/curator';
import { navigate } from '$lib/utils/navigation';
import SavedFrameToast from './SavedFrameToast.svelte';
import { saveFrame } from './save-frame.svelte';

// Local Omarchy layer: Save frame as photo against a stand-in Curator: the video on screen stops where it is, that
// moment goes to /api/frame (with the album the viewer is open in), the job is followed until the new photo's id comes
// back, and its toast and undo are recorded; the undo trashes the photo with the user's own session and takes it out of
// the album it joined. View opens it where it is: its album, the Archive, or Photos.

const { curatorMock, waitForJobMock, gotoMock } = vi.hoisted(() => ({
  curatorMock: { kinds: vi.fn(), saveFrame: vi.fn() },
  waitForJobMock: vi.fn(),
  gotoMock: vi.fn(),
}));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: curatorMock,
  waitForJob: waitForJobMock,
}));
vi.mock('$lib/utils/navigation', () => ({ navigate: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  toastManager: { primary: vi.fn(), danger: vi.fn(), custom: vi.fn() },
}));

const job = (fields: Partial<JobRow>): JobRow => ({
  id: 7,
  kind: 'frame.save',
  status: 'done',
  progress: {},
  result: null,
  error: null,
  created_at: '2026-10-15T05:00:00Z',
  started_at: null,
  finished_at: null,
  ...fields,
});

const SAVED = {
  asset_id: 'new-photo',
  video_id: 'video-1',
  seconds: 12.345,
  taken: '2026-10-07T10:48:36.345+07:00',
  file_name: 'IMG_7620 (frame 12.35s).jpg',
  width: 1920,
  height: 1080,
  hdr: true,
  visibility: 'timeline',
  album_id: null,
};

const playing = (currentTime: number) => ({ pause: vi.fn(), currentTime }) as unknown as HTMLVideoElement;

/** the toast's View and Undo, as the toast manager was handed them */
const toastProps = () => vi.mocked(toastManager.custom).mock.calls[0][0].props as Record<string, () => unknown>;

describe('saveFrame', () => {
  beforeEach(() => {
    saveFrame.reset();
    undoManager.entries = [];
    assetViewerManager.setAsset({ id: 'video-1' } as AssetResponseDto);
    curatorMock.saveFrame.mockResolvedValue({ job: 7 });
    waitForJobMock.mockResolvedValue(job({ result: SAVED }));
  });

  it('is offered when Curator has the frame.save job, and asks only once', async () => {
    curatorMock.kinds.mockResolvedValue([{ kind: 'frame.save', title: 'Save a video frame as a photo', heavy: false }]);
    saveFrame.check();
    saveFrame.check();
    await vi.waitFor(() => expect(saveFrame.available).toBe(true));
    expect(curatorMock.kinds).toHaveBeenCalledTimes(1);
  });

  it('is not offered by an older Curator, or when Curator does not answer', async () => {
    curatorMock.kinds.mockResolvedValue([{ kind: 'share.video', title: 'Video for a chat app', heavy: false }]);
    saveFrame.check();
    await vi.waitFor(() => expect(curatorMock.kinds).toHaveBeenCalled());
    expect(saveFrame.available).toBe(false);

    saveFrame.reset();
    curatorMock.kinds.mockRejectedValue(new Error('Curator is not answering'));
    saveFrame.check();
    await vi.waitFor(() => expect(curatorMock.kinds).toHaveBeenCalledTimes(2));
    expect(saveFrame.available).toBe(false);
  });

  it('knows the video on screen until its player goes', () => {
    const first = saveFrame.show(playing(0), 'video-1');
    const second = saveFrame.show(playing(0), 'video-2');
    first();
    expect(saveFrame.video?.assetId).toBe('video-2'); // a player that went before the next one came forgets nothing
    second();
    expect(saveFrame.video).toBeUndefined();
  });

  it('stops the video on its frame, asks Curator for that moment and spins until the photo is there', async () => {
    let finish!: (row: JobRow) => void;
    waitForJobMock.mockReturnValue(new Promise<JobRow>((resolve) => (finish = resolve)));
    const video = playing(12.345);
    saveFrame.show(video, 'video-1');

    const saving = saveFrame.save();
    expect(video.pause).toHaveBeenCalled();
    expect(saveFrame.isSaving('video-1')).toBe(true);
    await vi.waitFor(() => expect(waitForJobMock).toHaveBeenCalledWith(7, undefined, 400));
    expect(curatorMock.saveFrame).toHaveBeenCalledWith('video-1', 12.345, undefined);

    void saveFrame.save(); // a second press while Curator works asks nothing more
    finish(job({ result: SAVED }));
    await saving;
    expect(curatorMock.saveFrame).toHaveBeenCalledTimes(1);
    expect(saveFrame.isSaving('video-1')).toBe(false);
    expect(toastManager.custom).toHaveBeenCalledWith(
      { component: SavedFrameToast, props: expect.objectContaining({ description: 'saved_as_photo' }) },
      { timeout: 8000 },
    );
  });

  it('records an undo that trashes the new photo, from the toast or the history', async () => {
    saveFrame.show(playing(3), 'video-1');
    await saveFrame.save();
    expect(undoManager.entries.map(({ label }) => label)).toEqual(['saved_as_photo']);

    await toastProps().onUndo();

    expect(sdkMock.deleteAssets).toHaveBeenCalledWith({ assetBulkDeleteDto: { ids: ['new-photo'], force: false } });
    expect(undoManager.entries).toHaveLength(0);
    expect(toastManager.primary).toHaveBeenCalledWith('undone');
    expect(navigate).not.toHaveBeenCalled(); // the viewer was not on the new photo
  });

  it('takes a viewer showing the new photo back to the video when undone', async () => {
    saveFrame.show(playing(3), 'video-1');
    await saveFrame.save();
    assetViewerManager.setAsset({ id: 'new-photo' } as AssetResponseDto);

    await undoManager.undo();

    expect(sdkMock.deleteAssets).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ targetRoute: 'current', assetId: 'video-1' });
  });

  it('opens the new photo from the toast once Gallery has drawn it', async () => {
    sdkMock.getAssetInfo
      .mockResolvedValueOnce({ id: 'new-photo', thumbhash: null } as AssetResponseDto)
      .mockResolvedValue({ id: 'new-photo', thumbhash: 'drawn' } as AssetResponseDto);
    saveFrame.show(playing(3), 'video-1');
    await saveFrame.save();

    await toastProps().onView();

    expect(sdkMock.getAssetInfo).toHaveBeenCalledTimes(2);
    expect(gotoMock).toHaveBeenCalledOnce();
    expect(gotoMock).toHaveBeenCalledWith('/photos/new-photo');
  });

  it('opens a frame of an archived video in the Archive, where it is', async () => {
    sdkMock.getAssetInfo.mockResolvedValue({ id: 'new-photo', thumbhash: 'drawn' } as AssetResponseDto);
    waitForJobMock.mockResolvedValue(job({ result: { ...SAVED, visibility: 'archive' } }));
    saveFrame.show(playing(3), 'video-1');
    await saveFrame.save();

    await toastProps().onView();

    expect(gotoMock).toHaveBeenCalledWith('/archive/photos/new-photo');
  });

  it('puts a frame saved inside an album there, opens it there, and the undo takes it out again', async () => {
    const emit = vi.spyOn(eventManager, 'emit');
    sdkMock.getAssetInfo.mockResolvedValue({ id: 'new-photo', thumbhash: 'drawn' } as AssetResponseDto);
    waitForJobMock.mockResolvedValue(job({ result: { ...SAVED, album_id: 'album-1' } }));
    saveFrame.show(playing(3), 'video-1');

    await saveFrame.save('album-1');

    expect(curatorMock.saveFrame).toHaveBeenCalledWith('video-1', 3, 'album-1');
    // the album's page shows it once Gallery has drawn it: a live event cannot say a photo joined an album
    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('AlbumAddAssets', { assetIds: ['new-photo'], albumIds: ['album-1'] }),
    );
    await toastProps().onView();
    expect(gotoMock).toHaveBeenCalledWith('/albums/album-1/photos/new-photo');

    await undoManager.undo();

    expect(sdkMock.deleteAssets).toHaveBeenCalledWith({ assetBulkDeleteDto: { ids: ['new-photo'], force: false } });
    expect(sdkMock.removeAssetFromAlbum).toHaveBeenCalledWith({ id: 'album-1', bulkIdsDto: { ids: ['new-photo'] } });
    expect(emit).toHaveBeenCalledWith('AlbumRemoveAssets', { assetIds: ['new-photo'], albumIds: ['album-1'] });
    emit.mockRestore();
  });

  it("gives a frame saved in To do its video's tag and note there, so taking it out puts it where the video goes", async () => {
    const [todo] = specialAlbums;
    todo.albumId = 'todo-album';
    sdkMock.getAllAlbums.mockResolvedValue([]);
    sdkMock.getAssetInfo.mockResolvedValue({ id: 'new-photo', thumbhash: 'drawn' } as AssetResponseDto);
    sdkMock.upsertTags.mockResolvedValue([{ id: 'tag-todo' }] as never);
    sdkMock.getAssetMetadata.mockResolvedValue([
      { key: 'omarchy-todo', value: { from: 'timeline' }, updatedAt: '2026-10-15T05:00:00Z' },
    ] as never);
    waitForJobMock.mockResolvedValue(job({ result: { ...SAVED, visibility: 'archive', album_id: 'todo-album' } }));
    saveFrame.show(playing(3), 'video-1');

    await saveFrame.save('todo-album');

    await vi.waitFor(() =>
      expect(sdkMock.updateBulkAssetMetadata).toHaveBeenCalledWith({
        assetMetadataBulkUpsertDto: {
          items: [{ assetId: 'new-photo', key: 'omarchy-todo', value: { from: 'timeline' } }],
        },
      }),
    );
    expect(sdkMock.upsertTags).toHaveBeenCalledWith({ tagUpsertDto: { tags: ['To do'] } });
    expect(sdkMock.tagAssets).toHaveBeenCalledWith({ id: 'tag-todo', bulkIdsDto: { ids: ['new-photo'] } });
    expect(sdkMock.getAssetMetadata).toHaveBeenCalledWith({ id: 'video-1' });
    todo.albumId = undefined;
  });

  it('says why when Curator could not save it, and records nothing', async () => {
    waitForJobMock.mockResolvedValue(job({ status: 'failed', error: 'the video cannot be read: broken\nTraceback' }));
    saveFrame.show(playing(3), 'video-1');

    await saveFrame.save();

    expect(toastManager.danger).toHaveBeenCalledWith('save_frame_failed');
    expect(toastManager.custom).not.toHaveBeenCalled();
    expect(undoManager.entries).toHaveLength(0);
    expect(saveFrame.isSaving('video-1')).toBe(false);
  });

  it('does nothing without a video on screen', async () => {
    await saveFrame.save();
    expect(curatorMock.saveFrame).not.toHaveBeenCalled();
  });
});
