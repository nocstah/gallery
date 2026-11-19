// Local Omarchy layer: the page under an opening photo (routes/(user)/+layout.svelte). Gallery's viewer zoom
// (lib/gallery/motion/viewer-zoom.ts) flies a copy of the photo out of its tile the moment it is clicked, and the page
// was hidden as soon as the route said a photo was open; the viewer mounts and fades in a few hundred milliseconds
// later, so the photo flew over an empty page, a flash of Kioku's light background between the grid and the dark
// viewer (the owner, 2026-11-17: "the zoom photo animation is flawed"). Now the page stays under the flight until the
// viewer stands over it, and the photo's tile is left empty meanwhile: the photo has left its place.

const VIEWER = '#immich-asset-viewer';
const FLYER = '[data-motion-flyer]';
const THUMBNAIL = '[data-thumbnail-focus-container]';

/** The tile the opening photo flies out of, when one is flying now. */
export const flyingTile = (assetId: string | undefined): HTMLElement | undefined => {
  if (!assetId || !document.querySelector(FLYER)) {
    return;
  }
  return document.querySelector<HTMLElement>(`${THUMBNAIL}[data-asset="${CSS.escape(assetId)}"]`) ?? undefined;
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
Resolves once the viewer is in the page and done fading in, so it covers the page; or after `timeoutMs`, so a viewer
that never comes does not leave the page up behind it.
*/
export const viewerStandsOver = async (timeoutMs = 2500): Promise<void> => {
  const until = performance.now() + timeoutMs;
  while (performance.now() < until) {
    const viewer = document.querySelector(VIEWER);
    if (viewer) {
      // its fade is begun as it mounts (viewer-zoom's zoomIn), before the frame that finds it here
      await Promise.all((viewer.getAnimations?.() ?? []).map((animation) => animation.finished.catch(() => {})));
      return;
    }
    await nextFrame();
  }
};
