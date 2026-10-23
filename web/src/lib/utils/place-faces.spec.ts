import { AssetTypeEnum, AssetVisibility, type SearchFilter } from '@immich/sdk';
import {
  choosePlaceFace,
  firstBright,
  PLACE_LOOKED_AT,
  PLACE_LOOKS,
  placeFilter,
  type PlacePicture,
} from '$lib/utils/place-faces';
import { BRIGHT, DIM } from '@test-data/thumbhash';

// Local Omarchy layer: a place's face is a photo without people that looks like the place (utils/place-faces)
const riverton = { city: 'Riverton', country: 'Examplestan' };
const picture = (id: string, more: Partial<PlacePicture> = {}): PlacePicture => ({ id, thumbhash: BRIGHT, ...more });
const never = () => Promise.reject(new Error('not asked'));

describe('placeFilter', () => {
  it("asks for the place's images on the timeline with a camera's data and no face in them", () => {
    expect(placeFilter(riverton, false)).toEqual({
      city: { eq: 'Riverton' },
      country: { eq: 'Examplestan' },
      type: { eq: AssetTypeEnum.Image },
      visibility: { eq: AssetVisibility.Timeline },
      make: { ne: null },
      hasPeople: { eq: false },
    });
    expect(placeFilter(riverton, true)).toMatchObject({ isFavorite: { eq: true } });
    expect(placeFilter({ city: 'Riverton', country: null }, false)).not.toHaveProperty('country');
  });
});

describe('choosePlaceFace', () => {
  it('fronts a place with the photo that looks most like one, a favourite among the six first', async () => {
    const looks = vi.fn(() =>
      Promise.resolve([
        picture('view'),
        picture('dim kept', { isFavorite: true, thumbhash: DIM }),
        picture('kept', { isFavorite: true }),
      ]),
    );

    expect(await choosePlaceFace(riverton, { looks, newest: never })).toBe('kept');
    expect(looks).toHaveBeenCalledWith(placeFilter(riverton, false), PLACE_LOOKS);
  });

  it('else the first of them that is not dim, and nothing where the place has no such photo', async () => {
    const looks = () => Promise.resolve([picture('night', { thumbhash: DIM }), picture('view')]);
    expect(await choosePlaceFace(riverton, { looks, newest: never })).toBe('view');

    expect(await choosePlaceFace(riverton, { looks: () => Promise.resolve([]), newest: never })).toBeUndefined();
  });

  it("without Gallery's image search, its favourites with no face found first, then its photos so", async () => {
    const newest = vi.fn((filter: SearchFilter) => Promise.resolve(filter.isFavorite ? [] : [picture('any')]));

    expect(await choosePlaceFace(riverton, { looks: never, newest })).toBe('any');
    expect(newest).toHaveBeenNthCalledWith(1, placeFilter(riverton, true), PLACE_LOOKED_AT);
    expect(newest).toHaveBeenNthCalledWith(2, placeFilter(riverton, false), PLACE_LOOKED_AT);
  });
});

describe('firstBright', () => {
  it('takes the first that is not dim, else the first', () => {
    expect(firstBright([picture('night', { thumbhash: DIM }), picture('day')])?.id).toBe('day');
    expect(firstBright([picture('night', { thumbhash: DIM }), picture('dusk', { thumbhash: DIM })])?.id).toBe('night');
    expect(firstBright([])).toBeUndefined();
  });
});
