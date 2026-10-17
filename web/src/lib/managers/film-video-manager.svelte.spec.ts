import { buildFilmPlan, type FilmPlan } from '$lib/components/memories/film/film-plan';
import { CuratorError, type FilmJob, type FilmResult } from '$lib/utils/curator';

// Local Omarchy layer: a memory's film saved as video against a stand-in Curator: Save as video posts the film's plan
// and the song playing, the job is followed from the queue through its frames to the file, which the browser saves; a
// failure or a lost Curator says so, a film longer than Curator saves is never asked for, and a film already being
// made is left to finish. Offered to Curator's owner only (utils/curator's curatorIsMine), once Curator lists
// film.render.

const { curatorMock, mine } = vi.hoisted(() => ({
  curatorMock: { kinds: vi.fn(), saveFilm: vi.fn(), film: vi.fn() },
  mine: { current: true },
}));

vi.mock('$lib/utils/curator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils/curator')>()),
  curator: curatorMock,
  curatorIsMine: () => mine.current,
}));

// a manager of its own for each test (it is a singleton that remembers asking Curator)
const fresh = async () => {
  vi.resetModules();
  return import('./film-video-manager.svelte');
};

const plan = (photos = 3): FilmPlan =>
  buildFilmPlan({
    memoryId: 'memory-1',
    assets: Array.from({ length: photos }, (_, index) => ({ id: `asset-${index}`, kind: 'photo', ratio: 4 / 3 })),
    aspect: 16 / 9,
    title: { text: 'Siem Reap', line: 'October 2025 · 3 photos' },
    tracks: [{ id: 'song-1', title: 'Song', artist: 'Someone', duration: 200, bpm: null, src: '/api/music/song-1' }],
  });

const result: FilmResult = {
  name: 'Siem Reap · October 2025.mp4',
  size: 21_400_000,
  seconds: 20,
  width: 1920,
  height: 1080,
};

const job = (fields: Partial<FilmJob>): FilmJob => ({
  id: 41,
  status: 'running',
  progress: null,
  result: null,
  error: null,
  ...fields,
});

let clicked: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mine.current = true;
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this.href);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('asking whether Curator saves films', () => {
  it('offers Save as video once Curator lists film.render, and asks only once', async () => {
    curatorMock.kinds.mockResolvedValue([{ kind: 'film.render', title: "Save a memory's film", heavy: false }]);
    const { filmVideos } = await fresh();
    filmVideos.check();
    filmVideos.check();
    await vi.waitFor(() => expect(filmVideos.available).toBe(true));
    expect(curatorMock.kinds).toHaveBeenCalledTimes(1);
  });

  it('leaves it out when Curator does not answer, or does not save films', async () => {
    curatorMock.kinds.mockResolvedValue([{ kind: 'book.make', title: 'Make a photo book', heavy: false }]);
    const { filmVideos } = await fresh();
    filmVideos.check();
    await vi.waitFor(() => expect(curatorMock.kinds).toHaveBeenCalled());
    expect(filmVideos.available).toBe(false);
  });

  it("asks nothing for an account that is not Curator's owner, and offers it nothing", async () => {
    curatorMock.kinds.mockResolvedValue([{ kind: 'film.render', title: '', heavy: false }]);
    const { filmVideos } = await fresh();
    mine.current = false;
    filmVideos.check();
    expect(curatorMock.kinds).not.toHaveBeenCalled();
    mine.current = true;
    filmVideos.check();
    await vi.waitFor(() => expect(filmVideos.available).toBe(true));
    mine.current = false;
    expect(filmVideos.available).toBe(false);
  });
});

