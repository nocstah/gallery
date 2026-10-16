// Local Omarchy layer: photo books on request (the owner picked "a Make photo book button for a trip or a year"). An
// album's menus (services/album.service) and the palette's year command (managers/command-items) ask here; the dialog
// (modals/PhotoBookModal) takes the title and about how many photos, Curator makes the book (book.make on its applier,
// curator/books.py: the best photos laid out as a square 21 cm book, print-ready PDFs and a cover, kept in
// ~/Pictures/Photo books), this follows the job, and components/omarchy/PhotoBookPanel.svelte shows how far it has got
// and then the files to open or save. Like the videos for sharing, it lives as long as the page, so a book is still
// followed while the user goes elsewhere in Gallery.
import { AssetVisibility, getTimeBuckets, type AlbumResponseDto } from '@immich/sdk';
import { modalManager } from '@immich/ui';
import PhotoBookModal from '$lib/modals/PhotoBookModal.svelte';
import {
  BOOK_PHOTOS,
  curator,
  CuratorError,
  curatorIsMine,
  type BookJob,
  type BookResult,
  type BookSubject,
} from '$lib/utils/curator';
import { handleError } from '$lib/utils/handle-error';
import { getFormatter } from '$lib/utils/i18n';

/** Where a book has got to: waiting in Curator's queue, its photos chosen, its pages drawn, its cover and preview. */
export type BookStage = 'waiting' | 'choosing' | 'pages' | 'finishing';

export type BookItem = {
  key: string;
  subject: BookSubject;
  /** the title asked for; empty leaves it to Curator */
  title: string;
  /** what the panel calls the book: the title asked for, else the album's or the year, then the book's own title */
  label: string;
  photos: number;
  status: 'making' | 'ready' | 'failed';
  stage: BookStage;
  /** pages drawn, of how many, while they are drawn */
  done: number;
  total: number;
  /** 0 to 1 while it is made */
  progress: number;
  jobId?: number;
  result?: BookResult;
  error?: string;
};

/** What the dialog asks: the title, about how many photos and, for a year's book, which year. */
export type BookChoice = { title: string; photos: number; year?: number };
export type BookYear = { year: number; count: number };

/** The dialog's props (modals/PhotoBookModal): what it starts from, and for a year's book the years to choose from. */
export type BookDialog = {
  title: string;
  photos?: number;
  years?: BookYear[];
  year?: number;
  onClose: (choice?: BookChoice) => void;
};

const POLL_MS = 1500;
// answers that may go missing in a row (Curator restarting: the job itself survives that) before the book counts as
// failed
const MISSES = 5;
// a year takes a few more than a trip (the owner's year book on the command line asked for 150)
const YEAR_PHOTOS = 150;

export const bookKey = (subject: BookSubject) => {
  if ('album_id' in subject) {
    return `album:${subject.album_id}`;
  }
  return 'event_id' in subject ? `event:${subject.event_id}` : `year:${subject.year}`;
};

/** Curator names a trip's album "Vang Vieng, Laos · February – March 2015": a book is titled by what comes before
 * the dates, which go under the title. */
export const albumBookTitle = (name: string) => name.split(' · ', 1)[0].trim() || name;

/** How far a book has got, 0 to 1: choosing the photos is the first tenth, the pages nearly all of the rest. */
export const bookProgress = (job: Pick<BookJob, 'status' | 'progress'>) => {
  if (job.status === 'done') {
    return 1;
  }
  const { note, done = 0, total = 0 } = job.progress ?? {};
  switch (note) {
    case 'choosing': {
      return 0.05;
    }
    case 'pages': {
      return total > 0 ? 0.1 + 0.85 * Math.min(1, done / total) : 0.1;
    }
    case 'finishing': {
      return 0.95;
    }
    default: {
      return 0;
    }
  }
};

/** The years Photos holds, newest first, with how many items each. */
export const photoYears = async (): Promise<BookYear[]> => {
  const counts: Record<number, number> = {};
  for (const { timeBucket, count } of await getTimeBuckets({ visibility: AssetVisibility.Timeline })) {
    const year = Number(timeBucket.slice(0, 4));
    counts[year] = (counts[year] ?? 0) + count;
  }
  return Object.entries(counts)
    .map(([year, count]) => ({ year: Number(year), count }))
    .sort((a, b) => b.year - a.year);
};

