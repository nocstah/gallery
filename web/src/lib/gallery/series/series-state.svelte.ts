import {
  getAllSharedLinks,
  getAssetInfo,
  isHttpError,
  removeSharedLink,
  SharedLinkType,
  type AssetResponseDto,
  type SharedLinkResponseDto,
} from '@immich/sdk';
import { t, type Translations } from 'svelte-i18n';
import { SvelteSet } from 'svelte/reactivity';
import { get } from 'svelte/store';
import { eventManager } from '$lib/managers/event-manager.svelte';
import { makeSharedLink } from '$lib/services/shared-link.service';
import { CuratorError } from '$lib/utils/curator';
import { serverDetail } from '$lib/utils/handle-error';
import {
  seriesApi,
  seriesFailure,
  type Coming,
  type ComingMemory,
  type SentMemory,
  type SeriesRow,
} from './series-api';

// Local Omarchy layer: the state of "From the beginning" while its page is open (gallery/series). It asks Curator for
// the series and its coming days, and after anything Curator answers with a job (planning, Skip, Put back, Pick again,
// a change to who is left out) it asks for the days again, then every few seconds while Curator says it is preparing
// them. Nothing is asked once the page has closed. A failure keeps what the page shows and says what went wrong in one
// line; only the first look failing is the page's own state.
//
// The family page (the design's section 4) is a Gallery shared link that the web makes and deletes with the owner's
// session, and Curator binds and forgets: day 1 first, then the link with the photos Curator says it must hold, then
// Curator's bind, which takes a link Curator would not have straight back. New link and Make a new family link make
// the next one the same way and turn off the one it replaces, in Gallery first, then in Curator; Turn off does that
// for the link there is. Gallery is asked for the link itself for its address and its password, and Curator for what
// went out, each when Curator's answer changes. After every change the coming days are asked for again.

/** what the family page has under way: day 1, its first link, a new link, turning it off */
export type SeriesLinking = 'day1' | 'make' | 'new' | 'off';

/** a step that failed, with Gallery's reason when it says more than the step's words do */
const galleryFailure = (error: unknown, key: Translations) => {
  const said = get(t)(key);
  const reason = isHttpError(error) ? serverDetail(error, said) : undefined;
  return reason ? `${said} ${reason}` : said;
};

