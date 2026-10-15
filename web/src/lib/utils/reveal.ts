// Local Omarchy layer: Show in Photos (right-click on a photo in an album or among search results; the owner: "a right
// click in albums that allows to reveal original photo in the photo view.... so can delete etc or find the original
// photo"). Photos, or Archive for an archived photo, opens scrolled to it with the photo selected, as Mac Photos' Show
// in All Photos does, so it can be acted on at once. A photo that Photos shows folded under its stack's cover is
// selected by laying that stack out in place: what is selected is the photo itself, never the cover in its stead.
import { AssetVisibility, getAssetInfo } from '@immich/sdk';
import { goto } from '$app/navigation';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { Route } from '$lib/route';

/** where the timeline scrolls to (the photo, or the cover it is folded under), and what it then selects */
export type Reveal = { at: string; select: string; stackId?: string };

// a reveal that never arrives (the page failed to load, the photo went) is forgotten after this long
const STALE_MS = 15_000;

let pending: (Reveal & { until: number }) | undefined;

/** Opens Photos (or Archive) at the photo, to be selected there once the timeline has scrolled to it. */
export const revealInPhotos = async (id: string) => {
  const asset = await getAssetInfo({ ...authManager.params, id });
  const folded = asset.stack && asset.stack.primaryAssetId !== id ? asset.stack : undefined;
  const at = folded?.primaryAssetId ?? id;
  pending = { at, select: id, stackId: folded?.id, until: performance.now() + STALE_MS };
  await goto(
    asset.visibility === AssetVisibility.Archive
      ? `${Route.archive()}?at=${encodeURIComponent(at)}`
      : Route.photos({ at }),
  );
};

/** A timeline scrolled to `at`: what to select there, once; a timeline at any other photo leaves the reveal waiting. */
export const takeReveal = (at: string | null | undefined): Reveal | undefined => {
  if (pending && performance.now() > pending.until) {
    pending = undefined;
  }
  if (!pending || !at || pending.at !== at) {
    return undefined;
  }
  const reveal: Reveal = { at: pending.at, select: pending.select, stackId: pending.stackId };
  pending = undefined;
  return reveal;
};
