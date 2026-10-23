// Local Omarchy layer: the faces of the Years and Months overviews (utils/period-faces), asked of Gallery with each
// timeline's own filters, so a face is a photo that timeline shows, and chosen before a tile shows: the tile keeps the
// quiet ground of a cover still loading until then. A period that has shown a face keeps it for the page load: going
// back to Years, from Months to All and back, or a timeline made again (its filters cleared and set) shows the same
// faces at once, and nothing changes face under the reader's eyes. At most AT_ONCE questions are in flight over the
// page; a choice that takes longer than PATIENCE_MS shows the server's covers instead, and those stay.
import {
  AssetOrder,
  AssetTypeEnum,
  AssetVisibility,
  getAssetInfo,
  getAssetOcr,
  getTimeBucket,
  getTimeBucketCovers,
  searchAssets,
  type AssetResponseDto,
  type TimeBucketCoverResponseDto,
} from '@immich/sdk';
import { isTextHeavy } from '$lib/utils/folder-faces';
import {
  choosePeriodFaces,
  PeriodTier,
  periodVerdict,
  type CoverPick,
  type ListedPicture,
  type PeriodPicture,
  type PeriodRequest,
  type PeriodSources,
  type PeriodVerdict,
} from '$lib/utils/period-faces';

/** A timeline's covers request without its periods: its filters, its bucket size (year or month) and its order. */
export type PeriodScope = Omit<Parameters<typeof getTimeBucketCovers>[0], 'timeBuckets'>;

/** Questions to Gallery in flight at once, over every overview on the page. */
const AT_ONCE = 4;
/** A question not answered by then counts as failed. */
const QUESTION_MS = 8000;
/** The longest a tile waits for its face; then the server's cover shows, and stays. */
const PATIENCE_MS = 4000;
/** Periods one covers request names at most (each a few dozen characters of its address). */
const COVERS_AT_ONCE = 100;
/** Pictures one search asks about at most. */
const SEARCH_AT_ONCE = 50;

/** Whether the folder rule chooses this timeline's faces: not the Trash, the Archive, the Locked Folder or a shared
 * link's grid (which has no overviews), whose periods keep the server's covers. */
const chooses = (scope: PeriodScope) =>
  !scope.isTrashed &&
  (scope.visibility === undefined || scope.visibility === AssetVisibility.Timeline) &&
  !scope.key &&
  !scope.slug;

/** The tiers a timeline can show: one of videos has no photos, Favorites only favourites, non-favourites none. */
const tiersOf = (scope: PeriodScope): Set<PeriodTier> => {
  const tiers = new Set<PeriodTier>();
  if (scope.$type !== AssetTypeEnum.Video) {
    if (scope.isFavorite !== false) {
      tiers.add(PeriodTier.Favourite);
    }
    if (scope.isFavorite !== true) {
      tiers.add(PeriodTier.Photo);
    }
  }
  if (scope.$type !== AssetTypeEnum.Image) {
    tiers.add(PeriodTier.Video);
  }
  return tiers;
};

