import { fireEvent, screen, within } from '@testing-library/svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import { get } from 'svelte/store';
import { AlbumGroupBy, AlbumSortBy, AlbumViewMode, albumViewSettings, SortOrder } from '$lib/stores/preferences.store';
import { renderWithTooltips } from '$tests/helpers';
import AlbumsControls from './AlbumsControls.svelte';

describe('AlbumsControls toolbar order', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  // Local Omarchy layer: the Cover/List toggle lives in the View sheet now, with the sort and the grouping
  it('renders Create album after the View sheet', () => {
    renderWithTooltips(AlbumsControls, { albumGroups: [], searchQuery: '' });
    const create = screen.getByText('Create album').closest('button')!;
    const view = screen.getByTestId('albums-view');
    // create must come AFTER the view in DOM order
    expect(view.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// Local Omarchy layer: sort, order, grouping, expand and collapse all, and covers or list in one sheet like the bar's
// View menu, where each had a control of its own in the bar
describe('AlbumsControls view sheet', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });
  beforeEach(() => {
    albumViewSettings.update((settings) => ({
      ...settings,
      view: AlbumViewMode.Cover,
      groupBy: AlbumGroupBy.Year,
      groupOrder: SortOrder.Desc,
      sortBy: AlbumSortBy.MostRecentPhoto,
      sortOrder: SortOrder.Desc,
    }));
  });

  const openSheet = async () => {
    const view = screen.getByTestId('albums-view');
    await fireEvent.click(view);
    return view;
  };

  it('keeps the bar to the filter, the search, View and Create album', () => {
    renderWithTooltips(AlbumsControls, { albumGroups: [], searchQuery: '' });
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByPlaceholderText('Search albums')).toBeInTheDocument();
    expect(screen.getByTestId('albums-view')).toHaveAttribute('aria-expanded', 'false');
    // the sort, group, expand, collapse and list controls are not in the bar
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument();
  });

  it('sorts from the sheet, in the order that fits what is sorted', async () => {
    renderWithTooltips(AlbumsControls, { albumGroups: [], searchQuery: '' });
    const view = await openSheet();
    expect(view).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Most recent photo' })).toHaveAttribute('aria-pressed', 'true');
    const order = () => within(screen.getByRole('group', { name: 'Sort order' }));
    expect(order().getByRole('button', { name: 'Newest first' })).toHaveAttribute('aria-pressed', 'true');
    // the groups (by year) have an order of their own
    const groups = within(screen.getByRole('group', { name: 'Group order' }));
    expect(groups.getByRole('button', { name: 'Newest first' })).toHaveAttribute('aria-pressed', 'true');

    await fireEvent.click(screen.getByRole('button', { name: 'Title' }));
    expect(get(albumViewSettings)).toMatchObject({ sortBy: AlbumSortBy.Title, sortOrder: SortOrder.Asc });
    expect(order().getByRole('button', { name: 'A to Z' })).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(order().getByRole('button', { name: 'Z to A' }));
    expect(get(albumViewSettings).sortOrder).toBe(SortOrder.Desc);
  });

  it('groups, opens or closes every group, and shows covers or a list from the sheet', async () => {
    renderWithTooltips(AlbumsControls, { albumGroups: ['2024', '2023'], searchQuery: '' });
    await openSheet();
    await fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(get(albumViewSettings).collapsedGroups[AlbumGroupBy.Year]).toEqual(['2024', '2023']);
    await fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(get(albumViewSettings).collapsedGroups[AlbumGroupBy.Year]).toEqual([]);

    await fireEvent.click(screen.getByRole('button', { name: 'Owner' }));
    expect(get(albumViewSettings).groupBy).toBe(AlbumGroupBy.Owner);
    await fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.queryByRole('button', { name: 'Expand all' })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(get(albumViewSettings).view).toBe(AlbumViewMode.List);
  });

  it('closes on Escape and gives the focus back to its button', async () => {
    renderWithTooltips(AlbumsControls, { albumGroups: [], searchQuery: '' });
    const view = await openSheet();
    const title = screen.getByRole('button', { name: 'Title' });
    title.focus();
    await fireEvent.keyDown(title, { key: 'Escape' });
    expect(view).toHaveAttribute('aria-expanded', 'false');
    expect(view).toHaveFocus();
  });
});
