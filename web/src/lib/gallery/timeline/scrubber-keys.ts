// Local Omarchy layer: the keys the timeline's scrubber keeps for itself once a click on it gave it the focus. Immich's
// handler (components/timeline/Timeline.svelte) cancelled every key that reached it, Page Up and Page Down included, so
// after jumping to a year on the scrubber those pages did nothing but nudge it (the owner: "page up and down ... after I
// click on the right hand navigation bar ... microscopic movement"). It keeps the arrows, as before, and leaves every
// other key alone, so Page Up and Page Down reach utils/page-keys and page the photos.

/** The scrubber's own keys: Arrow Down scrolls a little (Shift: more); Arrow Up does only with Shift, as the scrubber
 * itself steps a month back on Arrow Up. */
export const onScrubberKey = (event: KeyboardEvent, scrollable: HTMLElement | undefined, shift: boolean) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return;
  }
  event.preventDefault();
  const amount = shift ? 500 : 50;
  if (event.key === 'ArrowDown') {
    scrollable?.scrollBy({ top: amount, behavior: 'smooth' });
  } else if (shift) {
    scrollable?.scrollBy({ top: -amount, behavior: 'smooth' });
  }
};
