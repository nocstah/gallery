import type { SharedSpaceAlbumFolderDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
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
    const names = screen.getAllByRole('link').map((link) => link.textContent?.trim());
    expect(names).toEqual(['Empty', 'Home Life', 'Trips', 'Highlights', 'Lost']);
    expect(screen.queryByTestId('tree-folder-asia')).not.toBeInTheDocument();
  });

  it('opens a folder on its chevron, remembers it, and links its name to its page', async () => {
    render(AlbumTree, props);
    expect(screen.getByTestId('tree-folder-trips')).toHaveAttribute('href', '/albums?folder=trips');
    await fireEvent.click(screen.getByRole('button', { name: 'Expand Trips' }));
    expect(screen.getByTestId('tree-folder-asia')).toBeInTheDocument();
    expect(screen.getByTestId('tree-folder-europe')).toBeInTheDocument();
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': true });
  });

  // Local Omarchy layer: every chevron said "Expand" or "Collapse" alone; it names its folder and says if it is open
  it('names the folder on its chevron and says whether it is open', async () => {
    render(AlbumTree, props);
    const toggle = screen.getByRole('button', { name: 'Expand Trips' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Collapse Trips' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('gives a folder with nothing in it no chevron', () => {
    render(AlbumTree, props);
    const empty = screen.getByTestId('tree-folder-empty').closest('.ws-tree-row');
    expect(empty?.querySelector('button')).toBeNull();
  });

  it('opens the folders above the album on screen and lights its row, without remembering them', () => {
    render(AlbumTree, { ...props, activeAlbumId: 'bali' });
    expect(screen.getByTestId('tree-album-bali')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Collapse Asia' })).toBeInTheDocument();
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
    await fireEvent.click(screen.getByRole('button', { name: 'Collapse Trips' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Expand Trips' }));
    await rerender({ ...props, activeAlbumId: 'highlights' });
    expect(screen.getByTestId('tree-folder-asia')).toBeInTheDocument();
    expect(screen.queryByTestId('tree-album-bali')).not.toBeInTheDocument();
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': true });
  });

  it('leaves a folder closed by hand closed while its album stays on screen', async () => {
    const { rerender } = render(AlbumTree, { ...props, activeAlbumId: 'bali' });
    await fireEvent.click(screen.getByRole('button', { name: 'Collapse Asia' }));
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
