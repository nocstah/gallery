import { onScrubberKey } from '$lib/gallery/timeline/scrubber-keys';
import { onPageKey } from '$lib/utils/page-keys';

// Local Omarchy layer: once a click gave the scrubber the focus, Page Up / Page Down still page the photos
describe('scrubber keys', () => {
  const scrollable = () => {
    const element = document.createElement('section');
    element.style.overflowY = 'auto';
    Object.defineProperties(element, { clientHeight: { value: 800 }, scrollHeight: { value: 10_000 } });
    element.scrollTo = vi.fn() as typeof element.scrollTo;
    element.scrollBy = vi.fn() as typeof element.scrollBy;
    const tile = document.createElement('div');
    element.append(tile);
    document.body.append(element);
    document.elementFromPoint = () => tile;
    return element;
  };

  /** The scrubber as the timeline draws it: focusable, beside the photos, its keys going to onScrubberKey. */
  const scrubber = (photos: HTMLElement) => {
    const element = document.createElement('div');
    element.tabIndex = 0;
    element.setAttribute('role', 'scrollbar');
    element.addEventListener('keydown', (event) => onScrubberKey(event, photos, false));
    document.body.append(element);
    element.focus();
    return element;
  };

  const press = (target: HTMLElement, key: string) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
    target.dispatchEvent(event);
    onPageKey(event); // the window's handler, as routes/(user)/+layout.svelte adds it
    return event;
  };

  beforeEach(() => {
    document.body.replaceChildren();
  });

  it.each(['PageDown', 'PageUp'])('lets %s through to the page turn, which pages the photos', (key) => {
    const photos = scrollable();
    const bar = scrubber(photos);

    const event = press(bar, key);

    expect(document.activeElement).toBe(bar);
    expect(photos.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: key === 'PageDown' ? 760 : 0 }));
    expect(photos.scrollBy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true); // by the page turn, not by the scrubber
  });

  it('keeps Arrow Down, a small scroll (more with Shift), as before', () => {
    const photos = scrollable();
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    onScrubberKey(down, photos, false);
    expect(down.defaultPrevented).toBe(true);
    expect(photos.scrollBy).toHaveBeenLastCalledWith({ top: 50, behavior: 'smooth' });
    onScrubberKey(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }), photos, true);
    expect(photos.scrollBy).toHaveBeenLastCalledWith({ top: 500, behavior: 'smooth' });
  });

  it('keeps Arrow Up for itself, scrolling back only with Shift, as before', () => {
    const photos = scrollable();
    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    onScrubberKey(up, photos, false);
    expect(up.defaultPrevented).toBe(true);
    expect(photos.scrollBy).not.toHaveBeenCalled();
    onScrubberKey(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }), photos, true);
    expect(photos.scrollBy).toHaveBeenLastCalledWith({ top: -500, behavior: 'smooth' });
  });

  it('leaves every other key alone', () => {
    for (const key of ['Home', 'End', ' ', 'a', 'Escape']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      onScrubberKey(event, scrollable(), false);
      expect(event.defaultPrevented).toBe(false);
    }
  });
});
