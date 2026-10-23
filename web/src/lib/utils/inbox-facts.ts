import { AssetTypeEnum, AssetVisibility, getAssetInfo, type AssetResponseDto } from '@immich/sdk';
import type { MessageFormatter } from 'svelte-i18n';
import { SvelteMap } from 'svelte/reactivity';
import type { Suggestion } from '$lib/utils/curator';
import { formatDuration } from '$lib/utils/duration';
import { dayLabel } from '$lib/utils/timeline-dates';
import type { TimelineDate } from '$lib/utils/timeline-util';

// Local Omarchy layer: an AI inbox card about one photo or clip, by when and where (DESIGN.md, AI inbox; the owner's
// "Inbox cards by when and where", 2026-10-23). Curator heads such a card with the file's name ("IMG_5398.MOV",
// "IMG_1253, restored"), which tells the owner nothing about which moment it is. Gallery's own asset says it: the day
// it was taken on its own clock (the timeline's day) and where (the city, else the country), how long a clip runs,
// whether it is a Live Photo or the video of one (Gallery's livePhotoVideoId pairing, which hides that video), the
// stack it lies in, and whether it waits in the Trash or the Archive already. A card titled by its file is headed by
// when and where, the file's name moving to the muted line under it; a card whose title says something else (a
// caption to give it) keeps its title, with when and where on that line. The cards carry the asset ids, so Gallery is
// asked only for the cards on screen or near it, a few at a time, each photo once while the page is open; until a
// card's facts arrive it keeps Curator's heading, its line reserved. Read-only.

/** What Gallery knows of a card's photo or clip, as far as the card says it. */
export type InboxFacts = {
  /** the day it was taken on its own clock: its day in the timeline */
  day: TimelineDate | null;
  /** the city, else the country */
  place: string | null;
  /** a clip's length, in milliseconds */
  duration: number | null;
  /** a Live Photo's still, or the video Gallery keeps with one */
  live: 'photo' | 'video' | null;
  /** how many photos the stack it lies in holds */
  stack: number | null;
  /** where it is when not on the timeline */
  state: 'trashed' | 'archived' | null;
  fileName: string;
};

/**
 * The one photo or clip a card is about, where it is about one: a change to a photo (Curator's asset.* kinds, filing a
 * slip in QR) or a new version of one (restore.publish: a restored copy, an animation of its burst, a Live Photo
 * effect), never a collage of an event's photos. A card about people, albums, tags or many photos has none.
 */
export const photoSubject = ({
  kind,
  asset_ids,
  payload,
}: Pick<Suggestion, 'kind' | 'asset_ids' | 'payload'>): string | undefined => {
  const named = typeof payload?.asset_id === 'string' && payload.asset_id ? payload.asset_id : undefined;
  if (kind === 'restore.publish') {
    return payload?.variant === 'collage' ? undefined : named;
  }
  if (kind.startsWith('asset.') || kind === 'qr.file') {
    const ids = [...new Set(asset_ids)];
    return named ?? (ids.length === 1 ? ids[0] : undefined);
  }
  return undefined;
};

/** The facts a card says, from Gallery's asset. */
export const factsOf = (asset: AssetResponseDto): InboxFacts => {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(asset.localDateTime ?? '');
  const isVideo = asset.type === AssetTypeEnum.Video;
  const live = isVideo
    ? asset.visibility === AssetVisibility.Hidden
      ? 'video'
      : null
    : asset.livePhotoVideoId
      ? 'photo'
      : null;
  return {
    day: day ? { year: Number(day[1]), month: Number(day[2]), day: Number(day[3]) } : null,
    place: asset.exifInfo?.city?.trim() || asset.exifInfo?.country?.trim() || null,
    duration: isVideo && asset.duration && asset.duration > 0 ? asset.duration : null,
    live,
    stack: asset.stack && asset.stack.assetCount > 1 ? asset.stack.assetCount : null,
    state: asset.isTrashed ? 'trashed' : asset.visibility === AssetVisibility.Archive ? 'archived' : null,
    fileName: asset.originalFileName,
  };
};

