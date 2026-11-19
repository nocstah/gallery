import {
  PEEKING_ATTR,
  PEEK_CAPTION_PX,
  PEEK_HOLD_MS,
  PEEK_MARGIN_PX,
  closePeek,
  installTilePeek,
  peekBox,
} from '#lib/utils/tile-peek.ts';

describe('peekBox', () => {
  it('fills the window as far as the photo’s shape allows, the margin and the caption line kept', () => {
    const wide = peekBox(3 / 2, { width: 1500, height: 900 });
    expect(wide.height).toBeCloseTo(900 - 2 * PEEK_MARGIN_PX - PEEK_CAPTION_PX);
    expect(wide.width).toBeCloseTo(wide.height * 1.5);
    expect(wide.left).toBeCloseTo((1500 - wide.width) / 2);
    expect(wide.top).toBeCloseTo(PEEK_MARGIN_PX);
    const panorama = peekBox(4, { width: 1500, height: 900 });
    expect(panorama.width).toBeCloseTo(1500 - 2 * PEEK_MARGIN_PX);
    expect(panorama.top + panorama.height / 2).toBeCloseTo((900 - PEEK_CAPTION_PX) / 2);
  });

  it('takes a photo of no known shape as a square', () => {
    const box = peekBox(NaN, { width: 1000, height: 1000 });
    expect(box.width).toBeCloseTo(box.height);
  });
});

describe('installTilePeek', () => {
  let uninstall: () => void;
  const root = () => document.querySelector('.ws-peek');
  const press = (key: string, init: KeyboardEventInit = {}, on: EventTarget = document.body) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    on.dispatchEvent(event);
    return event;
  };
  const releaseSpace = () =>
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
  const tile = () => {
    const frame = document.createElement('div');
    frame.dataset.thumbnailFocusContainer = '';
    frame.dataset.asset = 'asset-1';
    frame.tabIndex = 0;
    const media = document.createElement('div');
    media.className = 'ws-tile-media';
    const image = document.createElement('img');
    image.src = 'http://localhost/api/assets/asset-1/thumbnail?size=thumbnail&c=x';
    const place = document.createElement('p');
    place.className = 'ws-place';
    place.textContent = '18 Nov 2026 · Somewhere';
    media.append(image, place);
    frame.append(media);
    document.body.append(frame);
    media.getBoundingClientRect = () => DOMRect.fromRect({ x: 100, y: 100, width: 120, height: 80 });
    return { frame, image };
  };
  const point = (at: Element) => at.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

  beforeEach(() => {
    vi.useFakeTimers();
    uninstall = installTilePeek();
  });

  afterEach(() => {
    uninstall();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('shows the photo under the pointer on Space, its tile empty meanwhile, and puts it back on Space', async () => {
    const { frame, image } = tile();
    point(image);
    const opening = press(' ');
    expect(opening.defaultPrevented).toBe(true);
    expect(root()).not.toBeNull();
    expect(frame.hasAttribute(PEEKING_ATTR)).toBe(true);
    expect(root()?.querySelector('.ws-peek-caption')?.textContent).toBe('18 Nov 2026 · Somewhere');
    const sources = [...(root()?.querySelectorAll('img') ?? [])].map((layer) => layer.getAttribute('src'));
    expect(sources.some((source) => source?.includes('size=preview'))).toBe(true);
    releaseSpace();
    expect(root()).not.toBeNull();
    press(' ');
    await vi.runAllTimersAsync();
    expect(root()).toBeNull();
    expect(frame.hasAttribute(PEEKING_ATTR)).toBe(false);
  });

  it('peeks the photo with focus when the pointer is on none', () => {
    const { frame } = tile();
    press(' ', {}, frame);
    expect(root()).not.toBeNull();
  });

  it('leaves Space to the page where no photo is pointed at, in a text field, or with a modifier', () => {
    const { image } = tile();
    expect(press(' ').defaultPrevented).toBe(false);
    point(image);
    const field = document.createElement('input');
    document.body.append(field);
    expect(press(' ', {}, field).defaultPrevented).toBe(false);
    expect(press(' ', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(root()).toBeNull();
  });

  it('puts the photo back on Escape, without the page seeing it', async () => {
    const { image } = tile();
    point(image);
    press(' ');
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    press('Escape');
    await vi.runAllTimersAsync();
    document.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
    expect(root()).toBeNull();
  });

  it('shows the photo only while Space is held, when it is held', async () => {
    const { image } = tile();
    point(image);
    press(' ');
    vi.advanceTimersByTime(PEEK_HOLD_MS + 50);
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + PEEK_HOLD_MS + 50);
    releaseSpace();
    await vi.runAllTimersAsync();
    expect(root()).toBeNull();
  });

  it('opens the photo with Enter, by its tile', () => {
    const { frame, image } = tile();
    const opened = vi.fn();
    frame.addEventListener('click', opened);
    point(image);
    press(' ');
    press('Enter');
    expect(opened).toHaveBeenCalledOnce();
  });

  it('goes at once when the page changes under it', () => {
    const { frame, image } = tile();
    point(image);
    press(' ');
    closePeek();
    expect(root()).toBeNull();
    expect(frame.hasAttribute(PEEKING_ATTR)).toBe(false);
  });
});
