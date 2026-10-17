import {
  AssetMediaSize,
  getAllAlbums,
  getAssetInfo,
  type AlbumResponseDto,
  type AssetResponseDto,
  type ExifResponseDto,
  type PersonResponseDto,
} from '@immich/sdk';
import { DateTime } from 'luxon';
import { getAssetMediaUrl } from '$lib/utils';
import { getByteUnitString } from '$lib/utils/byte-units';
import { curator, type Story } from '$lib/utils/curator';
import { fromISODateTime, fromISODateTimeUTC } from '$lib/utils/timeline-util';

// Local Omarchy layer: what the inspector window (Inspector.svelte) asks Gallery and Curator about the photo a main
// window points at, and how it says it. A sweep over the grid reaches the inspector only as the photos the pointer
// rested on (managers/inspector-link), and even those must not pile up requests: a newer photo cancels the requests
// for the one before, and the last photos shown are kept, so going back over them asks nothing again.

export type InspectorDetails = { asset: AssetResponseDto; albums: AlbumResponseDto[] };

/** how many photos' details are kept */
export const DETAILS_KEPT = 40;

type DetailsFetchers = {
  asset: (id: string, signal: AbortSignal) => Promise<AssetResponseDto>;
  albums: (id: string, signal: AbortSignal) => Promise<AlbumResponseDto[]>;
};

const gallery: DetailsFetchers = {
  asset: (id, signal) => getAssetInfo({ id }, { signal }),
  albums: (id, signal) => getAllAlbums({ assetId: id }, { signal }),
};

export class InspectorDetailsLoader {
  #kept = new Map<string, InspectorDetails>();
  #controller?: AbortController;

  constructor(
    private fetchers: DetailsFetchers = gallery,
    private size = DETAILS_KEPT,
  ) {}

  /** The details of one photo; undefined when a newer load took over first (its requests are cancelled). */
  async load(id: string): Promise<InspectorDetails | undefined> {
    this.cancel();
    const kept = this.#kept.get(id);
    if (kept) {
      this.#keep(id, kept);
      return kept;
    }
    const controller = new AbortController();
    this.#controller = controller;
    try {
      const [asset, albums] = await Promise.all([
        this.fetchers.asset(id, controller.signal),
        // the albums are a part of the details, not a reason to show none
        this.fetchers.albums(id, controller.signal).catch(() => [] as AlbumResponseDto[]),
      ]);
      if (controller.signal.aborted) {
        return undefined;
      }
      const details = { asset, albums };
      this.#keep(id, details);
      return details;
    } catch (error) {
      if (controller.signal.aborted) {
        return undefined;
      }
      throw error;
    } finally {
      if (this.#controller === controller) {
        this.#controller = undefined;
      }
    }
  }

  /** Stop asking for the photo being loaded (the pointer went back to the one on screen). */
  cancel() {
    this.#controller?.abort();
    this.#controller = undefined;
  }

  #keep(id: string, details: InspectorDetails) {
    // a Map keeps the order things went in: the first is the one used longest ago
    this.#kept.delete(id);
    this.#kept.set(id, details);
    while (this.#kept.size > this.size) {
      this.#kept.delete(this.#kept.keys().next().value!);
    }
  }
}

/** how many of a photo's albums are asked for a story */
export const STORY_ALBUMS = 4;

/**
 * Curator's story of the trip or event a photo belongs to, by the albums it is in (Curator tells an album's story by
 * the event its photos come from); each album is asked once a page load, its answer kept, a refusal kept as none.
 * Curator acts for its owner only: the caller asks curatorIsMine() first.
 */
export class InspectorStories {
  #byAlbum = new Map<string, Promise<Story | null>>();

  constructor(
    private ask: (albumId: string) => Promise<Story | null> = (albumId) =>
      curator
        .story({ album: albumId })
        .then((answer) => answer.story)
        .catch(() => null),
  ) {}

