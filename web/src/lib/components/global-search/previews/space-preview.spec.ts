import { render, screen } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import SpacePreview from './space-preview.svelte';

vi.mock('@immich/ui', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  IconButton: vi.fn(() => ({ $$typeof: Symbol.for('svelte.component') })),
}));

// Local Omarchy layer: one of QR's bank slips, as the palette reads them (managers/slip-covers)
const { slips } = vi.hoisted(() => ({ slips: { known: true } }));
vi.mock('$lib/managers/slip-covers.svelte', () => ({
  slipCovers: {
    isSlip: (assetId: string | null | undefined) => assetId === 'a-slip',
    get known() {
      return slips.known;
    },
  },
}));

beforeAll(async () => {
  // Load the real en bundle so `$t('cmdk_preview_photo_count')` and
  // `$t('cmdk_preview_member_count')` resolve to English ICU output rather than raw keys.
  register('en-US', () => import('$i18n/en.json'));
  await init({ fallbackLocale: 'en-US' });
  await waitLocale('en-US');
});

interface MemberOverride {
  userId: string;
  name: string;
  avatarColor?: string;
}

const baseItem = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Family',
  memberCount: 3,
  assetCount: 420,
  color: 'primary',
  recentAssetIds: ['a1', 'a2', 'a3', 'a4'],
  recentAssetThumbhashes: ['h1', 'h2', 'h3', 'h4'],
  members: [
    { userId: 'u1', name: 'A', avatarColor: 'red' },
    { userId: 'u2', name: 'B', avatarColor: 'blue' },
    { userId: 'u3', name: 'C', avatarColor: 'green' },
  ] as MemberOverride[],
  ...overrides,
});

describe('SpacePreview', () => {
  it('renders SpaceCollage with 4 asset thumbnails', () => {
    const { container } = render(SpacePreview, { props: { item: baseItem() } as never });
    // SpaceCollage renders an <img> per asset — the 4-asset grid layout yields four <img> elements.
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(4);
  });

  it('renders gradient fallback when recentAssetIds is empty', () => {
    const { container } = render(SpacePreview, {
      props: { item: baseItem({ recentAssetIds: [], recentAssetThumbhashes: [] }) } as never,
    });
    expect(container.querySelector('[data-testid="space-preview-gradient"]')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('member strip shows up to 4 avatars without +N bubble at exactly 4', () => {
    const members = Array.from({ length: 4 }, (_, i) => ({
      userId: `u${i}`,
      name: `u${i}`,
      avatarColor: 'primary',
    }));
    const { container } = render(SpacePreview, {
      props: { item: baseItem({ members, memberCount: 4 }) } as never,
    });
    expect(container.querySelectorAll('[data-testid="member-avatar"]')).toHaveLength(4);
    expect(container.querySelector('[data-testid="member-overflow"]')).toBeNull();
  });

  it('member strip shows +N bubble at 5+', () => {
    const members = Array.from({ length: 5 }, (_, i) => ({
      userId: `u${i}`,
      name: `u${i}`,
      avatarColor: 'primary',
    }));
    const { container } = render(SpacePreview, {
      props: { item: baseItem({ members, memberCount: 5 }) } as never,
    });
    expect(container.querySelectorAll('[data-testid="member-avatar"]')).toHaveLength(4);
    expect(container.querySelector('[data-testid="member-overflow"]')?.textContent).toMatch(/\+1/);
  });

  it('solo-member space renders self, not empty', () => {
    const { container } = render(SpacePreview, {
      props: {
        item: baseItem({
          members: [{ userId: 'me', name: 'Me', avatarColor: 'primary' }],
          memberCount: 1,
        }),
      } as never,
    });
    expect(container.querySelectorAll('[data-testid="member-avatar"]')).toHaveLength(1);
  });

  it('photo count uses ICU plural (singular)', () => {
    render(SpacePreview, { props: { item: baseItem({ assetCount: 1 }) } as never });
    expect(screen.getByText(/1 photo\b/)).toBeInTheDocument();
  });

  it('photo count uses ICU plural (plural)', () => {
    render(SpacePreview, { props: { item: baseItem({ assetCount: 420 }) } as never });
    expect(screen.getByText(/420 photos/)).toBeInTheDocument();
  });

  it('does NOT render lastContributor (intentional divergence from space-card)', () => {
    render(SpacePreview, {
      props: { item: baseItem({ lastContributor: { id: 'u1', name: 'Alice' } }) } as never,
    });
    expect(screen.queryByText(/Alice added/)).toBeNull();
  });

  // Local Omarchy layer: never one of QR's bank slips in the collage, which waits until they are known (utils/slips)
  it("leaves QR's slips out of the collage, and shows the Space's mark until they are known", () => {
    const item = baseItem({ recentAssetIds: ['a-slip', 'a2'], recentAssetThumbhashes: ['h1', 'h2'] });
    const { container, unmount } = render(SpacePreview, { props: { item } as never });
    const shown = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');
    expect(shown.some((src) => src.includes('a-slip'))).toBe(false);
    expect(shown.some((src) => src.includes('a2'))).toBe(true);
    unmount();

    slips.known = false;
    try {
      const waiting = render(SpacePreview, { props: { item } as never });
      expect(waiting.container.querySelector('img')).toBeNull();
      expect(waiting.container.querySelector('[data-testid="space-preview-gradient"]')).toBeInTheDocument();
    } finally {
      slips.known = true;
    }
  });
});
