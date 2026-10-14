import {
  getAlbumTimelineHidePreview,
  getAllSpaces,
  getSharedSpaceAlbumFolders,
  getSharedSpaceAlbums,
  linkAlbum,
  setSharedSpaceAlbumFolder,
  unlinkAlbum,
  updateAlbumTimelineForMember,
  type SharedSpaceAlbumFolderDto,
  type SharedSpaceLinkedAlbumDto,
  type SharedSpaceResponseDto,
} from '@immich/sdk';
import { modalManager } from '@immich/ui';
import AlbumHideFromMyTimelineConfirmModal from '$lib/modals/AlbumHideFromMyTimelineConfirmModal.svelte';
import { albumFolders, FOLDER_SPACE } from './album-folders.svelte';

// Local Omarchy layer: the Albums page's folders are the personal Space "Library"'s (managers/album-folders)
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: { authenticated: true, user: { id: 'me' } } }));
vi.mock('@immich/sdk', async () => ({
  ...(await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk')),
  createSpace: vi.fn(),
  getAlbumTimelineHidePreview: vi.fn(),
  getAllSpaces: vi.fn(),
  getSharedSpaceAlbumFolders: vi.fn(),
  getSharedSpaceAlbums: vi.fn(),
  linkAlbum: vi.fn(),
  setSharedSpaceAlbumFolder: vi.fn(),
  unlinkAlbum: vi.fn(),
  updateAlbumTimelineForMember: vi.fn(),
}));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: { show: vi.fn() },
}));

const space = (id: string, name: string, createdById: string, createdAt: string) =>
  ({ id, name, createdById, createdAt }) as SharedSpaceResponseDto;
const folder = (id: string, parentId: string | null = null) =>
  ({ id, name: id, parentId, spaceId: 'library' }) as SharedSpaceAlbumFolderDto;
const linked = (id: string, folderId: string | null, hiddenFromMyTimeline = false) =>
  ({ id, folderId, hiddenFromMyTimeline }) as SharedSpaceLinkedAlbumDto;

describe('album folders', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getAllSpaces).mockResolvedValue([
      space('someone-elses', FOLDER_SPACE, 'partner', '2026-01-01'),
      space('library', FOLDER_SPACE, 'me', '2026-10-10'),
      space('family', 'Family', 'me', '2026-10-11'),
    ]);
    vi.mocked(getSharedSpaceAlbumFolders).mockResolvedValue([folder('travel'), folder('norway', 'travel')]);
    vi.mocked(getSharedSpaceAlbums).mockResolvedValue([
      linked('lofoten', 'norway'),
      linked('loose', null),
      linked('orphan', 'deleted-folder'),
    ]);
    await albumFolders.load();
  });

  it("takes its folders from my own Space by that name, not someone else's", () => {
    expect(albumFolders.spaceId).toBe('library');
    expect(getSharedSpaceAlbumFolders).toHaveBeenCalledWith({ id: 'library' });
  });

  it('puts an album in its folder, and anything else at the top', () => {
    expect(albumFolders.folderOf('lofoten')).toBe('norway');
    expect(albumFolders.folderOf('loose')).toBeNull();
    // a folder that is gone does not hide its album
    expect(albumFolders.folderOf('orphan')).toBeNull();
    // an album that is not in the Space at all
    expect(albumFolders.folderOf('to-do')).toBeNull();
  });

  it('moves an album of the Space between its folders', async () => {
    await albumFolders.moveAlbum('loose', 'travel');
    expect(setSharedSpaceAlbumFolder).toHaveBeenCalledWith({
      id: 'library',
      albumId: 'loose',
      sharedSpaceAlbumFolderMoveAlbumDto: { folderId: 'travel' },
    });
    expect(linkAlbum).not.toHaveBeenCalled();
  });

  it('adds an album to the Space when it first goes into a folder', async () => {
    await albumFolders.moveAlbum('to-do', 'travel');
    expect(linkAlbum).toHaveBeenCalledWith({ id: 'library', albumId: 'to-do', folderId: 'travel' });
    expect(setSharedSpaceAlbumFolder).not.toHaveBeenCalled();
  });

  it('leaves an album outside the Space alone when it goes to the top', async () => {
    await albumFolders.moveAlbum('to-do', null);
    expect(linkAlbum).not.toHaveBeenCalled();
    expect(setSharedSpaceAlbumFolder).not.toHaveBeenCalled();
  });

  it('hides an album of the Space from my timeline once I say yes to the count', async () => {
    vi.mocked(getAlbumTimelineHidePreview).mockResolvedValue({ hiddenAssetCount: 3, retainedAssetCount: 1 } as never);
    vi.mocked(modalManager.show).mockResolvedValue(true as never);
    await albumFolders.toggleTimeline({ id: 'loose', albumName: 'Loose' });
    expect(modalManager.show).toHaveBeenCalledWith(AlbumHideFromMyTimelineConfirmModal, {
      albumName: 'Loose',
      count: 3,
      retainedCount: 1,
    });
    expect(updateAlbumTimelineForMember).toHaveBeenCalledWith({
      id: 'library',
      albumId: 'loose',
      sharedSpaceAlbumMemberTimelineDto: { showInTimeline: false },
    });
    expect(linkAlbum).not.toHaveBeenCalled();
  });

  it('shows a hidden album again without asking', async () => {
    vi.mocked(getSharedSpaceAlbums).mockResolvedValue([linked('lofoten', 'norway', true)]);
    await albumFolders.load();
    expect(albumFolders.hiddenFromTimeline('lofoten')).toBe(true);
    await albumFolders.toggleTimeline({ id: 'lofoten', albumName: 'Lofoten' });
    expect(modalManager.show).not.toHaveBeenCalled();
    expect(updateAlbumTimelineForMember).toHaveBeenCalledWith({
      id: 'library',
      albumId: 'lofoten',
      sharedSpaceAlbumMemberTimelineDto: { showInTimeline: true },
    });
  });

  it('adds an album outside the Space at the top to hide it, and takes it out again when I say no', async () => {
    vi.mocked(getAlbumTimelineHidePreview).mockResolvedValue({ hiddenAssetCount: 5, retainedAssetCount: 0 } as never);
    vi.mocked(modalManager.show).mockResolvedValue(false as never);
    await albumFolders.toggleTimeline({ id: 'to-do', albumName: 'To do' });
    expect(linkAlbum).toHaveBeenCalledWith({ id: 'library', albumId: 'to-do' });
    expect(unlinkAlbum).toHaveBeenCalledWith({ id: 'library', albumId: 'to-do' });
    expect(updateAlbumTimelineForMember).not.toHaveBeenCalled();
  });
});
