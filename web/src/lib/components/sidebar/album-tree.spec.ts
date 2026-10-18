import type { SharedSpaceAlbumFolderDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { addMessages } from 'svelte-i18n';
import { get } from 'svelte/store';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sidebarDrop, SPRING_MS } from '$lib/managers/sidebar-drop.svelte';
import { albumTreeOpen } from '$lib/stores/preferences.store';
import AlbumTree from './album-tree.svelte';

const mocks = vi.hoisted(() => ({ showPinMenu: vi.fn() }));
vi.mock('$lib/utils/pin-menu', () => ({ showPinMenu: mocks.showPinMenu }));

// Local Omarchy layer: albums in their folders as a Mac-like tree in the sidebar (components/sidebar/album-tree)
const folder = (id: string, name: string, parentId: string | null = null) =>
  ({ id, name, parentId, spaceId: 'library' }) as SharedSpaceAlbumFolderDto;

const props = {
  scope: 'albums',
  label: 'Albums',
  folders: [
    folder('trips', 'Trips'),
    folder('asia', 'Asia', 'trips'),
    folder('europe', 'Europe', 'trips'),
    folder('empty', 'Empty'),
    folder('home', 'Home Life'),
  ],
  albums: [
    { id: 'bali', name: 'Bali', folderId: 'asia' },
    { id: 'malta', name: 'Malta', folderId: 'europe' },
    { id: 'kaken', name: 'Kåken min', folderId: 'home' },
    { id: 'highlights', name: 'Highlights', folderId: null },
    { id: 'lost', name: 'Lost', folderId: 'deleted-folder' },
  ],
  folderHref: (id: string) => `/albums?folder=${id}`,
  albumHref: (id: string) => `/albums/${id}`,
};

