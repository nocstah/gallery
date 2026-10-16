import { curator, curatorIsMine } from '$lib/utils/curator';

// Local Omarchy layer: whether the photo viewer shows Curator's Adjust panel (light, colour, filters, straighten), and
// for which photo. The bar offers it only when Curator answers and knows the live.adjust job (asked once per page
// load), so a Gallery without Curator, or with an older one, shows nothing new; and only to Curator's owner
// (curatorIsMine), who alone is asked.
class AdjustPhotoState {
  assetId = $state<string>();
  #available = $state(false);
  #checked = false;

  get available() {
    return this.#available && curatorIsMine();
  }

  check() {
    if (this.#checked || !curatorIsMine()) {
      return;
    }
    this.#checked = true;
    curator
      .kinds()
      .then((kinds) => (this.#available = kinds.some(({ kind }) => kind === 'live.adjust')))
      .catch(() => (this.#available = false));
  }

  open(assetId: string) {
    this.assetId = assetId;
  }

  close() {
    this.assetId = undefined;
  }
}

export const adjustPhoto = new AdjustPhotoState();
