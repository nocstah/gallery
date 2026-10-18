// Local Omarchy layer: a Live Photo's mark on its tile (DESIGN.md, Photo Tile), as the phone that took it draws one: a
// dot in a ring in a ring of dots, on Material's 24px grid like the icons beside it. It had worn the motion mark, a
// play triangle in a circle that read as a video's play icon on 52 of 55 tiles of an iPhone album.

const round = (value: number) => Math.round(value * 100) / 100;

/** A circle as a path, clockwise or not: a ring is its outer circle one way and its inner one the other. */
const circle = (radius: number, clockwise: boolean, x = 12, y = 12) => {
  const sweep = clockwise ? 1 : 0;
  return `M${round(x)} ${round(y - radius)}a${radius} ${radius} 0 1 ${sweep} 0 ${2 * radius}a${radius} ${radius} 0 1 ${sweep} 0 ${-2 * radius}z`;
};

const DOTS = 16;
const dots = Array.from({ length: DOTS }, (_, index) => {
  const angle = (2 * Math.PI * index) / DOTS;
  return circle(0.95, true, 12 + 9.75 * Math.sin(angle), 12 - 9.75 * Math.cos(angle));
});

export const livePhotoMark = [circle(3, true), circle(7, true), circle(5.25, false), ...dots].join('');