/** a file's extension, as Curator takes it off for a title ("IMG_1253, restored") */
const EXTENSION = /\.[A-Za-z0-9]{2,5}$/;
const WORD = /[\p{L}\p{N}_]/u;

/**
 * Whether a card's title is its file's name: the name or its stem, then nothing or anything but a letter or a digit
 * ("IMG_5398.MOV", "IMG_1253, restored", "2024-03-02 10.15.00.jpg → 2 Mar 2024 10:15"; never "Burst of 4, 2 Mar
 * 2019" or a caption).
 */
export const namesFile = (title: string, fileName: string): boolean => {
  const words = title.trim().toLocaleLowerCase();
  return [fileName, fileName.replace(EXTENSION, '')].some((name) => {
    const start = name.trim().toLocaleLowerCase();
    return start.length > 0 && words.startsWith(start) && !WORD.test(words.charAt(start.length));
  });
};

/** between two facts, as on every line of the app that lists them */
const SEPARATOR = ' · ';

const tenths = new Map<string, Intl.NumberFormat>();
/** one decimal in the app's date locale ('default', and anything Intl refuses, the browser's own), kept per locale */
const tenthsFor = (locale: string | undefined) => {
  const key = locale ?? '';
  let format = tenths.get(key);
  if (!format) {
    const options = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
    try {
      format = new Intl.NumberFormat(!locale || locale === 'default' ? undefined : locale, options);
    } catch {
      format = new Intl.NumberFormat(undefined, options);
    }
    tenths.set(key, format);
  }
  return format;
};

/**
 * How long a clip runs: a clip under two seconds in tenths ("0.1 s", as Curator's "A 0.1 s clip." says it), any
 * other as every duration reads (utils/duration: "0:18", "1:02:03").
 */
export const clipLength = (milliseconds: number | null, t: MessageFormatter, locale?: string): string => {
  if (!milliseconds || milliseconds <= 0) {
    return '';
  }
  if (milliseconds < 2000) {
    const seconds = tenthsFor(locale).format(Math.round(milliseconds / 100) / 10);
    return t('ai_inbox_card_seconds', { values: { seconds } });
  }
  return formatDuration(milliseconds / 1000);
};

/** A card's heading and the muted line under it. */
export type CardWords = {
  heading: string;
  /** what the heading does not say; empty while the facts are on their way, or where there are none */
  line: string;
  /** whether the heading is when and where (the card's title was its file's name) */
  byFacts: boolean;
};

/**
 * A card's words: by when and where, "Oct 11, 2019 · Riverton · 0.1 s" over "IMG_5398.MOV · In a stack of 3", where
 * Curator titled it by its file; Curator's title over when and where, where its title says something of its own; the
 * title alone until the facts are in, or where they could not be had.
 */
export const cardWords = (
  title: string,
  facts: InboxFacts | null | undefined,
  t: MessageFormatter,
  locale?: string,
): CardWords => {
  if (!facts) {
    return { heading: title, line: '', byFacts: false };
  }
  const when = [facts.day ? dayLabel(facts.day, locale) : '', facts.place ?? '', clipLength(facts.duration, t, locale)];
  const about = [
    facts.live === 'photo'
      ? t('ai_inbox_card_live_photo')
      : facts.live === 'video'
        ? t('ai_inbox_card_live_video')
        : '',
    facts.stack ? t('ai_inbox_card_stack', { values: { count: facts.stack } }) : '',
    facts.state === 'trashed'
      ? t('ai_inbox_card_trashed')
      : facts.state === 'archived'
        ? t('ai_inbox_card_archived')
        : '',
  ];
  const join = (parts: string[]) => parts.filter(Boolean).join(SEPARATOR);
  if (facts.day && namesFile(title, facts.fileName)) {
    return { heading: join(when), line: join([facts.fileName, ...about]), byFacts: true };
  }
  return { heading: title, line: join([...when, ...about]), byFacts: false };
};

