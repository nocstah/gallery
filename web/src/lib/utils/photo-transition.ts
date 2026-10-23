// Local Omarchy layer: the grid <-> viewer morph. Opening a photo grows it out of its tile into the
// viewer; closing shrinks it back into its tile. Built on the View Transitions API from SvelteKit's
// onNavigate: one element on each side carries the shared name `ws-photo` (the tile's image in the grid,
// the on-screen photo box in the viewer), and the browser animates between the two boxes while the
// rest of the page crossfades. Moving between photos inside the viewer is left alone. Browsers without
// the API, and reduced-motion users, get the plain cut.
import { tick } from 'svelte';

const NAME = 'ws-photo';

type NavigationLike = {
  from: { params: Record<string, string> | null } | null;
  to: { params: Record<string, string> | null } | null;
  complete: Promise<void>;
};

const tileFor = (id: string) =>
  document.querySelector<HTMLElement>(`[data-thumbnail-focus-container][data-asset="${CSS.escape(id)}"]`);
const viewerFor = (id: string) => document.querySelector<HTMLElement>(`[data-viewer-photo="${CSS.escape(id)}"]`);

const isOnScreen = (element: HTMLElement | null) => {
  if (!element) {
    return false;
  }
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
};

const name = (element: HTMLElement | null, value: string) => {
  if (element) {
    element.style.viewTransitionName = value;
  }
};

// The new side may mount a frame or two after navigation completes (viewer layout, grid scroll restore).
const waitFor = async (find: () => HTMLElement | null, timeout = 350) => {
  const until = performance.now() + timeout;
  let element = find();
  while (!isOnScreen(element) && performance.now() < until) {
    // timers, not rAF: rendering is suspended while a view transition waits on this callback
    await new Promise((resolve) => setTimeout(resolve, 16));
    element = find();
  }
  return isOnScreen(element) ? element : null;
};

export const photoTransition = (navigation: NavigationLike) => {
  if (
    typeof document === 'undefined' ||
    !('startViewTransition' in document) ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }
  const fromId = navigation.from?.params?.assetId;
  const toId = navigation.to?.params?.assetId;
  const opening = !fromId && !!toId;
  const closing = !!fromId && !toId;
  if (!opening && !closing) {
    return;
  }
  const id = (opening ? toId : fromId)!;
  const start = opening ? tileFor(id) : viewerFor(id);
  if (!isOnScreen(start)) {
    return;
  }

  return new Promise<void>((resolve) => {
    name(start, NAME);
    // eslint-disable-next-line tscompat/tscompat -- Guarded above; older browsers use the plain navigation.
    const transition = document.startViewTransition(async () => {
      resolve();
      await navigation.complete;
      await tick();
      name(start, '');
      const end = await waitFor(() => (opening ? viewerFor(id) : tileFor(id)));
      name(end, NAME);
    });
    // eslint-disable-next-line tscompat/tscompat -- Only reached after the View Transitions feature check.
    void transition.finished.finally(() => {
      for (const element of document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]')) {
        if (element.style.viewTransitionName === NAME) {
          name(element, '');
        }
      }
    });
  });
};
