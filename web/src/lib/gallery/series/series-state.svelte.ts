import { getAssetInfo, type AssetResponseDto } from '@immich/sdk';
import { t } from 'svelte-i18n';
import { SvelteSet } from 'svelte/reactivity';
import { get } from 'svelte/store';
import { CuratorError } from '$lib/utils/curator';
import { seriesApi, seriesFailure, type Coming, type ComingMemory, type SeriesRow } from './series-api';

// Local Omarchy layer: the state of "From the beginning" while its page is open (gallery/series). It asks Curator for
// the series and its coming days, and after anything Curator answers with a job (planning, Skip, Put back, Pick again,
// a change to who is left out) it asks for the days again, then every few seconds while Curator says it is preparing
// them. Nothing is asked once the page has closed. A failure keeps what the page shows and says what went wrong in one
// line; only the first look failing is the page's own state.

/** how often the coming days are asked for while Curator prepares them */
export const POLL_MS = 3000;

/** a memory's film preview: its photos and clips as Gallery gives them to the owner, in film order */
export type SeriesFilmShow = { memory: ComingMemory; assets: AssetResponseDto[] };

const asCuratorError = (error: unknown) =>
  error instanceof CuratorError ? error : new CuratorError(error instanceof Error ? error.message : String(error), -1);

export class SeriesPageState {
  /** undefined until Curator has answered; null when there is no series yet */
  series = $state<SeriesRow | null>();
  coming = $state<Coming>();
  /** the first look failed: the page's own state, with Retry */
  failure = $state<CuratorError>();
  /** what the last action could not do, in one line */
  message = $state<string>();
  planning = $state(false);
  savingPeople = $state(false);
  film = $state<SeriesFilmShow>();
  /** the memories with an action under way (by key) */
  readonly busy = new SvelteSet<string>();

  #timer: ReturnType<typeof setTimeout> | undefined;
  #asked = 0;
  #closed = false;

  load = async () => {
    this.failure = undefined;
    this.message = undefined;
    try {
      const { series } = await seriesApi.list();
      if (this.#closed) {
        return;
      }
      this.series = series[0] ?? null;
    } catch (error) {
      if (!this.#closed) {
        this.failure = asCuratorError(error);
      }
      return;
    }
    await this.refresh();
  };

  /** the coming days, again; `quiet` for the asks while Curator prepares, which say nothing when they fail */
  refresh = async (quiet = false) => {
    const series = this.series;
    if (!series || this.#closed) {
      return;
    }
    clearTimeout(this.#timer);
    this.#timer = undefined;
    const asked = ++this.#asked;
    try {
      const coming = await seriesApi.coming(series.id);
      if (asked !== this.#asked || this.#closed) {
        return;
      }
      this.coming = coming;
      this.series = coming.series;
    } catch (error) {
      if (asked !== this.#asked || this.#closed) {
        return;
      }
      if (!this.coming) {
        this.failure = asCuratorError(error);
        return;
      }
      if (!quiet) {
        this.message = seriesFailure(error);
      }
    }
    if (this.coming?.preparing) {
      this.#timer = setTimeout(() => void this.refresh(true), POLL_MS);
    }
  };

  plan = async () => {
    if (this.planning || this.series) {
      return;
    }
    this.planning = true;
    this.message = undefined;
    try {
      const { series } = await seriesApi.create();
      if (this.#closed) {
        return;
      }
      this.series = series;
      await this.refresh();
    } catch (error) {
      if (error instanceof CuratorError && error.status === 409) {
        // one was planned meanwhile (in another tab): show it
        await this.load();
      } else if (!this.#closed) {
        this.message = seriesFailure(error);
      }
    } finally {
      this.planning = false;
    }
  };

  #act = async (key: string, run: (id: number) => Promise<{ job?: number | null }>) => {
    const series = this.series;
    if (!series || this.busy.has(key)) {
      return;
    }
    this.busy.add(key);
    this.message = undefined;
    try {
      const { job } = await run(series.id);
      if (job !== undefined && job !== null) {
        await this.refresh();
      }
    } catch (error) {
      if (!this.#closed) {
        this.message = seriesFailure(error);
      }
    } finally {
      this.busy.delete(key);
    }
  };

  skip = (key: string) => this.#act(key, (id) => seriesApi.skip(id, key));
  restore = (key: string) => this.#act(key, (id) => seriesApi.restore(id, key));
  repick = (key: string) => this.#act(key, (id) => seriesApi.repick(id, key));

  /** a memory as a swap left it, in its row */
  swapped = (memory: ComingMemory) => {
    if (this.coming) {
      this.coming = {
        ...this.coming,
        memories: this.coming.memories.map((day) => (day.key === memory.key ? memory : day)),
      };
    }
  };

  /** who the series leaves out: Gallery person ids */
  setPeopleWithout = async (ids: string[]) => {
    const series = this.series;
    if (!series || this.savingPeople) {
      return;
    }
    this.savingPeople = true;
    this.message = undefined;
    try {
      const { series: saved, job } = await seriesApi.update(series.id, { people_without: ids });
      if (this.#closed) {
        return;
      }
      this.series = saved;
      if (this.coming) {
        this.coming = { ...this.coming, series: saved };
      }
      if (job !== null && job !== undefined) {
        await this.refresh();
      }
    } catch (error) {
      if (!this.#closed) {
        this.message = seriesFailure(error);
      }
    } finally {
      this.savingPeople = false;
    }
  };

  /** the film of a memory as the family will see it: its photos from Gallery, then the film full screen */
  play = async (memory: ComingMemory) => {
    if (this.busy.has(memory.key)) {
      return;
    }
    this.busy.add(memory.key);
    this.message = undefined;
    try {
      const found = await Promise.allSettled(memory.photos.map(({ id }) => getAssetInfo({ id })));
      const assets = found.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      if (this.#closed) {
        return;
      }
      if (assets.length === 0) {
        this.message = get(t)('memory_series_play_failed');
        return;
      }
      this.film = { memory, assets };
    } finally {
      this.busy.delete(memory.key);
    }
  };

  stopFilm = () => {
    this.film = undefined;
  };

  /** the page has closed: nothing more is asked */
  close = () => {
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  };
}
