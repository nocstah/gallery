// Local Omarchy layer: the logic of the sidebar's album trees (components/sidebar/album-tree), kept apart from the
// markup so it can be tested on its own: what a level shows, the rows a keyboard walks through, and what each key does.
//
// The tree is one tab stop, a WAI-ARIA tree: the arrows walk the rows that show, → opens a folder or goes into it,
// ← closes it or goes up to the folder it sits in, Home and End go to the first and the last row, Enter follows the
// row's link (an album, a folder's page) and Space does the same; on a level's more row both show the rest, or less.

/** A level the tree opened by itself, to show what is on screen, keeps to the way there once it holds more rows. */
export const LONG_LEVEL = 8;

export type TreeRowKind = 'folder' | 'album' | 'more';

export interface TreeRow {
  kind: TreeRowKind;
  /** unique in its tree: `f:<folder id>`, `a:<album id>`, `m:<folder id>` (`m:` for the top) */
  key: string;
  /** the folder's or the album's id; for a more row, the folder whose rest it shows ('' at the top) */
  id: string;
  /** 0 at the top */
  depth: number;
  /** the key of the folder row it sits in, null at the top */
  parent: string | null;
  /** a folder with something in it: it opens and closes */
  expandable: boolean;
  /** an expandable folder that is open; a more row whose level shows whole (it offers to show less) */
  open: boolean;
}

export interface Shown<F, A> {
  folders: F[];
  albums: A[];
  /** how many of the level's folders and albums wait behind its more row (none when it shows them all) */
  hidden: number;
  /** a long level shown whole from its more row, which then offers to show less */
  less: boolean;
}

/**
 * What a level shows. A level the person opened (a folder's chevron or →, the top of the tree) shows everything in it.
 * A level the tree opened only to show what is on screen shows everything while it is short; once it holds more than
 * LONG_LEVEL rows it keeps to the way there: its folders while they are few (else the one on the way), and of its
 * albums only the one on screen; the rest wait behind "+N more", which shows them in place (`more`) and then offers to
 * show less again.
 */
export const shownAt = <F extends { id: string }, A extends { id: string }>(
  folders: F[],
  albums: A[],
  {
    opened,
    more = false,
    path,
    album,
  }: { opened: boolean; more?: boolean; path: ReadonlySet<string>; album?: string | null },
): Shown<F, A> => {
  const total = folders.length + albums.length;
  if (opened || total <= LONG_LEVEL) {
    return { folders, albums, hidden: 0, less: false };
  }
  if (more) {
    return { folders, albums, hidden: 0, less: true };
  }
  const keptFolders = folders.length <= LONG_LEVEL ? folders : folders.filter(({ id }) => path.has(id));
  const keptAlbums = albums.filter(({ id }) => id === album);
  return {
    folders: keptFolders,
    albums: keptAlbums,
    hidden: total - keptFolders.length - keptAlbums.length,
    less: false,
  };
};

export const folderKey = (id: string) => `f:${id}`;
export const albumKey = (id: string) => `a:${id}`;
export const moreKey = (folderId: string | null) => `m:${folderId ?? ''}`;

export interface TreeWalk {
  /** what the level in this folder (null: the top) shows */
  shown: (folderId: string | null) => Shown<{ id: string }, { id: string }>;
  /** whether a folder holds anything at all (shown or not) */
  filled: (folderId: string) => boolean;
  isOpen: (folderId: string) => boolean;
}

/** Every row that shows, in the order they stand on screen (a folder's open level right under it). */
export const visibleRows = ({ shown, filled, isOpen }: TreeWalk): TreeRow[] => {
  const rows: TreeRow[] = [];
  const walk = (folderId: string | null, depth: number) => {
    const parent = folderId === null ? null : folderKey(folderId);
    const level = shown(folderId);
    for (const { id } of level.folders) {
      const expandable = filled(id);
      const open = expandable && isOpen(id);
      rows.push({ kind: 'folder', key: folderKey(id), id, depth, parent, expandable, open });
      // a tree is never deeper than Gallery's depth cap, so a broken one cannot loop
      if (open && depth < 32) {
        walk(id, depth + 1);
      }
    }
    for (const { id } of level.albums) {
      rows.push({ kind: 'album', key: albumKey(id), id, depth, parent, expandable: false, open: false });
    }
    if (level.hidden > 0 || level.less) {
      rows.push({
        kind: 'more',
        key: moreKey(folderId),
        id: folderId ?? '',
        depth,
        parent,
        expandable: false,
        open: level.less,
      });
    }
  };
  walk(null, 0);
  return rows;
};

/**
 * What a key does on the focused row: move the focus, open or close a folder, show the rest of a level or less of it
 * (by its folder's id, '' at the top), or follow the row's link.
 */
export type TreeMove =
  { focus: string } | { open: string } | { close: string } | { more: string } | { less: string } | { follow: string };

/**
 * The tree's own keys, from the row with the focus. Undefined for a key the tree leaves alone (Enter on a link, which
 * the link follows by itself, or any key it does not use). Right to left, → and ← swap, as the rows' indent does.
 */
export const treeKey = (rows: TreeRow[], at: string, key: string, rtl = false): TreeMove | undefined => {
  const index = rows.findIndex((row) => row.key === at);
  const row = rows[index];
  if (!row) {
    return;
  }
  const into = rtl ? 'ArrowLeft' : 'ArrowRight';
  const out = rtl ? 'ArrowRight' : 'ArrowLeft';
  const focus = (next: TreeRow | undefined) => (next && next.key !== at ? { focus: next.key } : undefined);
  switch (key) {
    case 'ArrowDown': {
      return focus(rows[index + 1]);
    }
    case 'ArrowUp': {
      return focus(rows[index - 1]);
    }
    case 'Home': {
      return focus(rows[0]);
    }
    case 'End': {
      return focus(rows.at(-1));
    }
    case into: {
      if (!row.expandable) {
        return;
      }
      if (!row.open) {
        return { open: row.id };
      }
      const child = rows[index + 1];
      return child?.parent === row.key ? { focus: child.key } : undefined;
    }
    case out: {
      if (row.open) {
        return { close: row.id };
      }
      return row.parent ? { focus: row.parent } : undefined;
    }
    case 'Enter':
    case ' ': {
      if (row.kind === 'more') {
        return row.open ? { less: row.id } : { more: row.id };
      }
      return key === ' ' ? { follow: row.key } : undefined;
    }
  }
};