const scopeKey = (scope: PeriodScope) =>
  JSON.stringify(
    Object.entries(scope)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const pictureOf = (cover: TimeBucketCoverResponseDto): PeriodPicture | undefined =>
  cover.representativeAssetId
    ? { id: cover.representativeAssetId, thumbhash: cover.representativeThumbhash, ratio: cover.representativeRatio }
    : undefined;

export class PeriodFaceManager {
  /** the cover each period has shown, by its timeline and bucket, for the page load */
  #shown = new Map<string, TimeBucketCoverResponseDto>();
  /** what each picture is, asked once per page load (a year's face is often one of its months' too) */
  #verdicts = new Map<string, Promise<PeriodVerdict | undefined>>();
  #words = new Map<string, Promise<boolean>>();
  #running = 0;
  #waiting: Array<() => void> = [];

  /**
   * The covers of these periods: the face each has shown before, else its face by the folder rule, else (nothing
   * qualifies, or the choice took too long) the server's cover from `server`. Fails only when there is nothing to show
   * and the server's covers failed too, so the timeline asks again.
   */
  async covers(
    scope: PeriodScope,
    periods: PeriodRequest[],
    server: () => Promise<TimeBucketCoverResponseDto[]>,
  ): Promise<TimeBucketCoverResponseDto[]> {
    const key = scopeKey(scope);
    const keyOf = (timeBucket: string) => `${key}|${timeBucket}`;
    const covers: TimeBucketCoverResponseDto[] = [];
    const todo: PeriodRequest[] = [];
    for (const period of periods) {
      const shown = this.#shown.get(keyOf(period.timeBucket));
      if (shown) {
        covers.push(shown);
      } else {
        todo.push(period);
      }
    }
    if (todo.length === 0) {
      return covers;
    }

    const fallback = server();
    // read only once the choice is made: a failure meanwhile is no unhandled rejection
    void fallback.catch(() => undefined);
    let chosen: Map<string, PeriodPicture> | undefined;
    if (chooses(scope)) {
      let patience: ReturnType<typeof setTimeout> | undefined;
      chosen = await Promise.race([
        choosePeriodFaces(todo, this.#sources(scope), tiersOf(scope)).catch(() => undefined),
        new Promise<undefined>((resolve) => (patience = setTimeout(() => resolve(undefined), PATIENCE_MS))),
      ]);
      clearTimeout(patience);
    }
    const servers = new Map<string, TimeBucketCoverResponseDto>();
    try {
      for (const cover of await fallback) {
        servers.set(cover.timeBucket, cover);
      }
    } catch (error) {
      if (!chosen || chosen.size === 0) {
        throw error;
      }
    }
    for (const { timeBucket } of todo) {
      const face = chosen?.get(timeBucket);
      const cover = face
        ? {
            timeBucket,
            representativeAssetId: face.id,
            representativeThumbhash: face.thumbhash,
            representativeRatio: face.ratio,
          }
        : servers.get(timeBucket);
      if (!cover) {
        continue;
      }
      this.#shown.set(keyOf(timeBucket), cover);
      covers.push(cover);
    }
    return covers;
  }

  #sources(scope: PeriodScope): PeriodSources {
    return {
      covers: async (timeBuckets, pick) => {
        const found = new Map<string, PeriodPicture>();
        const answers = await Promise.all(
          chunks(timeBuckets, COVERS_AT_ONCE).map((part) =>
            this.#limited((signal) =>
              getTimeBucketCovers({ ...scope, ...coverFilter(pick), timeBuckets: part }, { signal }),
            ),
          ),
        );
        for (const cover of answers.flat()) {
          const picture = pictureOf(cover);
          if (picture) {
            found.set(cover.timeBucket, picture);
          }
        }
        return found;
      },
      verdicts: (ids) => this.#tell(ids, scope),
      textHeavy: (id) =>
        this.#once(this.#words, id, () => this.#limited((signal) => getAssetOcr({ id }, { signal }).then(isTextHeavy))),
      list: async (timeBucket, favourites) => {
        const bucket = await this.#limited((signal) =>
          getTimeBucket(
            {
              ...scope,
              $type: scope.$type ?? AssetTypeEnum.Image,
              ...(favourites && { isFavorite: true }),
              timeBucket,
            },
            { signal },
          ),
        );
        const pictures: ListedPicture[] = bucket.id.map((id, index) => ({
          id,
          thumbhash: bucket.thumbhash[index] ?? null,
          ratio: bucket.ratio[index] ?? null,
          isFavorite: bucket.isFavorite[index] ?? false,
          isImage: bucket.isImage[index] ?? false,
          live: (bucket.livePhotoVideoId[index] ?? null) !== null,
        }));
        // newest first, whichever way the timeline runs (reversed on a copy: a TV's browser may lack toReversed)
        return scope.order === AssetOrder.Asc ? [...pictures].reverse() : pictures;
      },
    };
  }

  /** What these pictures are: one search for those with a camera's data, one for the rest, then the photo's details
   * for any the searches do not reach (another account's photo in an album shared with me). Kept per picture. */
  async #tell(ids: string[], scope: PeriodScope): Promise<Map<string, PeriodVerdict>> {
    const missing = ids.filter((id) => !this.#verdicts.has(id));
    for (const part of chunks(missing, SEARCH_AT_ONCE)) {
      const batch = this.#search(part, scope);
      for (const id of part) {
        const verdict = batch.then((told) => told.get(id));
        this.#verdicts.set(id, verdict);
      }
      // a batch that failed is asked again the next time
      void batch.catch(() => {
        for (const id of part) {
          this.#verdicts.delete(id);
        }
      });
    }
    const told = new Map<string, PeriodVerdict>();
    for (const id of ids) {
      const verdict = await this.#verdicts.get(id)?.catch(() => undefined);
      if (verdict) {
        told.set(id, verdict);
      }
    }
    return told;
  }

  async #search(ids: string[], scope: PeriodScope): Promise<Map<string, PeriodVerdict>> {
    const told = new Map<string, PeriodVerdict>();
    // the search reaches what the timeline does: an album's photos through the album, the rest through my own, my
    // partners' and the Spaces on my timeline (a Space's own page, which may not be on it, falls to the details below)
    const album = scope.albumId ? { albumIds: { any: [scope.albumId] } } : {};
    const find = (part: string[], camera: boolean) =>
      this.#limited((signal) =>
        searchAssets(
          {
            metadataSearchDto: {
              ...(!scope.albumId && { withSharedSpaces: true }),
              filter: {
                ...album,
                or: part.map((id) => ({ id: { eq: id } })),
                ...(camera && { make: { ne: null } }),
              },
              size: part.length,
            },
          },
          { signal },
        ).then(({ assets }) => assets.items),
      );
    const record = (pictures: AssetResponseDto[], camera?: boolean) => {
      for (const picture of pictures) {
        told.set(picture.id, periodVerdict(picture, camera));
      }
    };
    record(await find(ids, true), true);
    const rest = ids.filter((id) => !told.has(id));
    if (rest.length > 0) {
      record(await find(rest, false), false);
    }
    const unreached = ids.filter((id) => !told.has(id));
    const details = await Promise.all(
      unreached.map((id) =>
        this.#limited((signal) => getAssetInfo({ id, spaceId: scope.spaceId }, { signal })).catch(() => undefined),
      ),
    );
    record(details.filter((picture): picture is AssetResponseDto => !!picture));
    return told;
  }

  #once<T>(answers: Map<string, Promise<T>>, key: string, ask: () => Promise<T>) {
    let answer = answers.get(key);
    if (!answer) {
      answer = ask();
      answers.set(key, answer);
      void answer.catch(() => answers.delete(key));
    }
    return answer;
  }

  /** Runs `ask` once fewer than AT_ONCE are in flight, giving up on it after QUESTION_MS. */
  async #limited<T>(ask: (signal: AbortSignal) => Promise<T>) {
    if (this.#running < AT_ONCE) {
      this.#running++;
    } else {
      await new Promise<void>((resolve) => {
        this.#waiting.push(resolve);
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUESTION_MS);
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

/** A covers request's own filters for a tier and an order: a period's newest or oldest favourite photo, photo or video. */
const coverFilter = ({ tier, order }: CoverPick) => ({
  order,
  $type: tier === PeriodTier.Video ? AssetTypeEnum.Video : AssetTypeEnum.Image,
  ...(tier === PeriodTier.Favourite && { isFavorite: true }),
});

export const periodFaces = new PeriodFaceManager();
