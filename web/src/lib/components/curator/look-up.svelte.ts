import { curatorOffers } from '$lib/gallery/libraries/library-context.svelte';
import type { CuratorFeature } from '$lib/gallery/libraries/library-file';
import { curator, curatorIsMine } from '$lib/utils/curator';

// Local Omarchy layer: whether the photo viewer shows Curator's Look Up card. Once turned on it stays on from photo to
// photo until closed, like the info panel. Offered only when Curator answers and has the lookup endpoint (asked once),
// and only to Curator's owner (curatorIsMine), who alone is asked. The tools that ask only whether Curator answers
// (subject lift, Pick the best in the viewer) go by `answers` with what each is for. Each is offered only where this
// library's Curator offers that (gallery/libraries): Look Up its local models (chat), subject lift its live tools,
// Pick the best its picks; Curator is asked only where one of them is.
const ASKED_FOR: readonly CuratorFeature[] = ['chat', 'live', 'picks'];

class LookUpState {
  on = $state(false);
  #answered = $state(false);
  #checked = false;

  /** Look Up itself */
  get available() {
    return this.answers('chat');
  }

  /** Curator answered, works for whoever is signed in, and this library's Curator offers `feature` */
  answers(feature: CuratorFeature) {
    return this.#answered && curatorIsMine() && curatorOffers(feature);
  }

  check() {
    if (this.#checked || !curatorIsMine() || ASKED_FOR.every((feature) => !curatorOffers(feature))) {
      return;
    }
    this.#checked = true;
    curator
      .health()
      .then(() => (this.#answered = true))
      .catch(() => (this.#answered = false));
  }

  toggle() {
    this.on = !this.on;
  }
}

export const lookUp = new LookUpState();
