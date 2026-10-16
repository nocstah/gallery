// Local Omarchy layer: rounded corners, the View menu's switch. Every corner is the theme's window radius (DESIGN.md,
// Shapes), square on the owner's Omarchy themes; with the switch on, this browser puts every corner on one rounded
// radius whatever the theme: the chrome by --ws-radius (omarchy-world.css's :root[data-corners='rounded']), the photo
// tiles by --tile-radius, which follows the zoom so that small tiles are barely rounded and the gaps between them stay
// lines. Faces stay round either way. app.html sets the attribute before the first paint.
import { thumbnailZoomManager, ZOOM_MAX, ZOOM_MIN } from '$lib/managers/thumbnail-zoom-manager.svelte';

const KEY = 'gallery.corners';

const read = () => {
  try {
    return localStorage.getItem(KEY) === 'rounded';
  } catch {
    return false;
  }
};

class Corners {
  rounded = $state(read());

  set(rounded: boolean) {
    this.rounded = rounded;
    try {
      if (rounded) {
        localStorage.setItem(KEY, 'rounded');
      } else {
        localStorage.removeItem(KEY);
      }
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    if (rounded) {
      document.documentElement.dataset.corners = 'rounded';
    } else {
      delete document.documentElement.dataset.corners;
    }
  }
}

export const corners = new Corners();

/**
 * A photo tile's corner with rounded corners on: ~2px at the smallest size, 6px at the default, up to the chrome's
 * 8px for big tiles, halved in Compact. Undefined without them: the tiles take the theme's radius (--ws-radius).
 */
export const tileRadius = () => {
  if (!corners.rounded) {
    return;
  }
  const { scale, compact } = thumbnailZoomManager;
  const radius =
    scale <= 1 ? 2 + (4 * (scale - ZOOM_MIN)) / (1 - ZOOM_MIN) : 6 + 2 * Math.min(1, (scale - 1) / (ZOOM_MAX - 1));
  return Math.round(Math.max(0, radius) * (compact ? 0.5 : 1));
};
