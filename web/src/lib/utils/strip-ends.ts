// Local Omarchy layer: which items a sideways strip's ends would cut in two (the bar's years,
// components/timeline/TimelineWorkspaces: "2015 20›" on the Dell). An item is whole only inside the strip less an inset
// at each end that has more to scroll to, where the fade and its chevron lie; half a pixel of slack absorbs rounding.
export type Span = { left: number; right: number };

export const cutAtEnds = <K>(box: Span, items: Iterable<readonly [K, Span]>, start: number, end: number): Set<K> => {
  const left = box.left + start;
  const right = box.right - end;
  const cut = new Set<K>();
  for (const [key, span] of items) {
    if (span.left < left - 0.5 || span.right > right + 0.5) {
      cut.add(key);
    }
  }
  return cut;
};
