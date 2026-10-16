import { curator, curatorIsMine } from '$lib/utils/curator';

// Local Omarchy layer: whether the photo viewer is in Curator's "Remove objects" mode, and for which photo. The bar
// offers the tool only when Curator answers and knows the restore.inpaint job (asked once per page load), so a
// Gallery without Curator, or with an older one, shows nothing new; and only to Curator's owner (curatorIsMine), who
// alone is asked.
class RemoveObjectsState {
  assetId = $state<string>();
  #available = $state(false);
  #checked = false;

  get available() {
    return this.#available && curatorIsMine();
  }

  /** Ask Curator once whether the brush can be offered. */
  check() {
    if (this.#checked || !curatorIsMine()) {
      return;
    }
    this.#checked = true;
    curator
      .kinds()
      .then((kinds) => (this.#available = kinds.some(({ kind }) => kind === 'restore.inpaint')))
      .catch(() => (this.#available = false));
  }

  open(assetId: string) {
    this.assetId = assetId;
  }

  close() {
    this.assetId = undefined;
  }

  /** for tests: forget the answer, so the next check asks again */
  reset() {
    this.assetId = undefined;
    this.#available = false;
    this.#checked = false;
  }
}

export const removeObjects = new RemoveObjectsState();
