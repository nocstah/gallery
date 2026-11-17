import { onMount } from 'svelte';
import { beforeNavigate, onNavigate } from '$app/navigation';
import { celebrate as galleryCelebrate } from '$lib/gallery/motion/celebrate';
import { crossfadeNavigation } from '$lib/gallery/motion/page-transition';
import { installPressFeedback } from '$lib/gallery/motion/press';
import { animateRemoval as galleryAnimateRemoval } from '$lib/gallery/motion/removal';
import { installThumbnailLift } from '$lib/gallery/motion/thumbnail-lift';
import { installTilt } from '$lib/gallery/motion/tilt';
import { installViewerZoom, viewerZoomBeforeNavigate } from '$lib/gallery/motion/viewer-zoom';

export { pop, pulse } from '$lib/gallery/motion/celebrate';
export { countMotion, flipMotion, slideFrom, staggerDelay, type ListMotion } from '$lib/gallery/motion/list';
export { nameSharedElements, SHARED_ELEMENT_ATTR } from '$lib/gallery/motion/page-transition';
export { type RemovalKind, type RemovalTarget } from '$lib/gallery/motion/removal';

/**
 * Local Omarchy layer: Kioku's motion follows the desktop (DESIGN.md, Motion), so Gallery's house-wide motion
 * language stays off: setupMotion installs nothing (press feedback, card tilt, photo lift, page crossfade, viewer
 * zoom), photos leaving make no flight and a favourite no burst, and motion.css is not imported
 * (styles/gallery-theme.css). The Library Cleanup screens keep their own small motions (pop, pulse, lists).
 * Set this to false to try Gallery's motion as upstream ships it (and import motion.css again).
 */
const KIOKU_MOTION_OFF = true;

export const celebrate: typeof galleryCelebrate = (...args) => {
  if (!KIOKU_MOTION_OFF) {
    galleryCelebrate(...args);
  }
};
export const animateRemoval: typeof galleryAnimateRemoval = (...args) => {
  if (!KIOKU_MOTION_OFF) {
    galleryAnimateRemoval(...args);
  }
};
export { duration, ease, spring, springEasing } from '$lib/gallery/motion/tokens';

/**
 * Root-layout hook, called once during the layout's initialisation: installs the site-wide press
 * feedback, the card tilt, the timeline photo lift and the crossfade between pages. Design: specs/2026-10-23-web-motion-language-design.md.
 */
export const setupMotion = (): void => {
  if (KIOKU_MOTION_OFF) {
    return;
  }
  onMount(() => {
    const uninstallPress = installPressFeedback();
    const uninstallTilt = installTilt();
    const uninstallThumbnailLift = installThumbnailLift();
    const uninstallViewerZoom = installViewerZoom();
    return () => {
      uninstallPress();
      uninstallTilt();
      uninstallThumbnailLift();
      uninstallViewerZoom();
    };
  });
  beforeNavigate(viewerZoomBeforeNavigate);
  onNavigate(crossfadeNavigation);
};
