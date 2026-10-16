import type { AlbumResponseDto } from '@immich/sdk';
import { CuratorError, type BookJob, type BookResult } from '$lib/utils/curator';

// Local Omarchy layer: photo books on request against a stand-in Curator: the dialog's choice starts book.make, the
// job is followed through its stages to the files, a failure or a lost Curator says so, and a book already being made
// is left to finish. Books are offered to Curator's owner only (utils/curator's curatorIsMine).

const { curatorMock, sdkMock, modalMock, mine } = vi.hoisted(() => ({
  curatorMock: { kinds: vi.fn(), makeBook: vi.fn(), book: vi.fn() },
  sdkMock: { getTimeBuckets: vi.fn() },
  modalMock: { show: vi.fn() },
  mine: { current: true },
}));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: curatorMock,
  curatorIsMine: () => mine.current,
}));
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  ...sdkMock,
}));
vi.mock('@immich/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/ui')>()),
  modalManager: modalMock,
}));

beforeEach(() => {
  mine.current = true;
});

// a manager of its own for each test (it is a singleton that remembers asking Curator), with the dialog it shows
const fresh = async () => {
  vi.resetModules();
  const manager = await import('./photo-book-manager.svelte');
  const { default: PhotoBookModal } = await import('$lib/modals/PhotoBookModal.svelte');
  return { ...manager, PhotoBookModal };
};

const result: BookResult = {
  title: 'Exploring temples',
  subtitle: 'Siem Reap, Cambodia · 13–20 October 2025',
  folder: 'Exploring temples (Siem Reap, Cambodia · 13–20 October 2025)',
  files: {
    book: { name: 'Exploring temples.pdf', size: 45_044_784 },
    cover: { name: 'Exploring temples - cover.pdf', size: 916_826 },
    preview: { name: 'Exploring temples - preview.pdf', size: 3_002_312 },
  },
  pages: 38,
  photos: 100,
  candidates: 156,
  chapters: ['Flight to Cambodia'],
};

const job = (fields: Partial<BookJob>): BookJob => ({
  id: 41,
  status: 'running',
  progress: null,
  result: null,
  error: null,
  ...fields,
});

const album = { id: 'album-1', albumName: 'Vang Vieng, Laos · February – March 2015', assetCount: 27 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the words and numbers', () => {
  it('titles an album book by its name without the dates Curator puts after it', async () => {
    const { albumBookTitle } = await fresh();
    expect(albumBookTitle('Vang Vieng, Laos · February – March 2015')).toBe('Vang Vieng, Laos');
    expect(albumBookTitle('Summer at the lake')).toBe('Summer at the lake');
  });

  it('keys a book by what it is of', async () => {
    const { bookKey } = await fresh();
    expect(bookKey({ album_id: 'a' })).toBe('album:a');
    expect(bookKey({ event_id: 491 })).toBe('event:491');
    expect(bookKey({ year: 2024 })).toBe('year:2024');
  });

  it('measures how far a book has got through its stages', async () => {
    const { bookProgress } = await fresh();
    expect(bookProgress({ status: 'queued', progress: null })).toBe(0);
    expect(bookProgress({ status: 'running', progress: { note: 'choosing', done: 0, total: 1 } })).toBe(0.05);
    expect(bookProgress({ status: 'running', progress: { note: 'pages', done: 19, total: 38 } })).toBeCloseTo(0.525);
    expect(bookProgress({ status: 'running', progress: { note: 'finishing', done: 38, total: 38 } })).toBe(0.95);
    expect(bookProgress({ status: 'done', progress: { note: 'finishing' } })).toBe(1);
  });

  it('starts a year book from the last year that is over', async () => {
    const { bookYear } = await fresh();
    const years = [
      { year: 2026, count: 1317 },
      { year: 2025, count: 2956 },
    ];
    expect(bookYear(years, 2026)).toBe(2025);
    expect(bookYear([{ year: 2026, count: 5 }], 2026)).toBe(2026);
    expect(bookYear([], 2026)).toBeUndefined();
  });

  it('folds the timeline months into years, newest first', async () => {
    sdkMock.getTimeBuckets.mockResolvedValue([
      { timeBucket: '2025-10-01', count: 300 },
      { timeBucket: '2025-01-01', count: 20 },
      { timeBucket: '2024-12-01', count: 7 },
    ]);
    const { photoYears } = await fresh();
    await expect(photoYears()).resolves.toEqual([
      { year: 2025, count: 320 },
      { year: 2024, count: 7 },
    ]);
  });
});

