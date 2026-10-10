import { curator } from '$lib/utils/curator';

// Local Omarchy layer: whether the photo viewer is in Curator's "Remove objects" mode, and for which photo. The bar
// offers the tool only when Curator answers and knows the restore.inpaint job (asked once per page load), so a
// Gallery without Curator, or with an older one, shows nothing new.
class RemoveObjectsState {
  assetId = $state<string>();
  available = $state(false);
  #checked = false;

  /** Ask Curator once whether the brush can be offered. */
  check() {
    if (this.#checked) {
      return;
    }
    this.#checked = true;
    curator
      .kinds()
      .then((kinds) => (this.available = kinds.some(({ kind }) => kind === 'restore.inpaint')))
      .catch(() => (this.available = false));
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
    this.available = false;
    this.#checked = false;
  }
}

export const removeObjects = new RemoveObjectsState();