describe('album tree', () => {
  beforeAll(() => addMessages('dev', { expand_named: 'Expand {name}', collapse_named: 'Collapse {name}' }));
  beforeEach(() => albumTreeOpen.set({}));

  it('starts closed: the top folders by name, then the albums at the top', () => {
    render(AlbumTree, props);
    const names = screen.getAllByRole('treeitem').map((row) => row.textContent?.trim());
    expect(names).toEqual(['Empty', 'Home Life', 'Trips', 'Highlights', 'Lost']);
    expect(screen.queryByTestId('tree-folder-asia')).not.toBeInTheDocument();
  });

  it('opens a folder on its chevron, remembers it, and links its name to its page', async () => {
    render(AlbumTree, props);
    expect(screen.getByTestId('tree-folder-trips')).toHaveAttribute('href', '/albums?folder=trips');
    await fireEvent.click(screen.getByTestId('tree-toggle-trips'));
    expect(screen.getByTestId('tree-folder-asia')).toBeInTheDocument();
    expect(screen.getByTestId('tree-folder-europe')).toBeInTheDocument();
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': true });
  });

  // Local Omarchy layer: a WAI-ARIA tree of links, one tab stop; the chevrons are the pointer's and name their folder
  it('is a tree of links: a folder row says whether it is open and owns the rows under it', async () => {
    render(AlbumTree, props);
    expect(screen.getByRole('tree', { name: 'Albums' })).toBeInTheDocument();
    const trips = screen.getByRole('treeitem', { name: 'Trips' });
    expect(trips).toHaveAttribute('aria-expanded', 'false');
    expect(trips).toHaveAttribute('aria-level', '1');
    expect(trips).not.toHaveAttribute('aria-owns');
    expect(screen.getByTestId('tree-toggle-trips')).toHaveAttribute('title', 'Expand Trips');
    await fireEvent.click(screen.getByTestId('tree-toggle-trips'));
    expect(trips).toHaveAttribute('aria-expanded', 'true');
    const group = screen.getByRole('group');
    expect(trips).toHaveAttribute('aria-owns', group.id);
    expect(screen.getByRole('treeitem', { name: 'Asia' })).toHaveAttribute('aria-level', '2');
    expect(screen.getByTestId('tree-toggle-trips')).toHaveAttribute('title', 'Collapse Trips');
    // no chevron, no link, is a tab stop of its own: the tree has one, the row last used (the first before that)
    expect(screen.queryAllByRole('button')).toEqual([]);
    const stops = screen.getAllByRole('treeitem').filter((row) => row.getAttribute('tabindex') === '0');
    expect(stops).toEqual([trips]);
  });

  it('makes the first row the tab stop until another is used', () => {
    render(AlbumTree, props);
    const stops = screen.getAllByRole('treeitem').filter((row) => row.getAttribute('tabindex') === '0');
    expect(stops).toEqual([screen.getByTestId('tree-folder-empty')]);
  });

  it('gives a folder with nothing in it no chevron', () => {
    render(AlbumTree, props);
    expect(screen.queryByTestId('tree-toggle-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('tree-folder-empty')).not.toHaveAttribute('aria-expanded');
  });

  it('opens the folders above the album on screen and lights its row, without remembering them', () => {
    render(AlbumTree, { ...props, activeAlbumId: 'bali' });
    expect(screen.getByTestId('tree-album-bali')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('tree-folder-asia')).toHaveAttribute('aria-expanded', 'true');
    // the album on screen is the tree's tab stop
    expect(screen.getByTestId('tree-album-bali')).toHaveAttribute('tabindex', '0');
    expect(get(albumTreeOpen)).toEqual({});
  });

  // Local Omarchy layer: the folders opened to show what is on screen were remembered, so after one visit to a deep
  // album every page carried them open; only the folders the person opened stay open
  it('closes the folders it opened for the album on screen once something else is', async () => {
    const { rerender } = render(AlbumTree, { ...props, activeAlbumId: 'bali' });
    expect(screen.getByTestId('tree-album-bali')).toBeInTheDocument();
    await rerender({ ...props, activeAlbumId: 'highlights' });
    expect(screen.queryByTestId('tree-folder-asia')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tree-album-bali')).not.toBeInTheDocument();
    expect(get(albumTreeOpen)).toEqual({});
  });

  it('keeps a folder the person opened open when the album in it leaves the screen', async () => {
    const { rerender } = render(AlbumTree, { ...props, activeAlbumId: 'bali' });
    await fireEvent.click(screen.getByTestId('tree-toggle-trips'));
    await fireEvent.click(screen.getByTestId('tree-toggle-trips'));
    await rerender({ ...props, activeAlbumId: 'highlights' });
    expect(screen.getByTestId('tree-folder-asia')).toBeInTheDocument();
    expect(screen.queryByTestId('tree-album-bali')).not.toBeInTheDocument();
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': true });
  });

  it('leaves a folder closed by hand closed while its album stays on screen', async () => {
    const { rerender } = render(AlbumTree, { ...props, activeAlbumId: 'bali' });
    await fireEvent.click(screen.getByTestId('tree-toggle-asia'));
    expect(screen.queryByTestId('tree-album-bali')).not.toBeInTheDocument();
    // the albums load again (an album changed somewhere): the same album on screen, the same folders
    await rerender({ ...props, albums: [...props.albums], activeAlbumId: 'bali' });
    expect(screen.queryByTestId('tree-album-bali')).not.toBeInTheDocument();
  });

  it('opens the folders once the albums have loaded, for an album already on screen', async () => {
    const { rerender } = render(AlbumTree, { ...props, albums: [], activeAlbumId: 'bali' });
    await rerender({ ...props, activeAlbumId: 'bali' });
    expect(screen.getByTestId('tree-album-bali')).toBeInTheDocument();
  });

  it('keeps each tree its own open folders', () => {
    albumTreeOpen.set({ 'space:family:trips': true });
    render(AlbumTree, props);
    expect(screen.queryByTestId('tree-folder-asia')).not.toBeInTheDocument();
  });

  it('marks an album kept out of Photos with the eye at its row end', () => {
    render(AlbumTree, {
      ...props,
      albums: [...props.albums, { id: 'slips', name: 'Old slips', folderId: null, hidden: true }],
    });

    expect(screen.getByTestId('tree-album-hidden-slips')).toHaveAttribute(
      'title',
      expect.stringMatching(/album_not_in_photos|Not in Photos/),
    );
    expect(screen.queryByTestId('tree-album-hidden-highlights')).not.toBeInTheDocument();
  });
});

// Local Omarchy layer: a long folder the tree opened by itself keeps to the way to what is on screen; the whole
// folder (siblings and all) opened under an album page, some 140 rows
describe('album tree on a long folder', () => {
  beforeAll(() =>
    addMessages('dev', {
      expand_named: 'Expand {name}',
      collapse_named: 'Collapse {name}',
      album_tree_more: '+{count} more',
      album_tree_more_label: 'Show {count} more in {name}',
      show_less: 'Show less',
    }),
  );
  beforeEach(() => albumTreeOpen.set({}));

  // Asia holds twelve albums, Trips three folders and ten albums of its own; each test is a tree of its own, since the
  // levels shown whole are kept for the page load
  const many = (prefix: string, count: number, folderId: string) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${prefix}${index + 1}`,
      name: `${prefix} ${index + 1}`,
      folderId,
    }));
  const long = (scope: string) => ({
    ...props,
    scope,
    folders: [
      folder('trips', 'Trips'),
      folder('asia', 'Asia', 'trips'),
      folder('europe', 'Europe', 'trips'),
      folder('africa', 'Africa', 'trips'),
    ],
    albums: [
      ...many('asia', 12, 'asia'),
      ...many('trip', 10, 'trips'),
      { id: 'malta', name: 'Malta', folderId: 'europe' },
    ],
  });
  const names = () => screen.getAllByRole('treeitem').map((row) => row.textContent?.trim());

  it('shows only the way to the album on screen, the rest behind more', () => {
    render(AlbumTree, { ...long('long-1'), activeAlbumId: 'asia5' });
    expect(names()).toEqual(['Trips', 'Africa', 'Asia', 'asia 5', '+11 more', 'Europe', '+10 more']);
    expect(screen.getByTestId('tree-more-asia')).toHaveAccessibleName('Show 11 more in Asia');
    expect(screen.getByTestId('tree-more-asia')).toHaveAttribute('aria-level', '3');
  });

  it('shows the rest in place from its more row, then less again', async () => {
    render(AlbumTree, { ...long('long-2'), activeAlbumId: 'asia5' });
    await fireEvent.click(screen.getByTestId('tree-more-asia'));
    expect(screen.getAllByRole('treeitem', { name: /^asia \d+$/ })).toHaveLength(12);
    expect(screen.getByTestId('tree-more-asia')).toHaveTextContent('Show less');
    // never remembered
    expect(get(albumTreeOpen)).toEqual({});
    await fireEvent.click(screen.getByTestId('tree-more-asia'));
    expect(screen.getAllByRole('treeitem', { name: /^asia \d+$/ })).toHaveLength(1);
  });

  it('shows the rest from the more row with Enter, the focus staying on it', async () => {
    render(AlbumTree, { ...long('long-3'), activeAlbumId: 'asia5' });
    const more = screen.getByTestId('tree-more-asia');
    more.focus();
    await fireEvent.keyDown(more, { key: 'Enter' });
    expect(screen.getAllByRole('treeitem', { name: /^asia \d+$/ })).toHaveLength(12);
    expect(screen.getByTestId('tree-more-asia')).toHaveFocus();
    expect(screen.getByTestId('tree-more-asia')).toHaveAttribute('tabindex', '0');
  });

  it('shows a long folder the person opened whole', () => {
    albumTreeOpen.set({ 'long-4:asia': true });
    render(AlbumTree, { ...long('long-4'), activeAlbumId: 'asia5' });
    expect(screen.getAllByRole('treeitem', { name: /^asia \d+$/ })).toHaveLength(12);
    expect(screen.queryByTestId('tree-more-asia')).not.toBeInTheDocument();
  });

  it('keeps a level shown whole while it stays open, and the way there once it has closed', async () => {
    const { rerender } = render(AlbumTree, { ...long('long-5'), activeAlbumId: 'asia5' });
    await fireEvent.click(screen.getByTestId('tree-more-asia'));
    // another album in Asia: still whole
    await rerender({ ...long('long-5'), activeAlbumId: 'asia6' });
    expect(screen.getAllByRole('treeitem', { name: /^asia \d+$/ })).toHaveLength(12);
    // somewhere else, then back: the way there again
    await rerender({ ...long('long-5'), activeAlbumId: 'malta' });
    await rerender({ ...long('long-5'), activeAlbumId: 'asia6' });
    expect(screen.getAllByRole('treeitem', { name: /^asia \d+$/ })).toHaveLength(1);
  });
});

// Local Omarchy layer: the tree is one tab stop walked with the keys (utils/album-tree has the rules)
describe('album tree with the keyboard', () => {
  beforeAll(() => addMessages('dev', { expand_named: 'Expand {name}', collapse_named: 'Collapse {name}' }));
  beforeEach(() => albumTreeOpen.set({}));

  const key = (row: HTMLElement, name: string) => fireEvent.keyDown(row, { key: name });

  it('moves the focus and the tab stop with the up and down arrows, Home and End', async () => {
    render(AlbumTree, props);
    const empty = screen.getByTestId('tree-folder-empty');
    empty.focus();
    await key(empty, 'ArrowDown');
    await tick();
    expect(screen.getByTestId('tree-folder-home')).toHaveFocus();
    expect(screen.getByTestId('tree-folder-home')).toHaveAttribute('tabindex', '0');
    expect(empty).toHaveAttribute('tabindex', '-1');
    await key(screen.getByTestId('tree-folder-home'), 'End');
    await tick();
    expect(screen.getByTestId('tree-album-lost')).toHaveFocus();
    await key(screen.getByTestId('tree-album-lost'), 'Home');
    await tick();
    expect(empty).toHaveFocus();
  });

  it('opens a folder with →, goes into it with → again, and back out and closed with ←', async () => {
    render(AlbumTree, props);
    const trips = screen.getByTestId('tree-folder-trips');
    trips.focus();
    await key(trips, 'ArrowRight');
    await tick();
    expect(trips).toHaveAttribute('aria-expanded', 'true');
    expect(trips).toHaveFocus();
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': true });
    await key(trips, 'ArrowRight');
    await tick();
    expect(screen.getByTestId('tree-folder-asia')).toHaveFocus();
    await key(screen.getByTestId('tree-folder-asia'), 'ArrowLeft');
    await tick();
    expect(trips).toHaveFocus();
    await key(trips, 'ArrowLeft');
    await tick();
    expect(trips).toHaveAttribute('aria-expanded', 'false');
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': false });
  });

  it('keeps the keys it uses from the page, and leaves it the rest', () => {
    render(AlbumTree, props);
    const empty = screen.getByTestId('tree-folder-empty');
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    empty.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    const letter = new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true });
    empty.dispatchEvent(letter);
    expect(letter.defaultPrevented).toBe(false);
  });

  it('follows the row link on Space, as Enter does', async () => {
    render(AlbumTree, props);
    const highlights = screen.getByTestId('tree-album-highlights');
    const followed = vi.fn((event: Event) => event.preventDefault());
    highlights.addEventListener('click', followed);
    await key(highlights, ' ');
    expect(followed).toHaveBeenCalledOnce();
  });
});

// Local Omarchy layer: photos carried to the tree go into an album row, and a folder row springs open under them
// (managers/sidebar-drop)
describe('album tree under carried photos', () => {
  let nav: HTMLElement;

  beforeEach(() => {
    albumTreeOpen.set({});
    vi.useFakeTimers();
    nav = document.createElement('nav');
    nav.id = 'sidebar';
    document.body.append(nav);
  });

  afterEach(() => {
    sidebarDrop.end();
    vi.useRealTimers();
    nav.remove();
  });

  const row = (testId: string) => screen.getByTestId(testId).closest('.ws-tree-row')!;

  it('takes photos into an album I may add to', () => {
    render(AlbumTree, { props: { ...props, canAdd: true }, target: nav });
    sidebarDrop.begin({ ids: ['a'], assets: [], source: {} });
    expect(sidebarDrop.hover([row('tree-album-highlights')])).toEqual({ label: 'drop_add_to' });
    expect(row('tree-album-highlights')).toHaveAttribute('data-drop-target');
    // a folder takes none
    expect(sidebarDrop.hover([row('tree-folder-trips')])).toEqual({});
  });

  it('keeps album rows dark when I may not add to them (a Space I only view)', () => {
    render(AlbumTree, { props, target: nav });
    sidebarDrop.begin({ ids: ['a'], assets: [], source: {} });
    expect(sidebarDrop.hover([row('tree-album-highlights')])).toEqual({});
  });

  it('springs a folder open under the photos and closes it again when they go elsewhere', () => {
    render(AlbumTree, { props: { ...props, canAdd: true }, target: nav });
    expect(row('tree-folder-empty')).not.toHaveAttribute('data-drop-spring');
    sidebarDrop.begin({ ids: ['a'], assets: [], source: {} });
    sidebarDrop.hover([row('tree-folder-trips')]);
    vi.advanceTimersByTime(SPRING_MS);
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': true });
    sidebarDrop.end();
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': false });
  });

  it('offers to pin an album from its row when the tree pins', async () => {
    render(AlbumTree, { props: { ...props, pinnable: true }, target: nav });
    await fireEvent.contextMenu(row('tree-album-highlights'));
    expect(mocks.showPinMenu).toHaveBeenCalledWith(expect.any(MouseEvent), 'highlights');
  });
});
