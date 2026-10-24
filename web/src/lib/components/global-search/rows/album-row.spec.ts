import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { qrManager } from '$lib/managers/special-albums.svelte';
import AlbumRow from './album-row.svelte';

vi.mock('@immich/ui', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  IconButton: vi.fn(() => ({ $$typeof: Symbol.for('svelte.component') })),
}));

// Local Omarchy layer: QR's bank slips as the palette reads them (managers/slip-covers)
const { slips } = vi.hoisted(() => ({ slips: { ids: new Set<string>(), known: true } }));
vi.mock('$lib/managers/slip-covers.svelte', () => ({
  slipCovers: {
    isSlip: (assetId: string | null | undefined) => !!assetId && slips.ids.has(assetId),
    get known() {
      return slips.known;
    },
  },
}));

describe('album-row', () => {
  const baseProps = {
    item: {
      id: 'a1',
      albumName: 'Hawaii 2024',
      shared: false,
      albumThumbnailAssetId: 't1',
      assetCount: 5,
    },
    isPending: false,
  };

  it('renders album name', () => {
    render(AlbumRow, { props: baseProps as never });
    expect(screen.getByText('Hawaii 2024')).toBeInTheDocument();
  });

  it('renders shared badge when shared=true', () => {
    render(AlbumRow, {
      props: { ...baseProps, item: { ...baseProps.item, shared: true } } as never,
    });
    expect(screen.getByText(/shared/i)).toBeInTheDocument();
  });

  it('omits shared badge when shared=false', () => {
    render(AlbumRow, { props: baseProps as never });
    expect(screen.queryByText(/shared/i)).toBeNull();
  });

  it('cover uses createUrl() (src prefixed with /api/)', () => {
    const { container } = render(AlbumRow, { props: baseProps as never });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toMatch(/^\/api\//);
  });

  it('renders pending style when isPending=true', () => {
    const { container } = render(AlbumRow, {
      props: { ...baseProps, isPending: true } as never,
    });
    expect(container.querySelector('.opacity-50')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="pending-spinner"]')).toBeInTheDocument();
  });

  it('long name truncates with ellipsis class', () => {
    const longName = 'A'.repeat(200);
    render(AlbumRow, {
      props: { ...baseProps, item: { ...baseProps.item, albumName: longName } } as never,
    });
    const nameEl = screen.getByText(longName);
    expect(nameEl.className).toMatch(/truncate|line-clamp/);
  });

  // Local Omarchy layer: QR's bank slips are not for looking at, so QR, and an album whose cover is one of them, wear
  // QR's icon as wherever an album's cover shows (utils/slips)
  describe('bank slips', () => {
    afterEach(() => {
      qrManager.albumId = undefined;
      slips.ids.clear();
      slips.known = true;
    });

    it("wears QR's icon for QR, never a photo of one of its slips", () => {
      qrManager.albumId = 'qr';
      const { container } = render(AlbumRow, {
        props: { ...baseProps, item: { ...baseProps.item, id: 'qr', albumName: 'QR' } } as never,
      });

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector(':scope [data-testid="album-icon-cover"] svg path')).toHaveAttribute(
        'd',
        qrManager.icon,
      );
    });

    it("wears QR's icon for an album whose cover is one of QR's slips", () => {
      slips.ids.add('t1');
      const { container } = render(AlbumRow, { props: baseProps as never });

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector(':scope [data-testid="album-icon-cover"] svg path')).toHaveAttribute(
        'd',
        qrManager.icon,
      );
    });

    it("holds a cover back on the quiet ground until QR's slips are known", () => {
      slips.known = false;
      const { container } = render(AlbumRow, { props: baseProps as never });

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[data-testid="album-cover-looking"]')).toBeInTheDocument();
    });
  });
});