describe('saving a film', () => {
  it('measures how far a film has got: the photos read, then its frames', async () => {
    const { filmProgress } = await fresh();
    expect(filmProgress({ status: 'queued', progress: null })).toBe(0);
    expect(filmProgress({ status: 'running', progress: { note: 'reading', done: 0, total: 1 } })).toBe(0.02);
    expect(filmProgress({ status: 'running', progress: { note: 'frames', done: 300, total: 600 } })).toBeCloseTo(0.525);
    expect(filmProgress({ status: 'done', progress: { note: 'frames', done: 599, total: 600 } })).toBe(1);
  });

  it('posts the plan and the song, follows the job through its frames and saves the file', async () => {
    curatorMock.saveFilm.mockResolvedValue({ job: 41 });
    curatorMock.film
      .mockResolvedValueOnce(job({ status: 'queued' }))
      .mockResolvedValueOnce(job({ progress: { note: 'frames', done: 300, total: 600 } }))
      .mockResolvedValueOnce(job({ status: 'done', progress: { note: 'frames', done: 599, total: 600 }, result }));
    const { filmVideos } = await fresh();
    const film = plan();
    filmVideos.start(
      { memoryId: 'memory-1', plan: film, trackId: 'song-1', title: 'Siem Reap · October 2025' },
      'Siem Reap',
    );
    const item = () => filmVideos.items[0];
    expect(item()).toMatchObject({ key: 'memory-1', status: 'making', stage: 'waiting', progress: 0 });
    // the plan goes as it is: plain JSON, its song the one playing
    expect(curatorMock.saveFilm).toHaveBeenCalledWith({
      memoryId: 'memory-1',
      plan: film,
      trackId: 'song-1',
      title: 'Siem Reap · October 2025',
    });
    expect(JSON.stringify(curatorMock.saveFilm.mock.calls[0][0].plan)).toBe(JSON.stringify(film));
    expect(film.music[0].trackId).toBe('song-1');

    await vi.advanceTimersByTimeAsync(1500);
    expect(item()).toMatchObject({ jobId: 41, stage: 'waiting' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(item()).toMatchObject({ stage: 'frames' });
    expect(item().progress).toBeCloseTo(0.525);
    expect(clicked).toEqual([]);

    await vi.advanceTimersByTimeAsync(1500);
    expect(item()).toMatchObject({ status: 'ready', progress: 1, label: 'Siem Reap · October 2025', result });
    expect(clicked).toEqual(['http://localhost:2290/api/films/41/film.mp4']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(curatorMock.film).toHaveBeenCalledTimes(3);

    // saved again from the panel
    filmVideos.save(item());
    expect(clicked).toHaveLength(2);
  });

  it('names the file after the label when no title is given', async () => {
    curatorMock.saveFilm.mockResolvedValue({ job: 41 });
    curatorMock.film.mockResolvedValue(job({}));
    const { filmVideos } = await fresh();
    filmVideos.start({ memoryId: 'memory-1', plan: plan() }, 'Siem Reap · October 2025');
    expect(curatorMock.saveFilm.mock.calls[0][0]).toMatchObject({ title: 'Siem Reap · October 2025' });
  });

  it('never asks for a film longer than Curator saves', async () => {
    const { filmVideos } = await fresh();
    const long = plan(70); // 70 photos of 5 seconds
    expect(long.duration).toBeGreaterThan(300);
    filmVideos.start({ memoryId: 'memory-1', plan: long }, 'Siem Reap');
    expect(filmVideos.items[0]).toMatchObject({ status: 'failed', tooLong: true });
    expect(curatorMock.saveFilm).not.toHaveBeenCalled();
    filmVideos.retry('memory-1');
    expect(curatorMock.saveFilm).not.toHaveBeenCalled();
  });

  it('says why when the job fails, and saves it again on retry', async () => {
    curatorMock.saveFilm.mockResolvedValue({ job: 41 });
    curatorMock.film.mockResolvedValueOnce(job({ status: 'failed', error: 'could not read the song' }));
    const { filmVideos } = await fresh();
    filmVideos.start({ memoryId: 'memory-1', plan: plan(), title: 'Siem Reap' }, 'Siem Reap');
    await vi.advanceTimersByTimeAsync(1500);
    expect(filmVideos.items[0]).toMatchObject({ status: 'failed', error: 'could not read the song' });

    curatorMock.saveFilm.mockResolvedValue({ job: 42 });
    curatorMock.film.mockResolvedValue(job({ id: 42, status: 'running' }));
    filmVideos.retry('memory-1');
    expect(filmVideos.items[0]).toMatchObject({ status: 'making' });
    expect(curatorMock.saveFilm).toHaveBeenCalledTimes(2);
  });

  it('fails when Curator refuses the plan, and when it stops answering', async () => {
    curatorMock.saveFilm.mockRejectedValueOnce(new CuratorError("Not this memory's film", 400));
    const { filmVideos } = await fresh();
    filmVideos.start({ memoryId: 'memory-1', plan: plan() }, 'Siem Reap');
    await vi.waitFor(() => expect(filmVideos.items[0]).toMatchObject({ status: 'failed' }));
    expect(filmVideos.items[0].error).toBe("Not this memory's film");

    curatorMock.saveFilm.mockResolvedValue({ job: 43 });
    curatorMock.film.mockRejectedValue(new CuratorError('Curator is not answering', 0));
    filmVideos.retry('memory-1');
    await vi.advanceTimersByTimeAsync(1500 * 4);
    expect(filmVideos.items[0]).toMatchObject({ status: 'making' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(filmVideos.items[0]).toMatchObject({ status: 'failed', error: 'Curator is not answering' });
  });

  it('leaves a film already being made to finish, and the close clears only finished ones', async () => {
    curatorMock.saveFilm.mockResolvedValue({ job: 41 });
    curatorMock.film.mockResolvedValue(job({}));
    const { filmVideos } = await fresh();
    filmVideos.start({ memoryId: 'memory-1', plan: plan() }, 'Siem Reap');
    filmVideos.start({ memoryId: 'memory-1', plan: plan() }, 'Siem Reap');
    expect(curatorMock.saveFilm).toHaveBeenCalledTimes(1);
    filmVideos.start({ memoryId: 'memory-2', plan: plan(70) }, 'Too long');
    expect(filmVideos.items).toHaveLength(2);
    filmVideos.clearDone();
    expect(filmVideos.items.map(({ key }) => key)).toEqual(['memory-1']);
  });

  it('waits while another account is signed in, and goes on once the owner is back', async () => {
    curatorMock.saveFilm.mockResolvedValue({ job: 41 });
    curatorMock.film.mockResolvedValue(job({ status: 'done', result }));
    const { filmVideos } = await fresh();
    filmVideos.start({ memoryId: 'memory-1', plan: plan() }, 'Siem Reap');
    await vi.waitFor(() => expect(curatorMock.saveFilm).toHaveBeenCalled());
    mine.current = false;
    await vi.advanceTimersByTimeAsync(4500);
    expect(curatorMock.film).not.toHaveBeenCalled();
    mine.current = true;
    await vi.advanceTimersByTimeAsync(1500);
    expect(filmVideos.items[0]).toMatchObject({ status: 'ready' });
  });
});
