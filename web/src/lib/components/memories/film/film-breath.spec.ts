import { BREATH_FADE_MS, BREATH_HOLD_MS, HAND_ON_MS, REDUCED_FADE_MS, handOnTiming } from './film-breath';

// Local Omarchy layer: Room breathes between films (DESIGN.md, Ink): a film that ends by itself fades more slowly and
// holds the black a moment; a person moving on is answered as fast as before
describe('handOnTiming', () => {
  it('answers a person at once: the fade alone, then the next film', () => {
    expect(handOnTiming(false, false)).toEqual({ fadeMs: HAND_ON_MS, waitMs: HAND_ON_MS });
    expect(HAND_ON_MS).toBe(650);
  });

  it('lets a film that ended by itself go slower, then holds the black before the next', () => {
    const timing = handOnTiming(true, false);
    expect(timing.fadeMs).toBe(BREATH_FADE_MS);
    expect(timing.fadeMs).toBeGreaterThan(HAND_ON_MS);
    expect(timing.waitMs).toBe(BREATH_FADE_MS + BREATH_HOLD_MS);
  });

  it('with reduced motion goes to black at once, and keeps the held black, which is stillness', () => {
    expect(handOnTiming(false, true)).toEqual({ fadeMs: REDUCED_FADE_MS, waitMs: REDUCED_FADE_MS });
    expect(handOnTiming(true, true)).toEqual({ fadeMs: REDUCED_FADE_MS, waitMs: REDUCED_FADE_MS + BREATH_HOLD_MS });
  });
});
