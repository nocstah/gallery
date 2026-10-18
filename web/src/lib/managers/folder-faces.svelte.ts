// Local Omarchy layer: the photos the Albums page's folder cards show, chosen by utils/folder-faces ("Photos only, best
// first"). Gallery is asked once per page load: an album's favourites, a cover and a photo's recognised text are kept,
// so a folder and the folders inside it ask once between them, and coming back to Albums asks nothing again. At most
// AT_ONCE questions are in flight over all the folders on the page. A question that fails is asked again the next time
// the page asks, and so is a folder whose photos were chosen without its answer.
import { AssetTypeEnum, AssetVisibility, getAssetInfo, getAssetOcr, searchAssets } from '@immich/sdk';
import { SvelteMap } from 'svelte/reactivity';
import {
  chooseFaces,
  faceKey,
  isTextHeavy,
  type FaceAlbum,
  type FacePicture,
  type FaceSources,
} from '$lib/utils/folder-faces';

/** Questions to Gallery in flight at once, over every folder on the page. */
const AT_ONCE = 6;
/** A question not answered by then counts as failed: a level's folders show their photos together, and wait for it. */
const PATIENCE_MS = 8000;
/** An album's favourites asked for: enough to find one with a camera's data among them. */
const FAVOURITES = 3;

export class FolderFaceManager {
  /** the photos each folder shows, by faceKey */
  #faces = new SvelteMap<string, string[]>();
  // what was asked, and the answers kept for the page load: bookkeeping no page draws, so not reactive (resolve() runs
  // in the page's effect, which would otherwise depend on what it adds)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #asked = new Set<string>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #favourites = new Map<string, Promise<FacePicture[]>>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #pictures = new Map<string, Promise<FacePicture>>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #text = new Map<string, Promise<boolean>>();
  #running = 0;
  #waiting: Array<() => void> = [];

  readonly #sources: FaceSources = {
    favourites: (albumId) =>
      this.#once(this.#favourites, albumId, (signal) =>
        searchAssets(
          {
            metadataSearchDto: {
              albumIds: [albumId],
              isFavorite: true,
              type: AssetTypeEnum.Image,
              visibility: AssetVisibility.Timeline,
              withExif: true,
              size: FAVOURITES,
            },
          },
          { signal },
        ).then(({ assets }) => assets.items),
      ),
    picture: (assetId) => this.#once(this.#pictures, assetId, (signal) => getAssetInfo({ id: assetId }, { signal })),
    textHeavy: (assetId) =>
      this.#once(this.#text, assetId, (signal) => getAssetOcr({ id: assetId }, { signal }).then(isTextHeavy)),
  };

  /** The photos a folder shows; undefined while they are looked for. */
  get(folderId: string, albums: FaceAlbum[]) {
    return this.#faces.get(faceKey(folderId, albums));
  }

  /** Looks for a folder's photos, once per page load for the same albums and covers. */
  resolve(folderId: string, albums: FaceAlbum[]) {
    const key = faceKey(folderId, albums);
    if (this.#asked.has(key)) {
      return;
    }
    this.#asked.add(key);
    void chooseFaces(albums, this.#sources)
      .then(({ faces, complete }) => {
        this.#faces.set(key, faces);
        if (!complete) {
          this.#asked.delete(key);
        }
      })
      // nothing could be asked: the folder shows its quiet cover, and the page asks again next time
      .catch(() => {
        this.#faces.set(key, []);
        this.#asked.delete(key);
      });
  }

  #once<T>(answers: Map<string, Promise<T>>, key: string, ask: (signal: AbortSignal) => Promise<T>) {
    let answer = answers.get(key);
    if (!answer) {
      answer = this.#limited(ask);
      answers.set(key, answer);
      void answer.catch(() => answers.delete(key));
    }
    return answer;
  }

  /**
   * Runs `ask` once fewer than AT_ONCE are in flight, giving up on it after PATIENCE_MS; a finished question hands its
   * place to the next one waiting.
   */
  async #limited<T>(ask: (signal: AbortSignal) => Promise<T>) {
    if (this.#running < AT_ONCE) {
      this.#running++;
    } else {
      await new Promise<void>((resolve) => {
        this.#waiting.push(resolve);
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PATIENCE_MS);
    try {
      return await ask(controller.signal);
    } finally {
      clearTimeout(timer);
      const next = this.#waiting.shift();
      if (next) {
        next();
      } else {
        this.#running--;
      }
    }
  }
}

export const folderFaces = new FolderFaceManager();
