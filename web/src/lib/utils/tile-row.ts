// Local Omarchy layer: a row of square tiles at least `min` wide on the desktop's gap (Explore's Recently added): as
// many as fit; a row with fewer tiles than that widens them to fill it, as a short row of photos does (DESIGN.md,
// Layout), by up to `stretch` times their smallest, or keeps them that wide and stays short.

/** How many columns a row of `count` tiles takes in `width` px. */
export const tileRowColumns = (
  width: number,
  count: number,
  { min, gap, stretch = 1.35 }: { min: number; gap: number; stretch?: number },
) => {
  const fit = Math.max(1, Math.floor((width + gap) / (min + gap)));
  if (count >= fit) {
    return fit;
  }
  return Math.max(count, Math.floor((width + gap) / (min * stretch + gap)), 1);
};
