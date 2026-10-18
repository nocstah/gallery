// Local Omarchy layer: the logic of the sidebar's album trees (components/sidebar/album-tree), kept apart from the
// markup so it can be tested on its own: the rows a keyboard walks through, and what each key does.
//
// The tree is one tab stop, a WAI-ARIA tree: the arrows walk the rows that show, → opens a folder or goes into it,
// ← closes it or goes up to the folder it sits in, Home and End go to the first and the last row, Enter follows the
// row's link (an album, a folder's page) and Space does the same.

export type TreeRowKind = 'folder' | 'album';

export interface TreeRow {
  kind: TreeRowKind;
  /** unique in its tree: `f:<folder id>`, `a:<album id>` */
  key: string;
  /** the folder's or the album's id */
  id: string;
  /** 0 at the top */
  depth: number;
  /** the key of the folder row it sits in, null at the top */
  parent: string | null;
  /** a folder with something in it: it opens and closes */
  expandable: boolean;
  /** an expandable folder that is open */
  open: boolean;
}

export const folderKey = (id: string) => `f:${id}`;
export const albumKey = (id: string) => `a:${id}`;

export interface TreeWalk {
  /** the folders and albums of the level in this folder (null: the top), in order */
  shown: (folderId: string | null) => { folders: { id: string }[]; albums: { id: string }[] };
  /** whether a folder holds anything at all */
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
  };
  walk(null, 0);
  return rows;
};

/** What a key does on the focused row: move the focus, open or close a folder, or follow the row's link. */
export type TreeMove = { focus: string } | { open: string } | { close: string } | { follow: string };

/**
 * The tree's own keys, from the row with the focus. Undefined for a key the tree leaves alone (Enter, which the link
 * follows by itself, or any key it does not use). Right to left, → and ← swap, as the rows' indent does.
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
    case ' ': {
      return { follow: row.key };
    }
  }
};
