import { onPageKey, pageStep } from '$lib/utils/page-keys';

// Local Omarchy layer: Page Up / Page Down page the main view wherever the focus is
describe('page keys', () => {
  const view = () => {
    const element = document.createElement('section');
    element.style.overflowY = 'auto';
    Object.defineProperties(element, { clientHeight: { value: 800 }, scrollHeight: { value: 10_000 } });
    element.scrollTo = vi.fn() as typeof element.scrollTo;
    const tile = document.createElement('div');
    element.append(tile);
    document.body.append(element);
    document.elementFromPoint = () => tile;
    return element;
  };

  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    onPageKey(event);
    return event;
  };

  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('pages by a screen less a little overlap, as the browser does', () => {
    expect(pageStep(800)).toBe(760);
    expect(pageStep(200)).toBe(175);
  });

  it('pages the view under the middle of the window while focus is outside it', () => {
    const element = view();
    expect(press('PageDown').defaultPrevented).toBe(true);
    expect(element.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 760 }));
  });

  it('jumps at once, each press from where the view is, so presses in a row page as fast as they come', () => {
    const element = view();
    let top = 0;
    Object.defineProperty(element, 'scrollTop', { get: () => top });
    vi.mocked(element.scrollTo).mockImplementation(((options: ScrollToOptions) => {
      top = options.top ?? top;
    }) as typeof element.scrollTo);

    press('PageDown');
    press('PageDown');

    expect(element.scrollTo).toHaveBeenNthCalledWith(1, { top: 760, behavior: 'instant' });
    expect(element.scrollTo).toHaveBeenNthCalledWith(2, { top: 1520, behavior: 'instant' });
  });

  it('never pages above the top', () => {
    const element = view();
    press('PageUp');
    expect(element.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('leaves a field to the field', () => {
    const element = view();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(press('PageDown').defaultPrevented).toBe(false);
    expect(element.scrollTo).not.toHaveBeenCalled();
  });

  it('leaves other keys alone', () => {
    view();
    expect(press('ArrowDown').defaultPrevented).toBe(false);
  });
});
