import type { AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { PlacesGroupBy, type PlacesViewSettings } from '$lib/stores/preferences.store';
import PlacesList from './PlacesList.svelte';

// Local Omarchy layer: Places' empty states stand on the gutter in the Empty State's grammar (DESIGN.md, Places), and a
// search that finds no place says so instead of leaving the page blank
const settings: PlacesViewSettings = { groupBy: PlacesGroupBy.None, collapsedGroups: {} };

const place = (id: string, city: string) => ({ id, exifInfo: { city, country: 'Norway' } }) as AssetResponseDto;

describe('PlacesList', () => {
  it('says where places come from when there are none yet', () => {
    render(PlacesList, { props: { places: [], searchResultCount: 0, userSettings: settings } });

    const empty = screen.getByTestId('places-empty');
    expect(empty).toHaveTextContent('places_empty_title');
    expect(empty).toHaveTextContent('places_empty_body');
  });

  it('says no place matches a search, and clears it', async () => {
    const onClearSearch = vi.fn();
    render(PlacesList, {
      props: {
        places: [place('a', 'Oslo'), place('b', 'Bergen')],
        searchQuery: 'Lisbon',
        searchResultCount: 0,
        userSettings: settings,
        onClearSearch,
      },
    });

    expect(screen.getByTestId('places-no-match')).toHaveTextContent('places_no_match');
    expect(screen.queryByTestId('places-grid')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'filter_sheet_picker_clear_search' }));
    expect(onClearSearch).toHaveBeenCalledOnce();
  });

  it('shows the places a search finds', () => {
    render(PlacesList, {
      props: {
        places: [place('a', 'Oslo'), place('b', 'Bergen')],
        searchQuery: 'osl',
        searchResultCount: 0,
        userSettings: settings,
      },
    });

    expect(screen.queryByTestId('places-no-match')).toBeNull();
    expect(screen.getByTestId('places-grid')).toBeInTheDocument();
  });
});
