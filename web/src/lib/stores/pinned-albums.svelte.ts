// Local Omarchy layer: albums pinned to the sidebar, as the Mac's Photos pins what you visit most at the top of its
// sidebar. Pinned from an album's menus (its card's right-click and ⋮, the album page's ⋮, its row in the sidebar's
// tree) and shown in the order pinned, in a Pinned group above Library (components/sidebar/pinned-albums). Kept per
// browser: a blocked or broken storage only means nothing stays pinned after a reload. An album that no longer
// exists (deleted, or no longer shared with me) simply leaves the list.
import { getAlbumInfo, isHttpError, type AlbumResponseDto } from '@immich/sdk';

const KEY = 'gallery.pinnedAlbums';

/** The pinned album ids in storage, in the order pinned; anything unreadable counts as none. */
export const readPins = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(value)) {
      return [];
    }
    const ids = value.filter((id): id is string => typeof id === 'string');
    return ids.filter((id, index) => ids.indexOf(id) === index);
  } catch {
    return [];
  }
};

const writePins = (ids: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // storage blocked: the pins last as long as the page
  }
};

/** Gallery's answer for an album that is gone or no longer mine to see, as opposed to a network hiccup. */
const isGone = (error: unknown) => isHttpError(error) && [400, 403, 404].includes(error.status);

class PinnedAlbums {
  /** the pinned album ids, in the order pinned */
  ids = $state<string[]>(readPins());
  /** what Gallery said of each pinned album (its name and cover), once asked */
  albums = $state.raw<Record<string, AlbumResponseDto>>({});
  // the albums being asked for (not state: nothing shows it)
  #asking: string[] = [];

  constructor() {
    // another tab pinned or unpinned one
    globalThis.addEventListener?.('storage', (event: StorageEvent) => {
      if (event.key === KEY) {
        this.ids = readPins();
      }
    });
  }

  has(albumId: string) {
    return this.ids.includes(albumId);
  }

  pin(albumId: string) {
    if (!this.has(albumId)) {
      this.ids = [...this.ids, albumId];
      writePins(this.ids);
    }
  }

  unpin(albumId: string) {
    if (this.has(albumId)) {
      this.ids = this.ids.filter((id) => id !== albumId);
      writePins(this.ids);
    }
  }

  toggle(albumId: string) {
    if (this.has(albumId)) {
      this.unpin(albumId);
    } else {
      this.pin(albumId);
    }
  }

  /** The pinned albums Gallery has named, in the order pinned. */
  get shown() {
    return this.ids.flatMap((id) => (Object.hasOwn(this.albums, id) ? [this.albums[id]] : []));
  }

  /** What the page already knows of an album (an edit, a rename), kept while it is pinned. */
  remember(album: AlbumResponseDto) {
    if (this.has(album.id)) {
      this.albums = { ...this.albums, [album.id]: album };
    }
  }

  /** An album that is gone leaves the list. */
  forget(albumId: string) {
    this.unpin(albumId);
    if (Object.hasOwn(this.albums, albumId)) {
      const { [albumId]: _, ...rest } = this.albums;
      this.albums = rest;
    }
  }

  /** Asks Gallery for each pinned album not known yet; one that is gone is unpinned, one it cannot reach waits. */
  async load() {
    const missing = this.ids.filter((id) => !Object.hasOwn(this.albums, id) && !this.#asking.includes(id));
    await Promise.all(
      missing.map(async (id) => {
        this.#asking.push(id);
        try {
          this.remember(await getAlbumInfo({ id }));
        } catch (error) {
          if (isGone(error)) {
            this.forget(id);
          }
        } finally {
          this.#asking = this.#asking.filter((asked) => asked !== id);
        }
      }),
    );
  }
}

export const pinnedAlbums = new PinnedAlbums();
