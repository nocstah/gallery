import { Type, type AssetResponseDto, type PersonResponseDto, type SearchExploreResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import TestWrapper from '$lib/components/TestWrapper.svelte';
import { assetFactory } from '@test-data/factories/asset-factory';
import { personFactory } from '@test-data/factories/person-factory';
import ExplorePage from './+page.svelte';

// Local Omarchy layer: the places row ranks every place by its photos (managers/place-stats); here nothing is counted,
// so the places keep the order they came in
vi.mock('$lib/managers/place-stats.svelte', () => ({
  placeStats: { settle: () => Promise.resolve(), get: () => undefined },
}));

vi.mock('$lib/components/layouts/UserPageLayout.svelte', async () => {
  const { default: MockComponent } = await import('$lib/components/spaces/mock-user-page-layout.test-wrapper.svelte');
  return { default: MockComponent };
});

function makePerson(overrides: Partial<PersonResponseDto> = {}): PersonResponseDto {
  return personFactory.build({
    id: 'person-1',
    name: 'Alice',
    isHidden: false,
    isFavorite: false,
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  });
}

function renderPage(
  people: PersonResponseDto[] = [makePerson()],
  items: SearchExploreResponseDto[] = [],
  cities: AssetResponseDto[] = [],
) {
  const props = {
    data: {
      explore: items,
      people: {
        people,
        total: people.length,
        hidden: 0,
        hasNextPage: false,
      },
      cities,
      meta: { title: 'Explore' },
    },
  };

  return render(TestWrapper as Component<{ component: typeof ExplorePage; componentProps: typeof props }>, {
    component: ExplorePage,
    componentProps: props,
  });
}

describe('Explore page', () => {
  it('uses the user profile id for user-primary identity rows', () => {
    renderPage([
      makePerson({
        id: 'identity-1',
        name: 'Alice',
        primaryProfile: { type: Type.UserPerson, id: 'user-person-1' },
      }),
    ]);

    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute(
      'href',
      '/people/user-person-1?previousRoute=%2Fexplore',
    );
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      '/api/people/user-person-1/thumbnail?updatedAt=2026-01-02T00%3A00%3A00.000Z',
    );
  });

  it('routes a space-primary person to the identity-wide person page and space thumbnail', () => {
    renderPage([
      makePerson({
        id: 'identity-1',
        name: 'Shared Alice',
        primaryProfile: { type: Type.SpacePerson, id: 'space-person-1', spaceId: 'space-1' },
      }),
    ]);

    expect(screen.getByRole('link', { name: 'Shared Alice' })).toHaveAttribute(
      'href',
      '/people/space-person-1?previousRoute=%2Fexplore',
    );
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      '/api/shared-spaces/space-1/people/space-person-1/thumbnail?updatedAt=2026-01-02T00%3A00%3A00.000Z',
    );
  });

  // immich-32238 moved the favorite heart into upstream's PersonIndicator badge. Its "shared with me"
  // icon keys off `otherPeople`, which Gallery always sends empty (person sharing is dormant).
  it('badges a favorite person and leaves others unmarked', () => {
    renderPage([
      makePerson({ id: 'person-1', name: 'Alice', isFavorite: true }),
      makePerson({ id: 'person-2', name: 'Bob', isFavorite: false }),
    ]);

    expect(screen.getAllByTitle('favorite')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Alice/ })).toContainElement(screen.getByTitle('favorite'));
    expect(screen.queryByTitle('shared_with_me')).toBeNull();
  });

  // Local Omarchy layer: people in the People page's order (most photos first by default, favourites before them);
  // upstream listed them by name
  // (a row without layout in a test holds one face: the first in that order)
  it('puts the person with the most photos first', () => {
    renderPage([
      makePerson({ id: 'a', name: 'Alice', numberOfAssets: 3 }),
      makePerson({ id: 'b', name: 'Bob', numberOfAssets: 300 }),
    ]);

    expect(screen.getByRole('link', { name: /Bob/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Alice/ })).not.toBeInTheDocument();
  });

  it('puts a favourite before the people with more photos', () => {
    renderPage([
      makePerson({ id: 'b', name: 'Bob', numberOfAssets: 300 }),
      makePerson({ id: 'c', name: 'Cleo', numberOfAssets: 30, isFavorite: true }),
    ]);

    expect(screen.getByRole('link', { name: /Cleo/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bob/ })).not.toBeInTheDocument();
  });

  it('heads each row in the section-label style, with the way to all of it', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 2, name: /people/ })).toContainElement(
      screen.getByRole('link', { name: 'view_all' }),
    );
  });

  // #867: place tiles used to open the deprecated /search view, which is owner-scoped and cannot
  // show shared-space assets. Send them to the filtered /photos timeline instead.
  it('links a place tile to the photos timeline filtered by that city', async () => {
    renderPage([], [], [assetFactory.build({ id: 'asset-1', exifInfo: { city: 'Cape Town' } })]);

    const link = await screen.findByRole('link', { name: /Cape Town/ });
    expect(link).toHaveAttribute('href', '/photos?city=Cape%20Town');
  });

  // #989: the tile linked with `city` alone, so the location filter had no country to nest the
  // city under and rendered it flat beside the country list. The country is already on the
  // representative asset the strip renders — carry it through.
  it('scopes a place tile to the country of its representative asset', async () => {
    renderPage(
      [],
      [],
      [assetFactory.build({ id: 'asset-1', exifInfo: { city: 'Cape Town', country: 'South Africa' } })],
    );

    const link = await screen.findByRole('link', { name: /Cape Town/ });
    expect(link).toHaveAttribute('href', '/photos?city=Cape%20Town&country=South%20Africa');
  });

  // Reverse geocoding can resolve a city without a country. Falling back to the city-only link
  // keeps the tile working (as an orphaned selection) rather than emitting `country=`.
  it('falls back to a city-only link when the asset has no country', async () => {
    renderPage([], [], [assetFactory.build({ id: 'asset-1', exifInfo: { city: 'Cape Town', country: null } })]);

    expect(await screen.findByRole('link', { name: /Cape Town/ })).toHaveAttribute('href', '/photos?city=Cape%20Town');
  });
});
