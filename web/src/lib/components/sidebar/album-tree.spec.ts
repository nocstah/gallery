import type { SharedSpaceAlbumFolderDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import { albumTreeOpen } from '$lib/stores/preferences.store';
import AlbumTree from './album-tree.svelte';

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
    const toggle = screen
      .getAllByRole('button', { name: 'expand' })
      .find((button) => button.closest('li')?.textContent?.includes('Trips'));
    await fireEvent.click(toggle!);
    expect(screen.getByTestId('tree-folder-asia')).toBeInTheDocument();
    expect(screen.getByTestId('tree-folder-europe')).toBeInTheDocument();
    expect(get(albumTreeOpen)).toEqual({ 'albums:trips': true });
  });

  it('gives a folder with nothing in it no chevron', () => {
    render(AlbumTree, props);
    const empty = screen.getByTestId('tree-folder-empty').closest('.ws-tree-row');
    expect(empty?.querySelector('button')).toBeNull();
  });

  it('opens the folders above the album on screen and lights its row', () => {
    render(AlbumTree, { ...props, activeAlbumId: 'bali' });
    expect(screen.getByTestId('tree-album-bali')).toHaveAttribute('aria-current', 'page');
    expect(get(albumTreeOpen)).toEqual({ 'albums:asia': true, 'albums:trips': true });
  });

  it('keeps each tree its own open folders', () => {
    albumTreeOpen.set({ 'space:family:trips': true });
    render(AlbumTree, props);
    expect(screen.queryByTestId('tree-folder-asia')).not.toBeInTheDocument();
  });
});