describe('asking whether Curator makes books', () => {
  it('offers books once Curator lists book.make, and asks only once', async () => {
    curatorMock.kinds.mockResolvedValue([{ kind: 'book.make', title: 'Make a photo book', heavy: false }]);
    const { photoBooks } = await fresh();
    photoBooks.check();
    photoBooks.check();
    await vi.waitFor(() => expect(photoBooks.available).toBe(true));
    expect(curatorMock.kinds).toHaveBeenCalledTimes(1);
  });

  it('leaves them out when Curator does not answer or does not make them', async () => {
    curatorMock.kinds.mockRejectedValue(new CuratorError('Curator acts for its owner only', 403));
    const { photoBooks } = await fresh();
    photoBooks.check();
    await vi.waitFor(() => expect(curatorMock.kinds).toHaveBeenCalled());
    expect(photoBooks.available).toBe(false);
  });

  it("asks nothing for an account that is not Curator's owner, and offers it no book", async () => {
    curatorMock.kinds.mockResolvedValue([{ kind: 'book.make', title: 'Make a photo book', heavy: false }]);
    const { photoBooks } = await fresh();
    mine.current = false;
    photoBooks.check();
    expect(curatorMock.kinds).not.toHaveBeenCalled();
    expect(photoBooks.available).toBe(false);

    // the owner's answer, kept for the page, is not the next account's: the album menus and Ctrl+K leave books out
    mine.current = true;
    photoBooks.check();
    await vi.waitFor(() => expect(photoBooks.available).toBe(true));
    mine.current = false;
    expect(photoBooks.available).toBe(false);
  });
});

