import { AssetTypeEnum, AssetVisibility, type SearchFilter } from '@immich/sdk';
import { choosePlaceFace, firstBright, placeFilter, type PlacePicture } from '$lib/utils/place-faces';
import { BRIGHT, DIM } from '@test-data/thumbhash';

// Local Omarchy layer: a place's face is a photo without people, by the folder rule (utils/place-faces)
const riverton = { city: 'Riverton', country: 'Examplestan' };
const picture = (id: string, thumbhash: string | null = BRIGHT): PlacePicture => ({ id, thumbhash });

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
  it('fronts a place with a favourite photo without people first', async () => {
    const search = vi.fn((filter: SearchFilter) =>
      Promise.resolve(filter.isFavorite ? [picture('kept')] : [picture('any')]),
    );

    expect(await choosePlaceFace(riverton, search)).toBe('kept');
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(placeFilter(riverton, true), 3);
  });

  it('then a photo without people, and nothing where the place has none', async () => {
    const search = vi.fn((filter: SearchFilter) => Promise.resolve(filter.isFavorite ? [] : [picture('any')]));
    expect(await choosePlaceFace(riverton, search)).toBe('any');

    expect(await choosePlaceFace(riverton, () => Promise.resolve([]))).toBeUndefined();
  });
});

describe('firstBright', () => {
  it('takes the first that is not dim, else the first', () => {
    expect(firstBright([picture('night', DIM), picture('day')])?.id).toBe('day');
    expect(firstBright([picture('night', DIM), picture('dusk', DIM)])?.id).toBe('night');
    expect(firstBright([])).toBeUndefined();
  });
});
