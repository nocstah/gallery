import { AssetVisibility, searchAssets } from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TagPreview from '../previews/tag-preview.svelte';

vi.mock('@immich/sdk', async () => {
  const actual = await vi.importActual<typeof import('@immich/sdk')>('@immich/sdk');
  return {
    ...actual,
    searchAssets: vi.fn(),
  };
});

// Local Omarchy layer: the owner, who has QR, and one of QR's bank slips as the palette reads them (managers/slip-covers)
vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { authenticated: true, user: { id: 'owner', isAdmin: true } },
}));
vi.mock('$lib/managers/slip-covers.svelte', () => ({
  slipCovers: { isSlip: (assetId: string | null | undefined) => assetId === 'a-slip', known: true },
}));

describe('tag-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('defers the fetch 300 ms after mount', async () => {
    vi.mocked(searchAssets).mockResolvedValue({ assets: { items: [], nextPage: null } } as never);
    render(TagPreview, { props: { tag: { id: 't1', name: 'beach', color: null } as never } });
    await vi.advanceTimersByTimeAsync(200);
    expect(searchAssets).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(searchAssets).toHaveBeenCalledOnce();
  });

  it('renders "No photos tagged yet" on empty response', async () => {
    vi.mocked(searchAssets).mockResolvedValue({ assets: { items: [], nextPage: null } } as never);
    render(TagPreview, { props: { tag: { id: 't1', name: 'beach', color: null } as never } });
    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();
    expect(screen.getByText(/cmdk_no_tagged_photos|no photos tagged/i)).toBeInTheDocument();
  });

  it('renders the tag name in the header', () => {
    vi.mocked(searchAssets).mockResolvedValue({ assets: { items: [], nextPage: null } } as never);
    render(TagPreview, { props: { tag: { id: 't1', name: 'mountain', color: null } as never } });
    expect(screen.getByText('mountain')).toBeInTheDocument();
  });

  // Local Omarchy layer: what the tag's own page shows (utils/slips): without a visibility the search let in what Photos
  // keeps out, QR's archived bank slips under its tag among them
  it("asks for the tag's photos on the timeline and shows none of QR's slips", async () => {
    vi.mocked(searchAssets).mockResolvedValue({
      assets: {
        items: [
          { id: 'a-slip', visibility: AssetVisibility.Timeline },
          { id: 'photo', visibility: AssetVisibility.Timeline },
        ],
        nextPage: null,
      },
    } as never);
    const { container } = render(TagPreview, { props: { tag: { id: 't1', name: 'beach', value: 'beach' } as never } });
    await vi.advanceTimersByTimeAsync(400);

    expect(searchAssets).toHaveBeenCalledWith(
      { metadataSearchDto: { tagIds: ['t1'], size: 6, visibility: AssetVisibility.Timeline } },
      expect.anything(),
    );
    const shown = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('/assets/photo/');
  });

  // Local Omarchy layer: a special album tags what it holds with its name, and what it holds is kept out of Photos
  it.each([
    ['QR', 'qr_note'],
    ['To do', 'todo_note'],
  ])(
    "previews the %s tag as its album, its icon and the line under the album's title, asking nothing",
    async (name, note) => {
      const { container } = render(TagPreview, { props: { tag: { id: 't-special', name, value: name } as never } });
      await vi.advanceTimersByTimeAsync(400);

      expect(container.querySelector(':scope [data-testid="tag-preview-special"] svg')).not.toBeNull();
      expect(screen.getByText(note)).toBeInTheDocument();
      expect(container.querySelector('img')).toBeNull();
      expect(searchAssets).not.toHaveBeenCalled();
    },
  );
});
