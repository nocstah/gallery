import { albumKey, folderKey, treeKey, visibleRows, type TreeWalk } from '$lib/utils/album-tree';

// Local Omarchy layer: the sidebar's album trees as one tab stop (components/sidebar/album-tree)
describe('the rows of the album tree', () => {
  // Trips (open) holds Asia (open) and Europe (closed); Highlights sits at the top
  const walk: TreeWalk = {
    shown: (folderId) => {
      switch (folderId) {
        case null: {
          return { folders: [{ id: 'trips' }, { id: 'empty' }], albums: [{ id: 'highlights' }] };
        }
        case 'trips': {
          return { folders: [{ id: 'asia' }, { id: 'europe' }], albums: [] };
        }
        case 'asia': {
          return { folders: [], albums: [{ id: 'kradan' }, { id: 'lanta' }] };
        }
        default: {
          return { folders: [], albums: [] };
        }
      }
    },
    filled: (folderId) => folderId !== 'empty',
    isOpen: (folderId) => folderId === 'trips' || folderId === 'asia',
  };
  const rows = visibleRows(walk);

  it('lists the rows in the order they show, each level under its folder', () => {
    expect(rows.map(({ key }) => key)).toEqual([
      folderKey('trips'),
      folderKey('asia'),
      albumKey('kradan'),
      albumKey('lanta'),
      folderKey('europe'),
      folderKey('empty'),
      albumKey('highlights'),
    ]);
    expect(rows.find(({ key }) => key === albumKey('kradan'))).toMatchObject({ depth: 2, parent: folderKey('asia') });
    expect(rows.find(({ key }) => key === folderKey('empty'))).toMatchObject({ expandable: false, open: false });
  });

  it('walks the rows with the up and down arrows, Home and End', () => {
    expect(treeKey(rows, folderKey('trips'), 'ArrowDown')).toEqual({ focus: folderKey('asia') });
    expect(treeKey(rows, albumKey('lanta'), 'ArrowDown')).toEqual({ focus: folderKey('europe') });
    expect(treeKey(rows, folderKey('europe'), 'ArrowUp')).toEqual({ focus: albumKey('lanta') });
    expect(treeKey(rows, albumKey('highlights'), 'Home')).toEqual({ focus: folderKey('trips') });
    expect(treeKey(rows, folderKey('trips'), 'End')).toEqual({ focus: albumKey('highlights') });
    // nothing past the ends
    expect(treeKey(rows, folderKey('trips'), 'ArrowUp')).toBeUndefined();
    expect(treeKey(rows, albumKey('highlights'), 'ArrowDown')).toBeUndefined();
  });

  it('opens a closed folder with →, and goes into an open one', () => {
    expect(treeKey(rows, folderKey('europe'), 'ArrowRight')).toEqual({ open: 'europe' });
    expect(treeKey(rows, folderKey('trips'), 'ArrowRight')).toEqual({ focus: folderKey('asia') });
    // an album, an empty folder: nothing to open
    expect(treeKey(rows, albumKey('kradan'), 'ArrowRight')).toBeUndefined();
    expect(treeKey(rows, folderKey('empty'), 'ArrowRight')).toBeUndefined();
  });

  it('closes an open folder with ←, and goes up to the folder a row sits in', () => {
    expect(treeKey(rows, folderKey('asia'), 'ArrowLeft')).toEqual({ close: 'asia' });
    expect(treeKey(rows, albumKey('kradan'), 'ArrowLeft')).toEqual({ focus: folderKey('asia') });
    expect(treeKey(rows, folderKey('europe'), 'ArrowLeft')).toEqual({ focus: folderKey('trips') });
    // at the top there is nowhere to go up to
    expect(treeKey(rows, albumKey('highlights'), 'ArrowLeft')).toBeUndefined();
  });

  it('swaps → and ← right to left', () => {
    expect(treeKey(rows, folderKey('europe'), 'ArrowLeft', true)).toEqual({ open: 'europe' });
    expect(treeKey(rows, albumKey('kradan'), 'ArrowRight', true)).toEqual({ focus: folderKey('asia') });
  });

  it('leaves Enter to the link and follows it on Space', () => {
    expect(treeKey(rows, albumKey('kradan'), 'Enter')).toBeUndefined();
    expect(treeKey(rows, albumKey('kradan'), ' ')).toEqual({ follow: albumKey('kradan') });
  });

  it('leaves every other key to the page', () => {
    expect(treeKey(rows, albumKey('kradan'), 'b')).toBeUndefined();
    expect(treeKey(rows, albumKey('kradan'), 'Tab')).toBeUndefined();
    expect(treeKey(rows, 'gone', 'ArrowDown')).toBeUndefined();
  });
});
