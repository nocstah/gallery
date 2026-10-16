import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { assetFactory } from '@test-data/factories/asset-factory';
import PlacesCardGroup from './PlacesCardGroup.svelte';

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
    const tile = screen.getByRole('link', { name: /Cape Town/ }).firstElementChild;
    expect(tile).toHaveClass('aspect-square', 'w-full');
    expect(tile?.className).not.toMatch(/max-w-|100vw/);
  });
});
