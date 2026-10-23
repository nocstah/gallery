// Local Omarchy layer: which photo fronts a place on Places and in Explore's row (DESIGN.md, Places; managers/place-faces
// asks Gallery). Gallery lists one photo per city, the first its index finds: 9 of the first 12 places on the owner's
// Places page showed people (critique 2026-10-23: 6 of a phone's first 8). The owner's decision, "Best photo, by the
// folder rule" (utils/folder-faces), for a place without people: its favourite photos with a camera's data and no face
// found in them first, else its photos with a camera's data and no face, each the first of the newest few that is not
// dim (utils/thumbhash-light), else the newest of them; the server's photo where there is none (a place of portraits
// only). Gallery's search answers it, for every account, from what the account may see: a camera's data rules out
// screenshots and pictures sent through chat apps, the timeline's visibility the slips, receipts and documents Gallery
// archives, and the type videos.
import { AssetTypeEnum, AssetVisibility, type SearchFilter } from '@immich/sdk';
import { isDim } from '$lib/utils/thumbhash-light';

export type PlaceAt = { city: string; country?: string | null };
export type PlacePicture = { id: string; thumbhash: string | null };
/** A search of the place's photos: those matching `filter`, newest first, `size` at most. */
export type PlaceSearch = (filter: SearchFilter, size: number) => Promise<PlacePicture[]>;

/** The newest photos of a kind looked at for one that is not dim. */
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

/** A place's face: its favourites without people first, then its photos without people; undefined where none. */
export const choosePlaceFace = async (place: PlaceAt, search: PlaceSearch): Promise<string | undefined> => {
  for (const favourites of [true, false]) {
    const face = firstBright(await search(placeFilter(place, favourites), PLACE_LOOKED_AT));
    if (face) {
      return face.id;
    }
  }
};
