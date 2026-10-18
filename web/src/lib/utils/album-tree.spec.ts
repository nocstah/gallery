import {
  albumKey,
  folderKey,
  LONG_LEVEL,
  moreKey,
  shownAt,
  treeKey,
  visibleRows,
  type TreeWalk,
} from '$lib/utils/album-tree';

// Local Omarchy layer: the sidebar's album trees as one tab stop (components/sidebar/album-tree)
const items = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index + 1}` }));

describe('what a level of the album tree shows', () => {
  const none = new Set<string>();

  it('shows a short level whole, even when the tree opened it', () => {
    const level = shownAt(items('f', 2), items('a', LONG_LEVEL - 2), { opened: false, path: none });
    expect(level.folders).toHaveLength(2);
    expect(level.albums).toHaveLength(LONG_LEVEL - 2);
    expect(level.hidden).toBe(0);
  });

  it('shows a level the person opened whole, however long', () => {
    const level = shownAt([], items('a', 55), { opened: true, path: none });
    expect(level.albums).toHaveLength(55);
    expect(level.hidden).toBe(0);
  });

  it('keeps a long level the tree opened to the album on screen, the rest behind more', () => {
    const level = shownAt([], items('a', 55), { opened: false, path: none, album: 'a20' });
    expect(level.albums.map(({ id }) => id)).toEqual(['a20']);
    expect(level.hidden).toBe(54);
    expect(level.less).toBe(false);
  });

  it('shows a long level whole from its more row, which then offers less', () => {
    const level = shownAt([], items('a', 55), { opened: false, more: true, path: none, album: 'a20' });
    expect(level.albums).toHaveLength(55);
    expect(level.hidden).toBe(0);
    expect(level.less).toBe(true);
    // a level the person opened has no more row to offer less
    expect(shownAt([], items('a', 55), { opened: true, more: true, path: none }).less).toBe(false);
  });

  it('keeps the few folders of a long level, and none of its albums when the one on screen is deeper', () => {
    const level = shownAt(items('f', 3), items('a', 43), { opened: false, path: new Set(['f2']), album: 'deep' });
    expect(level.folders.map(({ id }) => id)).toEqual(['f1', 'f2', 'f3']);
    expect(level.albums).toEqual([]);
    expect(level.hidden).toBe(43);
  });

  it('keeps only the folder on the way when a long level has many folders', () => {
    const level = shownAt(items('f', 20), items('a', 2), { opened: false, path: new Set(['f7']) });
    expect(level.folders.map(({ id }) => id)).toEqual(['f7']);
    expect(level.hidden).toBe(21);
  });
});

describe('the rows of the album tree', () => {
  // Trips (open) holds Asia (open, long and capped) and Europe (closed); Highlights sits at the top
  const walk: TreeWalk = {
    shown: (folderId) => {
      switch (folderId) {
        case null: {
          return {
            folders: [{ id: 'trips' }, { id: 'empty' }],
            albums: [{ id: 'highlights' }],
            hidden: 0,
            less: false,
          };
        }
        case 'trips': {
          return { folders: [{ id: 'asia' }, { id: 'europe' }], albums: [], hidden: 0, less: false };
        }
        case 'asia': {
          return { folders: [], albums: [{ id: 'kradan' }], hidden: 54, less: false };
        }
        default: {
          return { folders: [], albums: [], hidden: 0, less: false };
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
      moreKey('asia'),
      folderKey('europe'),
      folderKey('empty'),
      albumKey('highlights'),
    ]);
    expect(rows.find(({ key }) => key === albumKey('kradan'))).toMatchObject({ depth: 2, parent: folderKey('asia') });
    expect(rows.find(({ key }) => key === folderKey('empty'))).toMatchObject({ expandable: false, open: false });
  });

  it('walks the rows with the up and down arrows, Home and End', () => {
    expect(treeKey(rows, folderKey('trips'), 'ArrowDown')).toEqual({ focus: folderKey('asia') });
    expect(treeKey(rows, moreKey('asia'), 'ArrowDown')).toEqual({ focus: folderKey('europe') });
    expect(treeKey(rows, folderKey('europe'), 'ArrowUp')).toEqual({ focus: moreKey('asia') });
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
    expect(treeKey(rows, moreKey('asia'), 'ArrowLeft')).toEqual({ focus: folderKey('asia') });
    expect(treeKey(rows, folderKey('europe'), 'ArrowLeft')).toEqual({ focus: folderKey('trips') });
    // at the top there is nowhere to go up to
    expect(treeKey(rows, albumKey('highlights'), 'ArrowLeft')).toBeUndefined();
  });

  it('swaps → and ← right to left', () => {
    expect(treeKey(rows, folderKey('europe'), 'ArrowLeft', true)).toEqual({ open: 'europe' });
    expect(treeKey(rows, albumKey('kradan'), 'ArrowRight', true)).toEqual({ focus: folderKey('asia') });
  });

  it('leaves Enter on a link to the link, follows it on Space, and shows the rest from a more row', () => {
    expect(treeKey(rows, albumKey('kradan'), 'Enter')).toBeUndefined();
    expect(treeKey(rows, albumKey('kradan'), ' ')).toEqual({ follow: albumKey('kradan') });
    expect(treeKey(rows, moreKey('asia'), 'Enter')).toEqual({ more: 'asia' });
    expect(treeKey(rows, moreKey('asia'), ' ')).toEqual({ more: 'asia' });
  });

  it('shows less again from the more row of a level shown whole', () => {
    const whole = visibleRows({
      ...walk,
      shown: (folderId) =>
        folderId === 'asia'
          ? { folders: [], albums: [{ id: 'chang' }, { id: 'kradan' }], hidden: 0, less: true }
          : walk.shown(folderId),
    });
    expect(whole.filter(({ parent }) => parent === folderKey('asia')).map(({ key }) => key)).toEqual([
      albumKey('chang'),
      albumKey('kradan'),
      moreKey('asia'),
    ]);
    expect(treeKey(whole, moreKey('asia'), 'Enter')).toEqual({ less: 'asia' });
  });

  it('leaves every other key to the page', () => {
    expect(treeKey(rows, albumKey('kradan'), 'b')).toBeUndefined();
    expect(treeKey(rows, albumKey('kradan'), 'Tab')).toBeUndefined();
    expect(treeKey(rows, 'gone', 'ArrowDown')).toBeUndefined();
  });
});