  /** The first of the photo's albums that has a story, with the album. */
  async first(albums: AlbumResponseDto[]): Promise<{ album: AlbumResponseDto; story: Story } | null> {
    const asked = albums.slice(0, STORY_ALBUMS);
    const stories = await Promise.all(asked.map((album) => this.#story(album.id)));
    const at = stories.findIndex(Boolean);
    return at === -1 ? null : { album: asked[at], story: stories[at]! };
  }

  #story(albumId: string) {
    let story = this.#byAlbum.get(albumId);
    if (!story) {
      story = this.ask(albumId);
      this.#byAlbum.set(albumId, story);
    }
    return story;
  }
}

/** A description Curator wrote ends in its mark (curator/actions_describe.py, AI_MARK). */
const AI_MARK = /\s*\(AI\)$/;

/** The photo's description, and whether Curator wrote it (an accepted caption): its words without the mark. */
export const descriptionOf = (asset: AssetResponseDto) => {
  const text = asset.exifInfo?.description?.trim() ?? '';
  return AI_MARK.test(text) ? { text: text.replace(AI_MARK, ''), byCurator: true } : { text, byCurator: false };
};

/** Gallery's preview of the photo (never the original), under the cache key the tiles and the viewer use too. */
export const previewUrlOf = (id: string, thumbhash: string | null) =>
  getAssetMediaUrl({ id, size: AssetMediaSize.Preview, cacheKey: thumbhash });

export type TakenParts = { day: Intl.DateTimeFormatPart[]; time: string };

/**
 * When the photo was taken, as the Info panel says it (DetailPanelDate): the camera's own clock in its own time zone
 * where the photo carries one, else the local time the server worked out for it. `day` is the date in the reader's
 * order as parts (so the year can be set apart), `time` the weekday and time, with the zone when there is one.
 */
export const takenOf = (
  asset: Pick<AssetResponseDto, 'exifInfo' | 'localDateTime'>,
  locale?: string,
): TakenParts | undefined => {
  const timeZone = asset.exifInfo?.timeZone ?? undefined;
  const original = asset.exifInfo?.dateTimeOriginal;
  const dateTime =
    timeZone && original
      ? fromISODateTime(original, timeZone)
      : asset.localDateTime
        ? fromISODateTimeUTC(asset.localDateTime)
        : undefined;
  if (!dateTime?.isValid) {
    return undefined;
  }
  const local = locale ? dateTime.setLocale(locale) : dateTime;
  return {
    day: local.toLocaleParts({ day: 'numeric', month: 'long', year: 'numeric' }),
    time: local.toLocaleString({
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: timeZone ? 'longOffset' : undefined,
    }),
  };
};

/** City, state and country, a state that repeats the city once. */
export const placeOf = (exif: ExifResponseDto | undefined) => {
  const parts = [exif?.city, exif?.state, exif?.country].map((part) => part?.trim()).filter(Boolean) as string[];
  return parts.filter((part, at) => parts.indexOf(part) === at).join(', ');
};

/** The camera, its maker named once ("Canon EOS 5D", never "Canon Canon EOS 5D"). */
export const cameraOf = (exif: ExifResponseDto | undefined) => {
  const make = exif?.make?.trim() ?? '';
  const model = exif?.model?.trim() ?? '';
  const brand = make.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
  if (!model) {
    return make;
  }
  return brand && model.toLowerCase().startsWith(brand) ? model : [make, model].filter(Boolean).join(' ');
};

/** Aperture, shutter, ISO and focal length, as the Info panel writes them. */
export const exposureOf = (exif: ExifResponseDto | undefined, locale?: string) =>
  [
    exif?.fNumber ? `ƒ/${exif.fNumber.toLocaleString(locale)}` : '',
    exif?.exposureTime ? `${exif.exposureTime} s` : '',
    exif?.iso ? `ISO ${exif.iso}` : '',
    exif?.focalLength ? `${exif.focalLength.toLocaleString(locale)} mm` : '',
  ].filter(Boolean);

/** Megapixels, pixels and the file's size. */
export const fileFactsOf = (asset: AssetResponseDto, locale?: string) => {
  const width = asset.width ?? asset.exifInfo?.exifImageWidth ?? 0;
  const height = asset.height ?? asset.exifInfo?.exifImageHeight ?? 0;
  const megapixels = Math.round((width * height) / 1_000_000);
  const bytes = asset.exifInfo?.fileSizeInByte;
  return [
    megapixels ? `${megapixels.toLocaleString(locale)} MP` : '',
    width && height ? `${width} × ${height}` : '',
    bytes ? getByteUnitString(bytes, locale) : '',
  ].filter(Boolean);
};

/** The years an album's photos span ("2019", "2019–2021"), from its first and last photo. */
export const albumYearsOf = (album: Pick<AlbumResponseDto, 'startDate' | 'endDate'>) => {
  const year = (date?: string) => (date ? DateTime.fromISO(date, { zone: 'utc' }).year : undefined);
  const start = year(album.startDate);
  const end = year(album.endDate);
  if (!start || !end) {
    return start || end ? String(start ?? end) : '';
  }
  return start === end ? String(start) : `${Math.min(start, end)}–${Math.max(start, end)}`;
};

/** The people in the photo with a name, and how many more have none (the hidden left out, as the Info panel does). */
export const peopleOf = (asset: AssetResponseDto): { named: PersonResponseDto[]; unnamed: number } => {
  const people = (asset.people ?? []).filter((person) => !person.isHidden);
  const named = people.filter((person) => person.name.trim());
  return { named, unnamed: people.length - named.length };
};
