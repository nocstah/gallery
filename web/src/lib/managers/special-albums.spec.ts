import { AssetVisibility } from '@immich/sdk';
import '$lib/__mocks__/sdk.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import {
  offeredSpecialAlbums,
  planDone,
  planMove,
  qrManager,
  resolveSpecialAlbums,
  todoManager,
  villaManager,
  type From,
} from '$lib/managers/special-albums.svelte';

const auth = vi.hoisted(() => ({ authManager: { authenticated: true, user: { isAdmin: true, id: 'me' } } }));
vi.mock('$lib/managers/auth-manager.svelte', () => auth);

// Local Omarchy layer: To do is everyone's; Villa and QR are the owner's own ("Hide Villa and QR, keep To do")
describe('special albums offered to the account signed in', () => {
  afterEach(() => {
    auth.authManager.user.isAdmin = true;
  });

  it('offers the owner all three', () => {
    expect(offeredSpecialAlbums()).toEqual([todoManager, villaManager, qrManager]);
  });

  it('offers a family account To do alone', () => {
    auth.authManager.user.isAdmin = false;

    expect(offeredSpecialAlbums()).toEqual([todoManager]);
    expect(villaManager.offered).toBe(false);
    expect(qrManager.offered).toBe(false);
  });

  it('never asks Gallery for Villa or QR on a family account, so an album of theirs by the name stays an album', async () => {
    auth.authManager.user.isAdmin = false;
    sdkMock.getAllAlbums.mockClear();

    await villaManager.lookUp();
    await qrManager.lookUp();

    expect(sdkMock.getAllAlbums).not.toHaveBeenCalled();
    expect(villaManager.albumId).toBeUndefined();
    expect(villaManager.isAlbum('villa-of-theirs')).toBe(false);
  });

  it('moves nothing into Villa for a family account', async () => {
    auth.authManager.user.isAdmin = false;

    await expect(villaManager.move([{ id: 'photo', visibility: AssetVisibility.Timeline }])).resolves.toBeUndefined();
    expect(sdkMock.addAssetsToAlbum).not.toHaveBeenCalled();
  });
});

// Local Omarchy layer: a special album (To do, Villa) takes photos out of Photos, and taking them out of it puts each
// back where it came from, unless another special album still holds it
describe('special albums', () => {
  const visibility = new Map<string, string | undefined>([
    ['photos', AssetVisibility.Timeline],
    ['archived', AssetVisibility.Archive],
    ['locked', AssetVisibility.Locked],
  ]);

  it('archives what was in Photos and notes where each photo came from', () => {
    const { notes, archive } = planMove(['photos', 'archived'], visibility, new Set(['photos', 'archived']));
    expect(archive).toEqual(['photos']);
    expect(notes).toEqual([
      { id: 'photos', from: 'timeline' },
      { id: 'archived', from: 'archive' },
    ]);
  });

  it('keeps the note of a photo already in the album, and hides one that was unarchived meanwhile', () => {
    const { notes, archive } = planMove(['photos', 'archived'], visibility, new Set());
    expect(archive).toEqual(['photos']);
    expect(notes).toEqual([{ id: 'photos', from: 'timeline' }]);
  });

  it('notes Photos as the origin of a photo another special album took out of there', () => {
    const elsewhere = new Map<string, From | undefined>([['archived', 'timeline']]);
    const { notes, archive } = planMove(['archived'], visibility, new Set(['archived']), elsewhere);
    expect(archive).toEqual([]);
    expect(notes).toEqual([{ id: 'archived', from: 'timeline' }]);
  });

  it('never touches a photo in the Locked Folder', () => {
    expect(planMove(['locked'], visibility, new Set(['locked']))).toEqual({ notes: [], archive: [] });
  });

  const now = new Map<string, string | undefined>([
    ['photos', AssetVisibility.Archive],
    ['archived', AssetVisibility.Archive],
    ['locked', AssetVisibility.Locked],
    ['unnoted', AssetVisibility.Archive],
    ['unarchived', AssetVisibility.Timeline],
  ]);
  const notes = new Map<string, From | undefined>([
    ['photos', 'timeline'],
    ['archived', 'archive'],
    ['locked', 'timeline'],
    ['unnoted', undefined],
    ['unarchived', 'timeline'],
  ]);

  it('puts back in Photos only what came from there and is still archived', () => {
    expect(planDone([...now.keys()], now, notes)).toEqual(['photos']);
  });

  it('keeps a photo out of Photos while another special album holds it', () => {
    const elsewhere = new Map<string, From | undefined>([['photos', 'timeline']]);
    expect(planDone([...now.keys()], now, notes, elsewhere)).toEqual([]);
  });
});

// Local Omarchy layer: the user pages' layout and the sidebar both ask (an error page's sidebar has no user layout
// around it); each special album is looked up once a page load, whoever asks first
describe('resolveSpecialAlbums', () => {
  it('looks each offered special album up once, however many ask', async () => {
    sdkMock.getAllAlbums.mockReset();
    sdkMock.getAllAlbums.mockImplementation(({ name }: { name?: string } = {}) =>
      Promise.resolve([{ id: `${name}-album`, assetCount: 36 }] as never),
    );

    resolveSpecialAlbums();
    resolveSpecialAlbums();

    await vi.waitFor(() => expect(qrManager.albumId).toBe('QR-album'));
    expect(sdkMock.getAllAlbums).toHaveBeenCalledTimes(3);
    expect(todoManager.count).toBe(36);
    expect(villaManager.isAlbum('Villa-album')).toBe(true);
  });
});
