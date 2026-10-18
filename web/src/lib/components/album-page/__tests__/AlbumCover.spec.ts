import { render } from '@testing-library/svelte';
import AlbumCover from '$lib/components/album-page/AlbumCover.svelte';
import { qrManager } from '$lib/managers/special-albums.svelte';
import { getAssetMediaUrl } from '$lib/utils';
import { albumFactory } from '@test-data/factories/album-factory';

vi.mock('$lib/utils');
vi.mock('$lib/managers/slip-covers.svelte', () => ({
  slipCovers: { isSlip: (assetId: string | null | undefined) => assetId === 'a-bank-slip' },
}));

describe('AlbumCover component', () => {
  it('renders an image when the album has a thumbnail', () => {
    vi.mocked(getAssetMediaUrl).mockReturnValue('/asdf');
    const component = render(AlbumCover, {
      album: albumFactory.build({
        albumName: 'someName',
        albumThumbnailAssetId: '123',
      }),
      preload: false,
      class: 'text',
    });
    const img = component.getByTestId('album-image') as HTMLImageElement;
    expect(img.alt).toBe('someName');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.className).toBe('size-full rounded-xl object-cover aspect-square text');
    expect(img.getAttribute('src')).toBe('/asdf');
    expect(getAssetMediaUrl).toHaveBeenCalledWith({ id: '123' });
  });

  // Local Omarchy layer: QR holds bank slips, which are not for looking at: its cover is its icon
  it('covers QR with its icon, never with a photo of a slip', () => {
    const album = albumFactory.build({ albumName: 'QR', albumThumbnailAssetId: '123' });
    qrManager.albumId = album.id;
    try {
      const cover = render(AlbumCover, { album, class: 'text' }).getByTestId('album-image');
      expect(cover.tagName).toBe('DIV');
      expect(cover.getAttribute('role')).toBe('img');
      expect(cover.getAttribute('aria-label')).toBe('QR');
      expect(cover.className).toContain('ws-album-icon-cover');
      expect(cover.className).toContain('text');
      expect(cover.querySelector('img')).toBeNull();
    } finally {
      qrManager.albumId = undefined;
    }
  });

  // Local Omarchy layer: a bank app's album holds nothing but slips, and had one for its cover (managers/slip-covers)
  it("covers an album whose cover is one of QR's slips with QR's icon", () => {
    const album = albumFactory.build({ albumName: 'Bank C', albumThumbnailAssetId: 'a-bank-slip' });

    const cover = render(AlbumCover, { album }).getByTestId('album-image');

    expect(cover.className).toContain('ws-album-icon-cover');
    expect(cover.getAttribute('aria-label')).toBe('Bank C');
    expect(cover.querySelector(':scope svg path')).toHaveAttribute('d', qrManager.icon);
    expect(cover.querySelector('img')).toBeNull();
  });

  it('renders an image when the album has no thumbnail', () => {
    const component = render(AlbumCover, {
      album: albumFactory.build({
        albumName: '',
        albumThumbnailAssetId: null,
      }),
      preload: true,
      class: 'asdf',
    });
    const img = component.getByTestId('album-image') as HTMLImageElement;
    expect(img.alt).toBe('unnamed_album');
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.className).toBe('size-full rounded-xl object-cover aspect-square asdf');
    expect(img.getAttribute('src')).toStrictEqual(expect.any(String));
  });
});
