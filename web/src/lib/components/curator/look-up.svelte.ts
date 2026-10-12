import { curator } from '$lib/utils/curator';

// Local Omarchy layer: whether the photo viewer shows Curator's Look Up card. Once turned on it stays on from photo to
// photo until closed, like the info panel. Offered only when Curator answers and has the lookup endpoint (asked once).
class LookUpState {
  on = $state(false);
  available = $state(false);
  #checked = false;

  check() {
    if (this.#checked) {
      return;
    }
    this.#checked = true;
    curator
      .health()
      .then(() => (this.available = true))
      .catch(() => (this.available = false));
  }

  toggle() {
    this.on = !this.on;
  }
}

export const lookUp = new LookUpState();