/** photos asked about at once */
export const FACTS_AT_ONCE = 4;
/** a question not answered by then counts as failed: the card keeps Curator's heading */
const QUESTION_MS = 8000;

type FetchAsset = (id: string, signal: AbortSignal) => Promise<AssetResponseDto>;

const gallery: FetchAsset = (id, signal) => getAssetInfo({ id }, { signal });

/**
 * The facts of the cards' photos, for one page: each photo asked once, a few at a time in the order the cards came
 * near the screen, kept until the page goes (`close`, which also cancels what is still on its way).
 */
export class InboxFactsLoader {
  // null: Gallery could not say (the photo is gone, or the question failed)
  #facts = new SvelteMap<string, InboxFacts | null>();
  #asked = new Set<string>();
  #queue: string[] = [];
  #running = 0;
  #controllers = new Set<AbortController>();
  #closed = false;

  constructor(private fetchAsset: FetchAsset = gallery) {}

  /** A photo's facts once in; undefined while they are on their way (or not asked for), null where none came. */
  get(id: string): InboxFacts | null | undefined {
    return this.#facts.get(id);
  }

  /** Ask for these photos' facts: once each, a few at a time. */
  request(...ids: (string | undefined)[]) {
    if (this.#closed) {
      return;
    }
    for (const id of ids) {
      if (!id || this.#asked.has(id)) {
        continue;
      }
      this.#asked.add(id);
      this.#queue.push(id);
    }
    this.#pump();
  }

  /** The page went: nothing more is asked, and what is on its way is cancelled. */
  close() {
    this.#closed = true;
    this.#queue = [];
    for (const controller of this.#controllers) {
      controller.abort();
    }
    this.#controllers.clear();
  }

  #pump() {
    while (this.#running < FACTS_AT_ONCE && this.#queue.length > 0) {
      const id = this.#queue.shift()!;
      this.#running++;
      void this.#load(id).finally(() => {
        this.#running--;
        this.#pump();
      });
    }
  }

  async #load(id: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUESTION_MS);
    this.#controllers.add(controller);
    try {
      const asset = await this.fetchAsset(id, controller.signal);
      if (!this.#closed) {
        this.#facts.set(id, factsOf(asset));
      }
    } catch {
      if (!this.#closed) {
        this.#facts.set(id, null);
      }
    } finally {
      clearTimeout(timer);
      this.#controllers.delete(controller);
    }
  }
}

/** the box a card scrolls in: the screen ahead is measured from it (the window would clip the card there) */
const scrollBoxOf = (node: HTMLElement) => {
  for (let box = node.parentElement; box; box = box.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(box).overflowY)) {
      return box;
    }
  }
  return null;
};

/**
 * Calls `near` for each element given to `watch` once it comes within a screen of the view, then forgets it; with no
 * IntersectionObserver, at once. One observer for the whole list, made with the first element (whose scrolling box it
 * measures from).
 */
export const nearScreen = () => {
  let observer: IntersectionObserver | undefined;
  const waiting = new Map<Element, () => void>();
  return {
    watch(node: HTMLElement, near: () => void) {
      if (typeof IntersectionObserver === 'undefined') {
        near();
        return () => {};
      }
      observer ??= new IntersectionObserver(
        (entries) => {
          for (const { target, isIntersecting } of entries) {
            const call = isIntersecting ? waiting.get(target) : undefined;
            if (!call) {
              continue;
            }
            waiting.delete(target);
            observer?.unobserve(target);
            call();
          }
        },
        { root: scrollBoxOf(node), rootMargin: '100% 0px' },
      );
      waiting.set(node, near);
      observer.observe(node);
      return () => {
        waiting.delete(node);
        observer?.unobserve(node);
      };
    },
    disconnect() {
      observer?.disconnect();
      waiting.clear();
    },
  };
};
