// Local Omarchy layer: a memory's film saved as video, on request from the film's ⋮ (Save as video, Curator's owner
// only). The film hands over the plan it plays (film-plan.ts) and the song playing; Curator draws the same film into an
// MP4 (film.render on its applier, curator/film.py: 1080p at 30 fps, the drift, crossfades, title card, story and song
// as the browser plays them), this follows the job and has the browser save "<title>.mp4" once it is ready.
// components/omarchy/FilmVideoPanel.svelte shows how far it has got in the bottom-left corner, as the videos for chat
// apps and the photo books do, and it lives as long as the page.
import {
  curator,
  CuratorError,
  curatorIsMine,
  FILM_MOST_SECONDS,
  filmFileUrl,
  type FilmJob,
  type FilmRequest,
  type FilmResult,
} from '$lib/utils/curator';

export type FilmItem = {
  /** the memory's id: one film of a memory at a time */
  key: string;
  request: FilmRequest;
  /** what the row says: the memory's title */
  label: string;
  status: 'making' | 'ready' | 'failed';
  /** waiting in Curator's queue, reading the photos, drawing the frames */
  stage: 'waiting' | 'reading' | 'frames';
  /** 0 to 1 while it is made */
  progress: number;
  jobId?: number;
  result?: FilmResult;
  error?: string;
  /** longer than Curator saves: never asked for */
  tooLong?: boolean;
};

const POLL_MS = 1500;
// answers that may go missing in a row (Curator restarting: the job itself survives that) before the film counts as
// failed
const MISSES = 5;

/** How far a film has got, 0 to 1: reading the photos is the first twentieth, the frames the rest. */
export const filmProgress = (job: Pick<FilmJob, 'status' | 'progress'>) => {
  if (job.status === 'done') {
    return 1;
  }
  const { note, done = 0, total = 0 } = job.progress ?? {};
  if (note === 'frames' && total > 0) {
    return 0.05 + 0.95 * Math.min(1, done / total);
  }
  return note === 'reading' ? 0.02 : 0;
};

class FilmVideoManager {
  items = $state<FilmItem[]>([]);
  #available = $state(false);
  #checked = false;

  /** Curator answers, saves films and works for whoever is signed in (curatorIsMine): until then the ⋮ leaves it out */
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
      .then((kinds) => (this.#available = kinds.some(({ kind }) => kind === 'film.render')))
      .catch(() => (this.#available = false));
  }

  /** Save the film as video, then the file. A film of the same memory already being made is left to finish. */
  start(request: FilmRequest, label: string) {
    const key = request.memoryId;
    if (this.#item(key)?.status === 'making') {
      return;
    }
    const tooLong = request.plan.duration > FILM_MOST_SECONDS;
    const item: FilmItem = {
      key,
      request,
      label,
      status: tooLong ? 'failed' : 'making',
      stage: 'waiting',
      progress: 0,
      tooLong,
    };
    this.items = [item, ...this.items.filter((other) => other.key !== key)];
    if (!tooLong) {
      void this.#make(key);
    }
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
      const { job } = await curator.saveFilm({ ...item.request, title: item.request.title ?? item.label });
      const started = this.#item(key);
      if (!started) {
        return;
      }
      started.jobId = job;
      let misses = 0;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        // while another account is signed in in the tab, the owner's film is not asked about (curatorIsMine)
        if (!curatorIsMine()) {
          continue;
        }
        let row: FilmJob;
        try {
          row = await curator.film(job);
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
        live.stage = row.status === 'queued' ? 'waiting' : (row.progress?.note ?? 'reading');
        live.progress = filmProgress(row);
        if (row.status === 'done' && row.result) {
          live.status = 'ready';
          live.result = row.result;
          live.label = row.result.name.replace(/\.mp4$/, '');
          this.save(live);
          return;
        }
        if (row.status !== 'queued' && row.status !== 'running') {
          throw new CuratorError(row.error ?? 'The film could not be saved', 0);
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

  /** The browser saves the file (Curator sends it as an attachment, under the memory's title). */
  save(item: FilmItem) {
    if (item.jobId === undefined) {
      return;
    }
    const link = document.createElement('a');
    link.href = filmFileUrl(item.jobId);
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
  }

  retry(key: string) {
    const item = this.#item(key);
    if (item && !item.tooLong) {
      this.start(item.request, item.request.title ?? item.label);
    }
  }

  /** The panel's close: the finished ones go, those still being made stay. */
  clearDone() {
    this.items = this.items.filter((item) => item.status === 'making');
  }
}

export const filmVideos = new FilmVideoManager();
