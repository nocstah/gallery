import { AssetVisibility, type AlbumResponseDto, type AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, screen } from '@testing-library/svelte';
import { saveFrame } from '$lib/components/curator/save-frame.svelte';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { renderWithTooltips } from '$tests/helpers';
import { assetFactory } from '@test-data/factories/asset-factory';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';
import SaveFrameAction from './SaveFrameAction.svelte';

// Local Omarchy layer: the viewer bar's Save frame as photo: there for the owner's own video on screen once Curator
// saves frames, a spinner while it works, and Shift+S doing what the button does.

const { kinds } = vi.hoisted(() => ({ kinds: vi.fn() }));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: { kinds },
}));

const video = { pause: vi.fn(), currentTime: 3 } as unknown as HTMLVideoElement;

const mine = (fields: Partial<AssetResponseDto> = {}) =>
  assetFactory.build({
    id: 'video-1',
    ownerId: 'me',
    isTrashed: false,
    visibility: AssetVisibility.Timeline,
    ...fields,
  });

describe('SaveFrameAction', () => {
  beforeEach(() => {
    saveFrame.reset();
    kinds.mockResolvedValue([{ kind: 'frame.save', title: 'Save a video frame as a photo', heavy: false }]);
    authManager.setUser(userAdminFactory.build({ id: 'me' }));
    authManager.setPreferences(preferencesFactory.build());
  });

  afterEach(() => {
    authManager.reset();
    vi.restoreAllMocks();
  });

  it("offers the button for the owner's video on screen once Curator saves frames, and saves on a click", async () => {
    const save = vi.spyOn(saveFrame, 'save').mockResolvedValue();
    saveFrame.show(video, 'video-1');
    renderWithTooltips(SaveFrameAction, { asset: mine() });

    const button = await screen.findByLabelText('save_frame_as_photo');
    await fireEvent.click(button);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(undefined); // in no album
  });

  it('saves into the album the viewer is open in', async () => {
    const save = vi.spyOn(saveFrame, 'save').mockResolvedValue();
    saveFrame.show(video, 'video-1');
    renderWithTooltips(SaveFrameAction, { asset: mine(), album: { id: 'album-1' } as AlbumResponseDto });

    await fireEvent.click(await screen.findByLabelText('save_frame_as_photo'));
    expect(save).toHaveBeenCalledWith('album-1');
  });

  it('saves on Shift+S, and only while it is offered', async () => {
    const save = vi.spyOn(saveFrame, 'save').mockResolvedValue();
    renderWithTooltips(SaveFrameAction, { asset: mine() });
    await vi.waitFor(() => expect(saveFrame.available).toBe(true));

    await fireEvent.keyDown(document, { key: 'S', shiftKey: true });
    expect(save).not.toHaveBeenCalled(); // no video on screen: a photo

    saveFrame.show(video, 'video-1');
    await screen.findByLabelText('save_frame_as_photo');
    await fireEvent.keyDown(document, { key: 's' });
    expect(save).not.toHaveBeenCalled(); // plain s is the slideshow's
    await fireEvent.keyDown(document, { key: 'S', shiftKey: true });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('spins while Curator works', async () => {
    saveFrame.show(video, 'video-1');
    saveFrame.saving = ['video-1'];
    renderWithTooltips(SaveFrameAction, { asset: mine() });

    const button = await screen.findByLabelText('saving_frame_as_photo');
    expect(button).toBeDisabled();
  });

  it.each([
    ['without a video on screen', () => mine(), false],
    ["for someone else's video", () => mine({ ownerId: 'someone-else' }), true],
    ['in the Locked Folder', () => mine({ visibility: AssetVisibility.Locked }), true],
    ['in the trash', () => mine({ isTrashed: true }), true],
  ])('stays away %s', async (_, asset, onScreen) => {
    saveFrame.available = true; // Curator saves frames: only the case named keeps the button away
    if (onScreen) {
      saveFrame.show(video, 'video-1');
    }
    renderWithTooltips(SaveFrameAction, { asset: asset() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveFrame.available).toBe(true);
    expect(screen.queryByLabelText('save_frame_as_photo')).not.toBeInTheDocument();
  });

  it('stays away when Curator does not save frames', async () => {
    kinds.mockResolvedValue([{ kind: 'share.video', title: 'Video for a chat app', heavy: false }]);
    saveFrame.show(video, 'video-1');
    renderWithTooltips(SaveFrameAction, { asset: mine() });

    await vi.waitFor(() => expect(kinds).toHaveBeenCalled());
    expect(screen.queryByLabelText('save_frame_as_photo')).not.toBeInTheDocument();
  });
});
