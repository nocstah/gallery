import { DIM_BELOW, isDim, thumbhashLight } from '$lib/utils/thumbhash-light';
import { BRIGHT, DIM, flatThumbhash } from '@test-data/thumbhash';

// Local Omarchy layer: a picture's light from its thumbhash alone, no image downloaded (utils/thumbhash-light)
describe('thumbhashLight', () => {
  it("reads a picture's light from its thumbhash's average colour, black 0 and white 1", () => {
    expect(thumbhashLight(flatThumbhash(0))).toBeCloseTo(0, 2);
    expect(thumbhashLight(flatThumbhash(255))).toBeCloseTo(1, 1);
    // sRGB's middle grey is a fifth of white's light
    expect(thumbhashLight(flatThumbhash(128))).toBeCloseTo(0.22, 1);
  });

  it('knows nothing without a thumbhash or of one it cannot read', () => {
    expect(thumbhashLight(null)).toBeUndefined();
    expect(thumbhashLight(undefined)).toBeUndefined();
    expect(thumbhashLight('')).toBeUndefined();
    expect(thumbhashLight('not base64!')).toBeUndefined();
  });
});

describe('isDim', () => {
  it('calls a picture dim under the floor, and one without a thumbhash too', () => {
    expect(thumbhashLight(DIM)).toBeLessThan(DIM_BELOW);
    expect(isDim(DIM)).toBe(true);
    expect(isDim(BRIGHT)).toBe(false);
    expect(isDim(null)).toBe(true);
  });
});
