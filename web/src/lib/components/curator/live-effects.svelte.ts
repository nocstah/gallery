import { curator } from '$lib/utils/curator';

// Local Omarchy layer: whether the photo viewer shows Curator's Live Photo effects, and for which photo. The bar offers
// them only when Curator answers and knows the live.effect job (asked once per page load).
class LiveEffectsState {
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
      .then((kinds) => (this.available = kinds.some(({ kind }) => kind === 'live.effect')))
      .catch(() => (this.available = false));
  }

  open(assetId: string) {
    this.assetId = assetId;
  }

  close() {
    this.assetId = undefined;
  }
}

export const liveEffects = new LiveEffectsState();
