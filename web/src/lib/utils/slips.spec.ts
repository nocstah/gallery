import { AssetVisibility, type TagResponseDto } from '@immich/sdk';
import { qrManager, todoManager } from '$lib/managers/special-albums.svelte';
import { iconCoverOf, shownAmongPhotos } from '$lib/utils/slips';

// Local Omarchy layer: where QR's bank slips never show (utils/slips): an album's cover, and the photos Ctrl+K offers
const { auth } = vi.hoisted(() => ({
  auth: { authenticated: true, user: { id: 'owner', isAdmin: true } },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: auth }));
vi.mock('$lib/managers/slip-covers.svelte', () => ({
  slipCovers: { isSlip: (assetId: string | null | undefined) => assetId === 'a-slip' },
}));

const tag = (value: string) => ({ id: `tag-${value}`, name: value, value }) as TagResponseDto;

describe(iconCoverOf.name, () => {
  beforeEach(() => {
    qrManager.albumId = 'qr-album';
    todoManager.albumId = 'todo-album';
  });
  afterEach(() => {
    qrManager.albumId = undefined;
    todoManager.albumId = undefined;
    auth.user.isAdmin = true;
  });

  it("covers QR, and an album whose cover is one of QR's slips, with QR's icon", () => {
    expect(iconCoverOf('qr-album', 'a-photo')).toBe(qrManager);
    expect(iconCoverOf('bank-a', 'a-slip')).toBe(qrManager);
  });

  it('leaves every other album its cover, a special album whose photos are for looking at included', () => {
    expect(iconCoverOf('todo-album', 'a-photo')).toBeUndefined();
    expect(iconCoverOf('bali', 'a-photo')).toBeUndefined();
    expect(iconCoverOf('bali', null)).toBeUndefined();
  });
});

describe(shownAmongPhotos.name, () => {
  afterEach(() => {
    auth.user.isAdmin = true;
  });

  it('shows a photo on the timeline, and one whose visibility is not known', () => {
    expect(shownAmongPhotos({ id: 'a-photo', visibility: AssetVisibility.Timeline })).toBe(true);
    expect(shownAmongPhotos({ id: 'a-photo' })).toBe(true);
  });

  it('leaves out what Photos keeps out: archived, as every slip the house recognises is, hidden or locked', () => {
    for (const visibility of [AssetVisibility.Archive, AssetVisibility.Hidden, AssetVisibility.Locked]) {
      expect(shownAmongPhotos({ id: 'a-photo', visibility })).toBe(false);
    }
  });

  it("leaves out QR's slips whatever their visibility: QR's photos as read, or QR's tag", () => {
    expect(shownAmongPhotos({ id: 'a-slip', visibility: AssetVisibility.Timeline })).toBe(false);
    expect(shownAmongPhotos({ id: 'a-photo', visibility: AssetVisibility.Timeline, tags: [tag('QR')] })).toBe(false);
    expect(shownAmongPhotos({ id: 'a-photo', visibility: AssetVisibility.Timeline, tags: [tag('Beach')] })).toBe(true);
  });

  it("reads a family account's own tag called QR as just a tag: QR is the owner's", () => {
    auth.user.isAdmin = false;

    expect(shownAmongPhotos({ id: 'a-photo', visibility: AssetVisibility.Timeline, tags: [tag('QR')] })).toBe(true);
  });
});
