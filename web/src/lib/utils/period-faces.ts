// Local Omarchy layer: which photo fronts a year or a month in the Years and Months overviews (DESIGN.md, Years and
// Months overviews; managers/period-faces asks Gallery). The server's cover is a period's newest asset, whatever it is:
// screenshots and pictures sent through chat apps fronted months, a video fronted 2021, a nearly black frame October
// 2013 (critique 2026-10-23). The owner's decision: "Best photo, by the folder rule" (utils/folder-faces): favourites
// first, photos with a camera's data, never slips, receipts, screenshots, documents or pages of words, videos only where
// there is nothing else, and the server's cover where nothing qualifies. Among equals, a photo that is not dim
// (utils/thumbhash-light) before one that is, then the newer.
//
// Every candidate comes from the period's own timeline (its covers and its list, with the timeline's own filters), so a
// face is always a photo that timeline shows: a photo hidden from Photos by its album, or a stack's other photos, never
// fronts a year. A period is asked about in rounds, each round one request for all the periods it is about: the
// newest favourite photo and the newest photo of every period; then, where those leave room for better, the oldest of
// each; then, for a period where neither end of it qualifies, its list of photos; then its newest video.
import { AssetOrder } from '@immich/sdk';
import { FaceKind, faceKind, type FacePicture } from '$lib/utils/folder-faces';
import { isDim } from '$lib/utils/thumbhash-light';

/** A picture that could front a period, as a covers request or a period's list gives it. */
export type PeriodPicture = { id: string; thumbhash: string | null; ratio: number | null };

/** Where a candidate was found: the period's favourite photos, its photos, its videos (the order they rank in). */
export enum PeriodTier {
  Favourite = 0,
  Photo = 1,
  Video = 2,
}

export type PeriodCandidate = PeriodPicture & { tier: PeriodTier; order: number };

/** A picture as a period's list has it (the timeline's own bucket), newest first. */
export type ListedPicture = PeriodPicture & { isFavorite: boolean; isImage: boolean; live: boolean };

/** What one covers request asks for: each period's newest (or oldest) favourite photo, photo or video. */
export type CoverPick = { tier: PeriodTier; order: AssetOrder };

/** What Gallery says of a candidate: its kind (folder-faces' kinds) and, for a picture without a camera's data, whether
 * its recognised text makes it a page of words (undefined until asked). */
export type PeriodVerdict = { kind: FaceKind; textHeavy?: boolean };

/** Where a period's faces are read from (managers/period-faces: the timeline's covers and buckets, Gallery's search). */
export type PeriodSources = {
  /** each period's newest or oldest picture of a tier, for all the periods at once; a period without one is left out */
  covers: (timeBuckets: string[], pick: CoverPick) => Promise<Map<string, PeriodPicture>>;
  /** what these pictures are, asked together; a picture Gallery cannot tell of is left out (never a face) */
  verdicts: (pictures: string[]) => Promise<Map<string, PeriodVerdict>>;
  /** whether a picture holds a page of words (isTextHeavy over its recognised text) */
  textHeavy: (picture: string) => Promise<boolean>;
  /** a period's images as its timeline lists them, newest first: its favourites alone, or all of them */
  list: (timeBucket: string, favourites: boolean) => Promise<ListedPicture[]>;
};

/** A period to choose a face for: its bucket and how many photos it holds (a large one's list is not read). */
export type PeriodRequest = { timeBucket: string; count: number };

/** A period's list is read only while it holds at most this many (a month of 300 photos is about 80 KB of bucket). */
export const LIST_MOST = 300;
/** Of a list, the pictures asked about at most, the likeliest first. */
export const LIST_ASKED = 8;

const ORDER_NEWEST = 0;
const ORDER_OLDEST = 1;
const ORDER_LISTED = 2;

/** How a candidate ranks, lower first: its tier, a camera's photo before a plain picture, a bright one before a dim one,
 * then the order it was found in. Undefined: never a period's face (a screenshot, a document, a page of words). */
export const periodRank = (candidate: PeriodCandidate, verdict: PeriodVerdict | undefined): number[] | undefined => {
  if (!verdict) {
    return undefined;
  }
  const dim = isDim(candidate.thumbhash) ? 1 : 0;
  switch (verdict.kind) {
    case FaceKind.Photo: {
      return candidate.tier === PeriodTier.Video ? undefined : [candidate.tier, 0, dim, candidate.order];
    }
    case FaceKind.Plain: {
      return candidate.tier === PeriodTier.Video || verdict.textHeavy === true
        ? undefined
        : [candidate.tier, 1, dim, candidate.order];
    }
    case FaceKind.Video: {
      return [PeriodTier.Video, 0, dim, candidate.order];
    }
    default: {
      return undefined;
    }
  }
};

