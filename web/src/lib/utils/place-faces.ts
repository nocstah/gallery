// Local Omarchy layer: which photo fronts a place on Places and in Explore's row (DESIGN.md, Places; managers/place-faces
// asks Gallery). Gallery lists one photo per city, the first its index finds: 9 of the first 12 places on the owner's
// Places page showed people (critique 2026-10-23: 6 of a phone's first 8). The owner's decision, "Best photo, by the
// folder rule" (utils/folder-faces), for a place without people: a photo with a camera's data on the timeline (no
// screenshot, no picture sent through a chat app, no slip or document Gallery archives, no video) in which Gallery found
// no face. No face found is not no one in it (a person seen from behind, or cropped at the neck, has none), so the
// place's photos are ranked by how much they look like a place, with Gallery's own image search (its CLIP model, as Ctrl+K
// searches): of the six that look most like one, a favourite first, then one that is not dim (utils/thumbhash-light).
// Where Gallery's machine learning does not answer, the place's favourites with no face found come first, then its
// photos so, the newest three each time; the server's photo where none qualifies. The searches answer, for every
// account, from what that account may see.
import { AssetTypeEnum, AssetVisibility, type SearchFilter } from '@immich/sdk';
import { isDim } from '$lib/utils/thumbhash-light';

export type PlaceAt = { city: string; country?: string | null };
export type PlacePicture = { id: string; thumbhash: string | null; isFavorite?: boolean };
/** A search of the place's photos: those matching `filter`, `size` at most, best first. */
export type PlaceSearch = (filter: SearchFilter, size: number) => Promise<PlacePicture[]>;
/** How a place's photos are searched: by how much they look like `PLACE_LOOK` (Gallery's image search), or newest
 * first (its metadata search). */
export type PlaceSearches = { looks: PlaceSearch; newest: PlaceSearch };

/** What a place looks like to Gallery's image search: its views, its buildings, its streets. */
export const PLACE_LOOK = 'landscape, scenery, architecture, a view of the town';
/** The photos that look most like a place, among which a favourite comes first. */
export const PLACE_LOOKS = 6;
/** Without the image search, the newest photos of a kind looked at for one that is not dim. */
export const PLACE_LOOKED_AT = 3;

/** The place's photos with a camera's data and no face found in them (its favourites among them, or all). */
export const placeFilter = ({ city, country }: PlaceAt, favourites: boolean): SearchFilter => ({
  city: { eq: city },
  ...(country && { country: { eq: country } }),
  type: { eq: AssetTypeEnum.Image },
  visibility: { eq: AssetVisibility.Timeline },
  make: { ne: null },
  hasPeople: { eq: false },
  ...(favourites && { isFavorite: { eq: true } }),
});

/** The first of these that is not dim, else the first. */
export const firstBright = <T extends PlacePicture>(pictures: T[]): T | undefined =>
  pictures.find(({ thumbhash }) => !isDim(thumbhash)) ?? pictures[0];

/** A place's face (see above); undefined where no photo qualifies. A failed image search falls to the newest photos; a
 * failed metadata search fails the choice. */
export const choosePlaceFace = async (
  place: PlaceAt,
  { looks, newest }: PlaceSearches,
): Promise<string | undefined> => {
  const alike = await looks(placeFilter(place, false), PLACE_LOOKS).catch((): undefined => undefined);
  if (alike !== undefined) {
    return (firstBright(alike.filter(({ isFavorite }) => isFavorite)) ?? firstBright(alike))?.id;
  }
  for (const favourites of [true, false]) {
    const face = firstBright(await newest(placeFilter(place, favourites), PLACE_LOOKED_AT));
    if (face) {
      return face.id;
    }
  }
};
