import { searchAssets, type SearchResponseDto } from '@immich/sdk';
import { SlipCoverManager } from '$lib/managers/slip-covers.svelte';
import { qrManager } from '$lib/managers/special-albums.svelte';

// Local Omarchy layer: QR's slips, so that no album wears one for its cover (managers/slip-covers)
vi.mock('@immich/sdk', async () => ({
  ...(await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk')),
  searchAssets: vi.fn(),
}));
vi.mock('$lib/managers/special-albums.svelte', () => ({
  qrManager: { offered: true, count: 3, ready: vi.fn() },
}));

const page = (ids: string[], nextPage: string | null = null) =>
  ({ assets: { items: ids.map((id) => ({ id })), nextPage } }) as unknown as SearchResponseDto;
const qr = qrManager as unknown as { offered: boolean; count: number | undefined; ready: ReturnType<typeof vi.fn> };

describe('SlipCoverManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    qr.offered = true;
    qr.count = 3;
    qr.ready.mockResolvedValue('qr-album');
  });

  it("reads QR's photos page by page", async () => {
    const slips = new SlipCoverManager();
    vi.mocked(searchAssets)
      .mockResolvedValueOnce(page(['s1', 's2'], '2'))
      .mockResolvedValueOnce(page(['s3']));

    await slips.load();

    expect(searchAssets).toHaveBeenNthCalledWith(1, {
      metadataSearchDto: { albumIds: ['qr-album'], size: 1000, page: 1 },
    });
    expect(searchAssets).toHaveBeenNthCalledWith(2, {
      metadataSearchDto: { albumIds: ['qr-album'], size: 1000, page: 2 },
    });
    expect(['s1', 's3', 'photo'].map((id) => slips.isSlip(id))).toEqual([true, true, false]);
    expect(slips.isSlip(null)).toBe(false);
  });

  it("reads them again only when QR's count has changed", async () => {
    const slips = new SlipCoverManager();
    vi.mocked(searchAssets).mockResolvedValue(page(['s1']));

    await slips.load();
    await slips.load();
    expect(searchAssets).toHaveBeenCalledTimes(1);

    qr.count = 4;
    vi.mocked(searchAssets).mockResolvedValue(page(['s2']));
    await slips.load();
    expect(searchAssets).toHaveBeenCalledTimes(2);
    expect([slips.isSlip('s1'), slips.isSlip('s2')]).toEqual([false, true]);
  });

  it('keeps what it read when a read fails', async () => {
    const slips = new SlipCoverManager();
    vi.mocked(searchAssets).mockResolvedValueOnce(page(['s1']));
    await slips.load();

    qr.count = 4;
    vi.mocked(searchAssets).mockRejectedValueOnce(new Error('offline'));
    await slips.load();

    expect(slips.isSlip('s1')).toBe(true);
  });

  it('asks nothing for an account without QR', async () => {
    const slips = new SlipCoverManager();
    qr.offered = false;

    await slips.load();

    expect(qr.ready).not.toHaveBeenCalled();
    expect(searchAssets).not.toHaveBeenCalled();
  });

  // Local Omarchy layer: Ctrl+K holds a cover back until QR's slips are known (utils/slips)
  it('knows the slips once they are read, or tried, and at once for an account without QR', async () => {
    const slips = new SlipCoverManager();
    expect(slips.known).toBe(false);
    vi.mocked(searchAssets).mockRejectedValueOnce(new Error('offline'));

    await slips.load();

    expect(slips.known).toBe(true);
    const fresh = new SlipCoverManager();
    vi.mocked(searchAssets).mockResolvedValueOnce(page(['s1']));
    await fresh.load();
    expect([fresh.known, fresh.isSlip('s1')]).toEqual([true, true]);

    const none = new SlipCoverManager();
    qr.ready.mockResolvedValueOnce(undefined);
    await none.load();
    expect(none.known).toBe(true);

    qr.offered = false;
    expect(new SlipCoverManager().known).toBe(true);
  });
});