const compare = (a: number[], b: number[]) => {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

/** The best of a period's candidates so far, with its rank; undefined while none can front it. */
export const bestCandidate = (
  candidates: PeriodCandidate[],
  verdicts: Map<string, PeriodVerdict>,
): { candidate: PeriodCandidate; rank: number[] } | undefined => {
  let best: { candidate: PeriodCandidate; rank: number[] } | undefined;
  for (const candidate of candidates) {
    const rank = periodRank(candidate, verdicts.get(candidate.id));
    if (rank && (!best || compare(rank, best.rank) < 0)) {
      best = { candidate, rank };
    }
  }
  return best;
};

/** The likeliest faces in a period's list first: its favourites, then Live Photos (a camera took them), then pictures
 * of a photo's shape (a phone's screen is taller than 1.9:1), the bright before the dim, else as listed. */
export const listOrder = (pictures: ListedPicture[]): ListedPicture[] => {
  const score = (picture: ListedPicture) => [
    picture.isFavorite ? 0 : 1,
    picture.live ? 0 : 1,
    picture.ratio && picture.ratio < 1 / 1.9 ? 1 : 0,
    isDim(picture.thumbhash) ? 1 : 0,
  ];
  return pictures
    .map((picture, index) => ({ picture, index, score: score(picture) }))
    .filter(({ picture }) => picture.isImage)
    .sort((a, b) => compare(a.score, b.score) || a.index - b.index)
    .map(({ picture }) => picture);
};

/**
 * Each period's face, by the folder rule (above): the picture, or nothing where nothing qualifies (the caller shows the
 * server's cover there). `tiers` are those the timeline can show (a timeline of videos has only videos; Favorites only
 * favourites). Each round asks only about the periods it could still improve, and a picture is asked about only where
 * it could front its period; a question that fails leaves its answer out, as if Gallery had none.
 */
export const choosePeriodFaces = async (
  periods: PeriodRequest[],
  sources: PeriodSources,
  tiers: ReadonlySet<PeriodTier> = new Set([PeriodTier.Favourite, PeriodTier.Photo, PeriodTier.Video]),
): Promise<Map<string, PeriodPicture>> => {
  const candidates = new Map<string, PeriodCandidate[]>(periods.map(({ timeBucket }) => [timeBucket, []]));
  const verdicts = new Map<string, PeriodVerdict>();
  const all = periods.map(({ timeBucket }) => timeBucket);
  const best = (timeBucket: string) => bestCandidate(candidates.get(timeBucket) ?? [], verdicts);
  // whether a find that ranks `potential` would improve on what a period has
  const improvable = (timeBucket: string, potential: number[]) => {
    const found = best(timeBucket);
    return !found || compare(potential, found.rank) < 0;
  };
  const has = (timeBucket: string, tier: PeriodTier) =>
    (candidates.get(timeBucket) ?? []).some((candidate) => candidate.tier === tier);
  const add = (timeBucket: string, picture: PeriodPicture, tier: PeriodTier, order: number) => {
    const list = candidates.get(timeBucket);
    if (list?.every(({ id }) => id !== picture.id)) {
      list.push({ ...picture, tier, order });
    }
  };

  const ask = async (picks: { pick: CoverPick; timeBuckets: string[] }[], order: number) => {
    const asked = picks.filter(({ timeBuckets }) => timeBuckets.length > 0);
    const found = await Promise.all(
      asked.map(({ pick, timeBuckets }) =>
        sources.covers(timeBuckets, pick).catch(() => new Map<string, PeriodPicture>()),
      ),
    );
    for (const [index, { pick }] of asked.entries()) {
      for (const [timeBucket, picture] of found[index]) {
        add(timeBucket, picture, pick.tier, order);
      }
    }
  };

  // what the candidates of these periods that could still front them are (those of a tier, or all)
  const classify = async (timeBuckets: string[], tier?: PeriodTier) => {
    const unknown = [
      ...new Set(
        timeBuckets.flatMap((timeBucket) =>
          (candidates.get(timeBucket) ?? [])
            .filter((candidate) => (tier === undefined || candidate.tier === tier) && !verdicts.has(candidate.id))
            .map(({ id }) => id),
        ),
      ),
    ];
    if (unknown.length > 0) {
      const told = await sources.verdicts(unknown).catch(() => new Map<string, PeriodVerdict>());
      for (const id of unknown) {
        // a picture Gallery could not tell of is never a face
        verdicts.set(id, told.get(id) ?? { kind: FaceKind.Not });
      }
    }
  };

  // a plain picture leading its period is asked about its words; one that is a page of words gives way, and the plain
  // picture after it, if it leads then, is asked in turn. Asked only before a round that depends on whether a period
  // has a face at all, and at the end, so a plain picture a camera's photo overtakes is never asked about
  const settleWords = async () => {
    for (;;) {
      const asked = [
        ...new Set(
          all
            .map((timeBucket) => best(timeBucket)?.candidate.id)
            .filter((id): id is string => {
              const verdict = id === undefined ? undefined : verdicts.get(id);
              return verdict?.kind === FaceKind.Plain && verdict.textHeavy === undefined;
            }),
        ),
      ];
      if (asked.length === 0) {
        return;
      }
      // a question that failed counts as a page of words: an unchecked picture never fronts a period
      const heavy = await Promise.all(asked.map((id) => sources.textHeavy(id).catch(() => true)));
      for (const [index, id] of asked.entries()) {
        verdicts.set(id, { ...verdicts.get(id)!, textHeavy: heavy[index] });
      }
    }
  };

  // the likeliest pictures of these periods' lists (their favourites alone, or all their photos), asked about together
  const listRound = async (listed: PeriodRequest[], favourites: boolean) => {
    if (listed.length === 0) {
      return;
    }
    const lists = await Promise.all(
      listed.map(({ timeBucket }) => sources.list(timeBucket, favourites).catch((): ListedPicture[] => [])),
    );
    for (const [index, { timeBucket }] of listed.entries()) {
      const known = new Set((candidates.get(timeBucket) ?? []).map(({ id }) => id));
      const likeliest = listOrder(lists[index])
        .filter(({ id }) => !known.has(id))
        .slice(0, LIST_ASKED);
      for (const [rank, picture] of likeliest.entries()) {
        const tier = picture.isFavorite && tiers.has(PeriodTier.Favourite) ? PeriodTier.Favourite : PeriodTier.Photo;
        if (tiers.has(tier)) {
          add(timeBucket, picture, tier, ORDER_LISTED + rank);
        }
      }
    }
    await classify(listed.map(({ timeBucket }) => timeBucket));
    await settleWords();
  };

  const photoTiers = [PeriodTier.Favourite, PeriodTier.Photo].filter((tier) => tiers.has(tier));
  if (photoTiers.length > 0) {
    // the newest favourite photo and the newest photo of every period, asked together; the favourites told of first,
    // then the photos of the periods no favourite fronts
    await ask(
      photoTiers.map((tier) => ({ pick: { tier, order: AssetOrder.Desc }, timeBuckets: all })),
      ORDER_NEWEST,
    );
    for (const tier of photoTiers) {
      await classify(
        all.filter((timeBucket) => improvable(timeBucket, [tier, 0, 0, ORDER_NEWEST])),
        tier,
      );
    }

    // the oldest of each kind a period has, where a bright camera photo of it would improve on what it has
    const older = photoTiers.map((tier) => ({
      pick: { tier, order: AssetOrder.Asc },
      timeBuckets: all.filter(
        (timeBucket) => has(timeBucket, tier) && improvable(timeBucket, [tier, 0, 0, ORDER_OLDEST]),
      ),
    }));
    if (older.some(({ timeBuckets }) => timeBuckets.length > 0)) {
      await ask(older, ORDER_OLDEST);
      await classify(older.flatMap(({ timeBuckets }) => timeBuckets));
    }
    await settleWords();
    // a period whose plain favourite turned out a page of words: the photos it had passed over
    const lost = all.filter((timeBucket) => !best(timeBucket));
    await classify(lost);
    await settleWords();

    // a period whose favourites gave no bright camera photo at either end: its favourites (a short list), the likeliest
    // of them; then a period where nothing qualified at all, small enough to list: the likeliest of its photos
    if (tiers.has(PeriodTier.Favourite)) {
      await listRound(
        periods.filter(
          ({ timeBucket }) =>
            has(timeBucket, PeriodTier.Favourite) && improvable(timeBucket, [PeriodTier.Favourite, 0, 0, ORDER_LISTED]),
        ),
        true,
      );
    }
    await listRound(
      periods.filter(({ timeBucket, count }) => count <= LIST_MOST && !best(timeBucket)),
      false,
    );
  }

  // videos only where there is nothing else
  if (tiers.has(PeriodTier.Video)) {
    const bare = all.filter((timeBucket) => !best(timeBucket));
    if (bare.length > 0) {
      await ask([{ pick: { tier: PeriodTier.Video, order: AssetOrder.Desc }, timeBuckets: bare }], ORDER_NEWEST);
      await classify(bare, PeriodTier.Video);
    }
  }
  await settleWords();

  const faces = new Map<string, PeriodPicture>();
  for (const timeBucket of all) {
    const found = best(timeBucket)?.candidate;
    if (found) {
      faces.set(timeBucket, { id: found.id, thumbhash: found.thumbhash, ratio: found.ratio });
    }
  }
  return faces;
};

/** What a picture is as a period's face: folder-faces' kind, read as `camera` says (a search that finds only pictures
 * with a camera make knows that without their EXIF). */
export const periodVerdict = (picture: FacePicture, camera?: boolean): PeriodVerdict => ({
  kind: faceKind(picture, camera),
});