/** Gallery has no link by that id (any more) */
const isGone = (error: unknown) => isHttpError(error) && error.status === 404;

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
  /** the family link as Gallery holds it, for its address and its password: undefined while it is asked (or there is
   * none), null where Gallery has no link by Curator's id */
  familyLink = $state<SharedLinkResponseDto | null>();
  /** what went out to the family page, newest first: undefined until Curator has said */
  sent = $state<SentMemory[]>();
  linking = $state<SeriesLinking>();
  /** the family page was turned off while this page was open: it says so until a new link is made */
  turnedOff = $state(false);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #asked = 0;
  #closed = false;
  // the link Gallery was last asked for, and the count of memories out when Curator last listed them
  #linkAsked: string | null = null;
  #sentFor = -1;
  #sentTurn = 0;

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
      await this.#follow(coming);
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

  // ---- the family page ----

  /** day 1, 'YYYY-MM-DD' */
  setDayOne = async (day: string) => {
    const series = this.series;
    if (!series || this.linking || !day) {
      return;
    }
    this.linking = 'day1';
    this.message = undefined;
    try {
      const { series: saved } = await seriesApi.dayOne(series.id, day);
      this.#saved(saved);
    } catch (error) {
      this.#failed(error);
    } finally {
      this.linking = undefined;
    }
    await this.refresh();
  };

  /** The family link, the first or again (after a turn-off, or where Gallery no longer has it), with day 1 set first
   * while it is not, and a password when one is given. */
  makeLink = (password: string | undefined, dayOne?: string) => this.#link('make', password, dayOne);

  /** A new address for the page, with the password the link there has; the old link is turned off once Curator holds
   * the new one, and the family needs the new address. */
  newLink = () => this.#link('new', this.familyLink?.password ?? undefined);

  /** The family page off at once: its link deleted in Gallery, then forgotten by Curator. */
  turnOff = async () => {
    const series = this.series;
    const id = this.coming?.link_id;
    if (!series || !id || this.linking) {
      return;
    }
    this.linking = 'off';
    this.message = undefined;
    try {
      if (await this.#retire(series.id, id, this.familyLink?.id === id ? this.familyLink : undefined)) {
        this.turnedOff = true;
      }
    } catch (error) {
      // Gallery deleted it, so the page is off, whatever Curator answered
      this.turnedOff = true;
      this.#failed(error);
    } finally {
      this.linking = undefined;
    }
    await this.refresh();
  };

  /** a memory that went out, off the page and out of its link at once; and back on */
  takeOff = (key: string) => this.#onPage(key, (id) => seriesApi.takeOff(id, key));
  putBack = (key: string) => this.#onPage(key, (id) => seriesApi.putBack(id, key));

  #onPage = async (key: string, run: (id: number) => Promise<unknown>) => {
    const series = this.series;
    if (!series || this.busy.has(key)) {
      return;
    }
    this.busy.add(key);
    this.message = undefined;
    try {
      await run(series.id);
    } catch (error) {
      this.#failed(error);
    } finally {
      this.busy.delete(key);
    }
    // the list of what went out is asked for again with the days, whatever its count says
    this.#sentFor = -1;
    await this.refresh();
  };

  #link = async (kind: 'make' | 'new', password: string | undefined, dayOne?: string) => {
    const series = this.series;
    if (!series || this.linking) {
      return;
    }
    this.linking = kind;
    this.message = undefined;
    try {
      await this.#linkSteps(series, password, dayOne);
    } catch (error) {
      this.#failed(error);
    } finally {
      this.linking = undefined;
    }
    await this.refresh();
  };

  // Curator's steps fail with its own words (thrown); Gallery's say which step it was and its reason
  #linkSteps = async (series: SeriesRow, password: string | undefined, dayOne?: string) => {
    if (dayOne && !series.starts_on) {
      const { series: saved } = await seriesApi.dayOne(series.id, dayOne);
      this.#saved(saved);
    }
    const { photos } = await seriesApi.linkPhotos(series.id);
    if (this.#closed) {
      return;
    }
    let made: SharedLinkResponseDto | undefined;
    try {
      // as the memory Share sheet makes its links: one by one, named, open until it is turned off, and the page shows
      // pixels only: no downloads, no uploads, none of the photos' details
      made = await makeSharedLink(
        {
          type: SharedLinkType.Individual,
          assetIds: photos,
          description: series.name,
          expiresAt: null,
          password: password || undefined,
          allowUpload: false,
          allowDownload: false,
          showMetadata: false,
        },
        { rethrow: true },
      );
    } catch (error) {
      this.#failed(error, galleryFailure(error, 'memory_share_link_failed'));
      return;
    }
    if (!made) {
      this.#failed(undefined, get(t)('memory_share_link_failed'));
      return;
    }
    let replaced: string | null;
    try {
      ({ replaced } = await seriesApi.bindLink(series.id, made.id, made.key));
    } catch (error) {
      // Curator would not have it: the link goes again, so no address is out that nothing serves
      await this.#remove(made.id, made).catch(() => undefined);
      throw error;
    }
    // Curator holds the new link: Gallery is asked for it with the days, and the old one goes
    const previous = this.familyLink ?? undefined;
    this.familyLink = undefined;
    this.#linkAsked = null;
    this.turnedOff = false;
    if (replaced) {
      await this.#retire(series.id, replaced, previous?.id === replaced ? previous : undefined);
    }
  };

  /** A family link off: deleted in Gallery, then forgotten by Curator, which refuses while Gallery still has it. False
   * when Gallery could not delete it (said in the page's line); Curator's refusal is thrown. */
  #retire = async (seriesId: number, id: string, link?: SharedLinkResponseDto): Promise<boolean> => {
    try {
      await this.#remove(id, link);
    } catch (error) {
      this.#failed(error, galleryFailure(error, 'memory_share_turn_off_failed'));
      return false;
    }
    await seriesApi.forgetLink(seriesId, id);
    return true;
  };

  /** A link deleted in Gallery, or found gone already; the app hears of it (Shared links), and the page's link, if it
   * was this one, is one Gallery has no more. */
  #remove = async (id: string, link?: SharedLinkResponseDto) => {
    try {
      await removeSharedLink({ id });
    } catch (error) {
      if (!isGone(error)) {
        throw error;
      }
    }
    if (link) {
      eventManager.emit('SharedLinkDelete', link);
    }
    if (this.familyLink?.id === id) {
      this.familyLink = null;
    }
  };

  /** what changed in Curator's answer: the link to read from Gallery, what went out to list */
  #follow = async (coming: Coming) => {
    const asked: Promise<void>[] = [];
    if (coming.link_id !== this.#linkAsked) {
      asked.push(this.#readLink(coming.link_id));
    }
    if (coming.sent_count === 0) {
      this.#sentTurn++;
      this.#sentFor = 0;
      this.sent = undefined;
    } else if (coming.sent_count !== this.#sentFor) {
      asked.push(this.#readSent(coming.sent_count));
    }
    await Promise.all(asked);
  };

  /** the family link as Gallery holds it, for its key and its password: one request among the owner's links, which
   * lists a link with its first photo only (the link itself brings every photo the page has) */
  #readLink = async (id: string | null) => {
    this.#linkAsked = id;
    this.familyLink = undefined;
    if (!id) {
      return;
    }
    try {
      const links = await getAllSharedLinks({ id });
      if (!this.#closed && this.#linkAsked === id) {
        this.familyLink = links.find((link) => link.id === id) ?? null;
      }
    } catch {
      // not known now: asked again with Curator's next answer
      if (this.#linkAsked === id) {
        this.#linkAsked = null;
      }
    }
  };

  #readSent = async (count: number) => {
    const series = this.series;
    if (!series || this.#closed) {
      return;
    }
    const turn = ++this.#sentTurn;
    try {
      const { memories } = await seriesApi.sent(series.id);
      if (!this.#closed && turn === this.#sentTurn) {
        this.sent = memories;
        this.#sentFor = count;
      }
    } catch (error) {
      if (turn === this.#sentTurn) {
        this.#failed(error);
      }
    }
  };

  #saved = (series: SeriesRow) => {
    if (this.#closed) {
      return;
    }
    this.series = series;
    if (this.coming) {
      this.coming = { ...this.coming, series };
    }
  };

  /** what an action could not do, in the page's line: Curator's words, or the ones given */
  #failed = (error: unknown, words?: string) => {
    if (!this.#closed) {
      this.message = words ?? seriesFailure(error);
    }
  };

  /** the page has closed: nothing more is asked */
  close = () => {
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  };
}
