import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import type { PlaceStats } from '$lib/utils/place-stats';
import { assetFactory } from '@test-data/factories/asset-factory';
import PlacesCardGroup from './PlacesCardGroup.svelte';

const { stats } = vi.hoisted(() => ({ stats: { current: undefined as PlaceStats | undefined } }));
vi.mock('$lib/managers/place-stats.svelte', () => ({ placeStats: { get: () => stats.current } }));

function renderGroup(city: string, country?: string | null) {
  const props = { places: [assetFactory.build({ id: 'asset-1', exifInfo: { city, country } })] };

  return render(TestWrapper as Component<{ component: typeof PlacesCardGroup; componentProps: typeof props }>, {
    component: PlacesCardGroup,
    componentProps: props,
  });
}

describe('PlacesCardGroup', () => {
  // #867: same reasoning as the Explore strip — /search cannot surface shared-space assets, the
  // filtered /photos timeline can.
  it('links a place card to the photos timeline filtered by that city', () => {
    renderGroup('Cape Town');

    expect(screen.getByRole('link', { name: /Cape Town/ })).toHaveAttribute('href', '/photos?city=Cape%20Town');
  });

  // #989: the card linked with `city` alone, so the location filter rendered the city flat beside
  // the countries instead of nested under one. /places already knows the country — it is what the
  // enclosing group is keyed on.
  it('scopes a place card to the country of that place', () => {
    renderGroup('Cape Town', 'South Africa');

    expect(screen.getByRole('link', { name: /Cape Town/ })).toHaveAttribute(
      'href',
      '/photos?city=Cape%20Town&country=South%20Africa',
    );
  });

  it('falls back to a city-only link when the place has no country', () => {
    renderGroup('Cape Town', null);

    expect(screen.getByRole('link', { name: /Cape Town/ })).toHaveAttribute('href', '/photos?city=Cape%20Town');
  });

  // Local Omarchy layer: the places fill the width at every width, as Albums and People do. Upstream sized each tile
  // from the window and capped it at 156px, which left a third of a phone's row, and the end of every wider one, empty.
  it('lays the places out in columns that fill the width, each tile a square as wide as its column', () => {
    renderGroup('Cape Town');

    const grid = screen.getByTestId('places-grid');
    expect(grid).toHaveClass('grid', 'grid-auto-fill-36');
    const tile = screen.getByRole('link', { name: /Cape Town/ });
    expect(tile).toHaveClass('ws-place-tile');
    expect(tile.className).not.toMatch(/max-w-|100vw/);
  });

  // Local Omarchy layer: a tile says how many photos the place holds and the years they span, in data type, and its
  // photo is not dimmed (the caption scrim carries the words)
  it("says a place's count and years, and names them for a screen reader", () => {
    stats.current = { count: 1375, first: 2010, last: 2026 };
    renderGroup('Riverton', 'Thailand');

    expect(screen.getByText('1,375 · 2010–2026')).toBeInTheDocument();
    // svelte-i18n echoes the key in a test: the label says the place, its photos and years in words
    const tile = screen.getByRole('link', { name: 'place_tile_label' });
    expect(tile.getHTML()).not.toMatch(/brightness/);
    stats.current = undefined;
  });
});
