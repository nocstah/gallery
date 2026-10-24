import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import PhotoRow from '../rows/photo-row.svelte';

describe('photo-row', () => {
  it('renders filename and subtitle from exifInfo', () => {
    render(PhotoRow, {
      props: {
        item: {
          id: 'a1',
          originalFileName: 'sunset.jpg',
          exifInfo: { dateTimeOriginal: '2024-03-01T00:00:00Z', city: 'Santa Cruz' },
        } as never,
      },
    });
    expect(screen.getByText('sunset.jpg')).toBeInTheDocument();
    expect(screen.getByText(/Santa Cruz/)).toBeInTheDocument();
  });

  it('uses /api/ asset thumbnail URL', () => {
    const { container } = render(PhotoRow, {
      props: { item: { id: 'a1', originalFileName: 'x.jpg' } as never },
    });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('/api/');
  });

  it('does NOT set role="option" — Command.Item wraps it', () => {
    const { container } = render(PhotoRow, {
      props: { item: { id: 'a1', originalFileName: 'x.jpg' } as never },
    });
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it('renders without subtitle when exifInfo is missing', () => {
    render(PhotoRow, {
      props: { item: { id: 'a1', originalFileName: 'plain.jpg' } as never },
    });
    expect(screen.getByText('plain.jpg')).toBeInTheDocument();
  });

  // Local Omarchy layer: a recent's thumbnail waits until the palette has checked it is no bank slip (utils/slips)
  it("withholds the thumbnail on the house's quiet ground while withheld", () => {
    const { container } = render(PhotoRow, {
      props: { item: { id: 'a1', originalFileName: 'x.jpg' } as never, withheld: true },
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-testid="photo-row-withheld"]')).toBeInTheDocument();
    expect(screen.getByText('x.jpg')).toBeInTheDocument();
  });
});
