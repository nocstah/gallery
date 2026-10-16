// Local Omarchy layer: the album photos went into last, in this browser. The Add to album picker (L) puts it first so
// that Enter adds to it again; every add a person makes counts (the picker, a drop on the sidebar, the album page's
// own Add), not an upload's, and not a special album's (To do, Villa and QR have keys of their own).
const KEY = 'gallery.lastAlbum';

export const rememberLastAlbum = (albumId: string) => {
  try {
    localStorage.setItem(KEY, albumId);
  } catch {
    // storage blocked: the picker keeps its own order
  }
};

export const lastAlbumId = (): string | undefined => {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
};
