// Local Omarchy layer: Show in Photos (right-click on a photo in an album or among search results; the owner: "a right
// click in albums that allows to reveal original photo in the photo view.... so can delete etc or find the original
// photo"). Photos, or Archive for an archived photo, opens scrolled to it with the photo selected, as Mac Photos' Show
// in All Photos does, so it can be acted on at once. A photo that Photos shows folded under its stack's cover is
// selected by laying that stack out in place: what is selected is the photo itself, never the cover in its stead.
// That selection is soft (the owner, 2026-10-31: after Show in Photos "when I click any photo then it selects a photo,
// it doesn't open it"): while the revealed photo is the only one selected, a plain click on any photo opens it as on a
// timeline with nothing selected, and the selection goes. Shift and the select circle keep selecting, and once the
// selection holds anything else it is an ordinary one.
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

let soft: string | undefined;

/** The photo a reveal has just selected: its selection gives way to the next plain click (takeRevealClick). */
export const markRevealed = (id: string) => {
  soft = id;
};

/**
 * A click on a photo while a reveal's selection is soft: true when the click should open the photo instead of
 * selecting it, having dropped that selection. Only the first click after a reveal is looked at; one with Shift, or a
 * selection that no longer holds the revealed photo alone, keeps the ordinary selecting.
 */
export const takeRevealClick = (selection: { assets: { id: string }[]; clear: () => void }, shift: boolean) => {
  const revealed = soft;
  soft = undefined;
  if (!revealed || shift || selection.assets.length !== 1 || selection.assets[0].id !== revealed) {
    return false;
  }
  selection.clear();
  return true;
};
