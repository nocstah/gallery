import { curator } from '$lib/utils/curator';

// Local Omarchy layer: whether the photo viewer shows Curator's Adjust panel (light, colour, filters, straighten), and
// for which photo. The bar offers it only when Curator answers and knows the live.adjust job (asked once per page
// load), so a Gallery without Curator, or with an older one, shows nothing new.
class AdjustPhotoState {
  assetId = $state<string>();
  available = $state(false);
  #checked = false;

  check() {
    if (this.#checked) {
      return;
    }
    this.#checked = true;
    curator
      .kinds()
      .then((kinds) => (this.available = kinds.some(({ kind }) => kind === 'live.adjust')))
      .catch(() => (this.available = false));
  }

  open(assetId: string) {
    this.assetId = assetId;
  }

  close() {
    this.assetId = undefined;
  }
}

export const adjustPhoto = new AdjustPhotoState();