/** The year a year's book starts from: the last one that is over, else the newest. */
export const bookYear = (years: BookYear[], thisYear?: number) => {
  // only today's year is read from it, once; nothing reacts to it
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const now = thisYear ?? new Date().getFullYear();
  return years.find(({ year }) => year < now)?.year ?? years[0]?.year;
};

class PhotoBookManager {
  items = $state<BookItem[]>([]);
  #available = $state(false);
  #checked = false;

  /** Curator answers, makes books and works for whoever is signed in (curatorIsMine): until then the menus and the
   * palette leave them out */
  get available() {
    return this.#available && curatorIsMine();
  }

  /** Asked once a page load, by the panel once Curator's owner is signed in. */
  check() {
    if (this.#checked || !curatorIsMine()) {
      return;
    }
    this.#checked = true;
    curator
      .kinds()
      .then((kinds) => (this.#available = kinds.some(({ kind }) => kind === 'book.make')))
      .catch(() => (this.#available = false));
  }

  /** An album's book: the dialog starts from its name, and from as many photos as it has, up to a book's usual. */
  async askForAlbum(album: AlbumResponseDto) {
    const photos = Math.min(BOOK_PHOTOS.standard, Math.max(BOOK_PHOTOS.least, album.assetCount));
    const choice = await modalManager.show<BookDialog>(PhotoBookModal, {
      title: albumBookTitle(album.albumName),
      photos,
    });
    if (choice) {
      this.start({ album_id: album.id }, choice, choice.title || albumBookTitle(album.albumName));
    }
  }

  /** A year's book: the dialog offers the years with photos, starting from the last full one. */
  async askForYear() {
    let years: BookYear[];
    try {
      years = await photoYears();
    } catch (error) {
      const translate = await getFormatter();
      handleError(error, translate('errors.something_went_wrong'));
      return;
    }
    const year = bookYear(years);
    if (year === undefined) {
      return;
    }
    const choice = await modalManager.show<BookDialog>(PhotoBookModal, {
      title: String(year),
      photos: YEAR_PHOTOS,
      years,
      year,
    });
    if (choice?.year) {
      this.start({ year: choice.year }, choice, choice.title || String(choice.year));
    }
  }

  /** Have the book made. A book of the same album or year already being made is left to finish. */
  start(subject: BookSubject, { title, photos }: Pick<BookChoice, 'title' | 'photos'>, label = title) {
    const key = bookKey(subject);
    if (this.#item(key)?.status === 'making') {
      return;
    }
    this.items = [
      { key, subject, title, label, photos, status: 'making', stage: 'waiting', done: 0, total: 0, progress: 0 },
      ...this.items.filter((item) => item.key !== key),
    ];
    void this.#make(key);
  }

  #item(key: string) {
    return this.items.find((item) => item.key === key);
  }

  async #make(key: string) {
    const item = this.#item(key);
    if (!item) {
      return;
    }
    try {
      const { job } = await curator.makeBook(item.subject, item.title || undefined, item.photos);
      const started = this.#item(key);
      if (!started) {
        return;
      }
      started.jobId = job;
      let misses = 0;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        // while another account is signed in in the tab, the owner's book is not asked about; it is followed again once
        // Curator's owner is back (curatorIsMine)
        if (!curatorIsMine()) {
          continue;
        }
        let row: BookJob;
        try {
          row = await curator.book(job);
          misses = 0;
        } catch (error) {
          if (++misses >= MISSES) {
            throw error;
          }
          continue;
        }
        const live = this.#item(key);
        if (live?.jobId !== job) {
          return; // closed, or asked for again
        }
        live.stage = row.status === 'queued' ? 'waiting' : (row.progress?.note ?? 'choosing');
        live.done = row.progress?.done ?? 0;
        live.total = row.progress?.total ?? 0;
        live.progress = bookProgress(row);
        if (row.status === 'done' && row.result) {
          live.status = 'ready';
          live.result = row.result;
          live.label = row.result.title;
          return;
        }
        if (row.status !== 'queued' && row.status !== 'running') {
          throw new CuratorError(row.error ?? 'The book could not be made', 0);
        }
      }
    } catch (error) {
      const live = this.#item(key);
      if (live) {
        live.status = 'failed';
        live.error = error instanceof Error ? error.message : String(error);
      }
    }
  }

  retry(key: string) {
    const item = this.#item(key);
    if (item) {
      this.start(item.subject, item, item.label);
    }
  }

  /** The panel's close: the finished ones go, those still being made stay. */
  clearDone() {
    this.items = this.items.filter((item) => item.status === 'making');
  }
}

export const photoBooks = new PhotoBookManager();
