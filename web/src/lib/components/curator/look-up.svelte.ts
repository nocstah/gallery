import { curator, curatorIsMine } from '$lib/utils/curator';

// Local Omarchy layer: whether the photo viewer shows Curator's Look Up card. Once turned on it stays on from photo to
// photo until closed, like the info panel. Offered only when Curator answers and has the lookup endpoint (asked once),
// and only to Curator's owner (curatorIsMine), who alone is asked. The tools that ask only whether Curator answers
// (subject lift, the videos for chat apps, Pick the best in the viewer) go by `available` too.
class LookUpState {
  on = $state(false);
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
      .health()
      .then(() => (this.#available = true))
      .catch(() => (this.#available = false));
  }

  toggle() {
    this.on = !this.on;
  }
}

export const lookUp = new LookUpState();
