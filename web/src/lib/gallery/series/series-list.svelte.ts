import type { CuratorError } from '$lib/utils/curator';
import { asCuratorError, seriesApi, type SeriesCard } from './series-api';

// Local Omarchy layer: the owner's series in "From the beginning" while the list is open (gallery/series): each as
// Curator's card gives it, the oldest first. The first look failing is the page's own state, with Retry, as it is on
// a series' own page; nothing is kept once the page has closed.

export class SeriesListState {
  /** undefined until Curator has answered */
  cards = $state<SeriesCard[]>();
  /** the look failed: the page's own state, with Retry */
  failure = $state<CuratorError>();

  #asked = 0;
  #closed = false;

  load = async () => {
    this.failure = undefined;
    const asked = ++this.#asked;
    try {
      const { series } = await seriesApi.list();
      if (!this.#closed && asked === this.#asked) {
        this.cards = series;
      }
    } catch (error) {
      if (!this.#closed && asked === this.#asked) {
        this.failure = asCuratorError(error);
      }
    }
  };

  close = () => {
    this.#closed = true;
  };
}
