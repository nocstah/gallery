// Local Omarchy layer: ma between films (DESIGN.md, Ink: Room breathes between films). A film in a chain (Room) hands
// on to the next through black: as fast as before when a person asks for it (↑, ↓, Up next, a remote's keys, → on the
// last photo), and, when a film ends by itself, slower, the room then held in black a moment before the next film's
// title card comes up out of it. With reduced motion the black comes at once, and a film that ends by itself still
// keeps the held black, which is stillness, not motion.

/** a hand-on a person asked for: the picture and the music go to black over this, then the next film takes over */
export const HAND_ON_MS = 650;
/** a film that ended by itself goes to black more slowly */
export const BREATH_FADE_MS = 900;
/** and the room stays black this long before the next film takes over */
export const BREATH_HOLD_MS = 1200;
/** with reduced motion the black comes at once */
export const REDUCED_FADE_MS = 150;

export type HandOnTiming = {
  /** how long the picture takes to go to black */
  fadeMs: number;
  /** how long until the next film takes over */
  waitMs: number;
};

/** How a film in a chain hands on: a film that ended by itself breathes, one a person moved on from does not. */
export const handOnTiming = (byItself: boolean, reducedMotion: boolean): HandOnTiming => {
  const fadeMs = reducedMotion ? REDUCED_FADE_MS : byItself ? BREATH_FADE_MS : HAND_ON_MS;
  return { fadeMs, waitMs: fadeMs + (byItself ? BREATH_HOLD_MS : 0) };
};
