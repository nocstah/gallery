import type { SelectionCapabilities } from '$lib/managers/selection-capabilities';

// Local Omarchy layer: what a Space's selection bar (SelectionToolbar) offers for the selection, as it works it out:
// its capabilities (the viewer's role in the Space and in the album), the photos they may edit (#734, which the bar
// asks the server about), and the Space a Share links through (#1018). The bar keeps it here while it shows, which is
// whenever there is a selection on its page, so the photo menu (SpacePhotoMenu) offers the same, worked out once.

export type SelectionBarOffer = {
  caps: SelectionCapabilities;
  editableSelectedAssetIds: string[] | undefined;
  shareSpaceId: string | undefined;
};

let shown = $state<SelectionBarOffer | undefined>();

/** What the Space's selection bar on screen offers, if one is. */
export const selectionBarOffer = (): SelectionBarOffer | undefined => shown;

/** In SelectionToolbar's setup: keeps its offer here while it shows. */
export const offerFromSelectionBar = (offer: () => SelectionBarOffer) => {
  $effect(() => {
    const current = offer();
    shown = current;
    return () => {
      if (shown === current) {
        shown = undefined;
      }
    };
  });
};