describe('making a book', () => {
  it('follows the job from the queue through the pages to the files', async () => {
    curatorMock.makeBook.mockResolvedValue({ job: 41 });
    curatorMock.book
      .mockResolvedValueOnce(job({ status: 'queued' }))
      .mockResolvedValueOnce(job({ progress: { note: 'pages', done: 12, total: 38 } }))
      .mockResolvedValueOnce(job({ status: 'done', progress: { note: 'finishing', done: 38, total: 38 }, result }));
    const { photoBooks } = await fresh();
    photoBooks.start({ album_id: 'album-1' }, { title: 'Vang Vieng, Laos', photos: 27 });
    const item = () => photoBooks.items[0];
    expect(item()).toMatchObject({ key: 'album:album-1', status: 'making', stage: 'waiting', progress: 0 });

    await vi.advanceTimersByTimeAsync(1500);
    expect(curatorMock.makeBook).toHaveBeenCalledWith({ album_id: 'album-1' }, 'Vang Vieng, Laos', 27);
    expect(item()).toMatchObject({ jobId: 41, stage: 'waiting' });

    await vi.advanceTimersByTimeAsync(1500);
    expect(item()).toMatchObject({ stage: 'pages', done: 12, total: 38 });
    expect(item().progress).toBeGreaterThan(0.3);

    await vi.advanceTimersByTimeAsync(1500);
    expect(item()).toMatchObject({ status: 'ready', progress: 1, label: 'Exploring temples', result });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(curatorMock.book).toHaveBeenCalledTimes(3);
  });

  it('leaves the title to Curator when it was cleared, calling the book by its year meanwhile', async () => {
    curatorMock.makeBook.mockResolvedValue({ job: 41 });
    curatorMock.book.mockResolvedValue(job({ status: 'running' }));
    modalMock.show.mockResolvedValue({ title: '', photos: 150, year: 2025 });
    sdkMock.getTimeBuckets.mockResolvedValue([{ timeBucket: '2025-07-01', count: 300 }]);
    const { photoBooks } = await fresh();
    await photoBooks.askForYear();
    await vi.advanceTimersByTimeAsync(1500);
    expect(curatorMock.makeBook).toHaveBeenCalledWith({ year: 2025 }, undefined, 150);
    expect(photoBooks.items[0]).toMatchObject({ title: '', label: '2025' });
  });

  it('says why when the job fails, and makes it again on retry', async () => {
    curatorMock.makeBook.mockResolvedValue({ job: 41 });
    curatorMock.book.mockResolvedValueOnce(job({ status: 'failed', error: 'no photos to print in this album' }));
    const { photoBooks } = await fresh();
    photoBooks.start({ album_id: 'album-1' }, { title: 'Empty', photos: 12 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(photoBooks.items[0]).toMatchObject({ status: 'failed', error: 'no photos to print in this album' });

    curatorMock.book.mockResolvedValueOnce(job({ id: 42, status: 'done', result }));
    curatorMock.makeBook.mockResolvedValue({ job: 42 });
    photoBooks.retry('album:album-1');
    expect(photoBooks.items[0]).toMatchObject({ status: 'making' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(photoBooks.items).toHaveLength(1);
    expect(photoBooks.items[0]).toMatchObject({ status: 'ready', jobId: 42 });
  });

  it('rides out a Curator restart but not a Curator that is gone', async () => {
    curatorMock.makeBook.mockResolvedValue({ job: 41 });
    const gone = new CuratorError('Curator is not answering', 0);
    curatorMock.book
      .mockRejectedValueOnce(gone)
      .mockRejectedValueOnce(gone)
      .mockResolvedValueOnce(job({ status: 'done', result }));
    const { photoBooks } = await fresh();
    photoBooks.start({ year: 2025 }, { title: '2025', photos: 150 });
    await vi.advanceTimersByTimeAsync(3 * 1500);
    expect(photoBooks.items[0].status).toBe('ready');

    curatorMock.book.mockRejectedValue(gone);
    photoBooks.start({ year: 2024 }, { title: '2024', photos: 150 });
    await vi.advanceTimersByTimeAsync(5 * 1500);
    expect(photoBooks.items[0]).toMatchObject({
      key: 'year:2024',
      status: 'failed',
      error: 'Curator is not answering',
    });
  });

  it('leaves a book already being made to finish, and clears only the finished ones', async () => {
    curatorMock.makeBook.mockResolvedValueOnce({ job: 41 }).mockResolvedValueOnce({ job: 43 });
    curatorMock.book.mockImplementation((id: number) =>
      Promise.resolve(id === 41 ? job({ status: 'done', result }) : job({ id, status: 'running' })),
    );
    const { photoBooks } = await fresh();
    photoBooks.start({ year: 2025 }, { title: '2025', photos: 150 });
    await vi.advanceTimersByTimeAsync(1500);
    photoBooks.start({ year: 2024 }, { title: '2024', photos: 150 });
    photoBooks.start({ year: 2024 }, { title: 'Again', photos: 150 });
    expect(curatorMock.makeBook).toHaveBeenCalledTimes(2);
    expect(photoBooks.items.map((item) => [item.key, item.status])).toEqual([
      ['year:2024', 'making'],
      ['year:2025', 'ready'],
    ]);
    photoBooks.clearDone();
    expect(photoBooks.items.map((item) => item.key)).toEqual(['year:2024']);
  });
});

describe('asking what the book should be', () => {
  it("starts an album's book from its name and as many photos as it has", async () => {
    modalMock.show.mockResolvedValue({ title: 'Laos', photos: 27 });
    curatorMock.makeBook.mockReturnValue(new Promise(() => {}));
    const { photoBooks, PhotoBookModal } = await fresh();
    await photoBooks.askForAlbum(album as AlbumResponseDto);
    expect(modalMock.show).toHaveBeenCalledWith(PhotoBookModal, { title: 'Vang Vieng, Laos', photos: 27 });
    expect(photoBooks.items[0]).toMatchObject({ key: 'album:album-1', title: 'Laos', label: 'Laos', photos: 27 });
  });

  it('makes nothing when the dialog is closed', async () => {
    modalMock.show.mockResolvedValue(undefined);
    const { photoBooks, PhotoBookModal } = await fresh();
    await photoBooks.askForAlbum({ ...album, assetCount: 900 } as AlbumResponseDto);
    expect(modalMock.show).toHaveBeenCalledWith(PhotoBookModal, { title: 'Vang Vieng, Laos', photos: 120 });
    expect(photoBooks.items).toEqual([]);
  });

  it("offers the years for a year's book, starting from the last full one", async () => {
    vi.setSystemTime(new Date(2026, 9, 15));
    sdkMock.getTimeBuckets.mockResolvedValue([
      { timeBucket: '2026-03-01', count: 40 },
      { timeBucket: '2025-07-01', count: 300 },
    ]);
    modalMock.show.mockResolvedValue({ title: '2025', photos: 150, year: 2025 });
    curatorMock.makeBook.mockReturnValue(new Promise(() => {}));
    const { photoBooks, PhotoBookModal } = await fresh();
    await photoBooks.askForYear();
    expect(modalMock.show).toHaveBeenCalledWith(PhotoBookModal, {
      title: '2025',
      photos: 150,
      year: 2025,
      years: [
        { year: 2026, count: 40 },
        { year: 2025, count: 300 },
      ],
    });
    expect(photoBooks.items[0]).toMatchObject({ key: 'year:2025', subject: { year: 2025 } });
  });
});
