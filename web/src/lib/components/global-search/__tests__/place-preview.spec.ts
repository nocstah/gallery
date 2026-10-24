import { AssetVisibility, searchAssets } from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlacePreview from '../previews/place-preview.svelte';

vi.mock('@immich/sdk', async () => {
  const actual = await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return { ...actual, searchAssets: vi.fn() };
});

// Local Omarchy layer: one of QR's bank slips, as the palette reads them (managers/slip-covers)
vi.mock('$lib/managers/slip-covers.svelte', () => ({
  slipCovers: { isSlip: (assetId: string | null | undefined) => assetId === 'a-slip', known: true },
}));

describe('place-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders place name and subtitle', () => {
    vi.mocked(searchAssets).mockResolvedValue({ assets: { items: [], nextPage: null } } as never);
    render(PlacePreview, {
      props: { place: { name: 'Santa Cruz', admin1name: 'CA', latitude: 0, longitude: 0 } as never },
    });
    expect(screen.getByText('Santa Cruz')).toBeInTheDocument();
  });

  it('shows "No photos here yet" on empty response', async () => {
    vi.mocked(searchAssets).mockResolvedValue({ assets: { items: [], nextPage: null } } as never);
    render(PlacePreview, {
      props: { place: { name: 'X', latitude: 0, longitude: 0 } as never },
    });
    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();
    expect(screen.getByText(/cmdk_no_photos_here|no photos here/i)).toBeInTheDocument();
  });

  // Local Omarchy layer: the place's photos as Photos shows them (utils/slips): without a visibility the search let in
  // what Photos keeps out, archived bank slips among them
  it("asks for the place's photos on the timeline and shows none of QR's slips", async () => {
    vi.mocked(searchAssets).mockResolvedValue({
      assets: {
        items: [
          { id: 'a-slip', visibility: AssetVisibility.Timeline },
          { id: 'photo', visibility: AssetVisibility.Timeline },
        ],
        nextPage: null,
      },
    } as never);
    const { container } = render(PlacePreview, {
      props: { place: { name: 'Riverton', admin1name: 'North', latitude: 0, longitude: 0 } as never },
    });
    await vi.advanceTimersByTimeAsync(400);

    expect(searchAssets).toHaveBeenCalledWith(
      { metadataSearchDto: { city: 'Riverton', state: 'North', size: 4, visibility: AssetVisibility.Timeline } },
      expect.anything(),
    );
    const shown = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('/assets/photo/');
  });
});
