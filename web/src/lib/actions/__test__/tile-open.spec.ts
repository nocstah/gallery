// happy-dom has no layout and never reports intersections, so the observer is a stub the test drives: it says when a
// tile is seen and where it sits on the screen.
type TileOpen = (typeof import('$lib/actions/tile-open'))['tileOpen'];

let tileOpen: TileOpen;
let seen: IntersectionObserverCallback;
const observe = vi.fn();
const unobserve = vi.fn();
let reduced = false;

const tile = () => {
  const node = document.createElement('div');
  document.body.append(node);
  return node;
};

const box = (left: number, top: number) => ({ left, top, right: left + 200, bottom: top + 200 }) as DOMRectReadOnly;

const comeIntoView = (...tiles: Array<{ node: HTMLElement; left?: number; top?: number }>) =>
  seen(
    tiles.map(
      ({ node, left = 0, top = 0 }) =>
        ({
          target: node,
          isIntersecting: true,
          boundingClientRect: box(left, top),
        }) as unknown as IntersectionObserverEntry,
    ),
    {} as IntersectionObserver,
  );

const end = (node: HTMLElement, animationName: string) =>
  node.dispatchEvent(Object.assign(new Event('animationend'), { animationName }));

const delayOf = (node: HTMLElement) => Number(node.style.getPropertyValue('--ws-open-delay').replace(/ms$/, ''));

const scroller = () => {
  const element = document.createElement('div');
  document.body.append(element);
  const metrics = { top: 0 };
  Object.defineProperties(element, {
    clientHeight: { configurable: true, get: () => 1000 },
    scrollTop: { configurable: true, get: () => metrics.top },
  });
  return {
    scrollTo: (top: number) => {
      metrics.top = top;
      element.dispatchEvent(new Event('scroll'));
    },
  };
};

beforeEach(async () => {
  reduced = false;
  observe.mockReset();
  unobserve.mockReset();
  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn(function (callback: IntersectionObserverCallback) {
      seen = callback;
      return { observe, unobserve, disconnect: vi.fn() };
    }),
  );
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), media: query }));
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 1000);
  // a fresh module each time: what it learnt from earlier scrolling stays with the earlier test
  vi.resetModules();
  ({ tileOpen } = await import('$lib/actions/tile-open'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.documentElement.style.removeProperty('--ws-open-ms');
  document.documentElement.style.removeProperty('--ws-fade-in-ms');
});

describe('tileOpen', () => {
  it('waits on its first frame until the tile is seen, then opens it', () => {
    const node = tile();
    tileOpen(node);

    expect(node.dataset.wsOpen).toBe('waiting');
    expect(observe).toHaveBeenCalledWith(node);

    comeIntoView({ node });

    expect(node.dataset.wsOpen).toBe('open');
    expect(delayOf(node)).toBe(0);
    expect(unobserve).toHaveBeenCalledWith(node);
  });

  it('ripples a screen that opens at once in reading order, quickly', () => {
    const first = tile();
    const along = tile();
    const below = tile();
    const far = tile();
    for (const node of [first, along, below, far]) {
      tileOpen(node);
    }

    comeIntoView(
      { node: far, left: 900, top: 950 },
      { node: below, left: 0, top: 500 },
      { node: along, left: 500, top: 0 },
      { node: first, left: 0, top: 0 },
    );

    expect(delayOf(first)).toBe(0);
    expect(delayOf(along)).toBeGreaterThan(0);
    expect(delayOf(below)).toBeGreaterThan(delayOf(along));
    expect(delayOf(far)).toBeLessThanOrEqual(280);
  });

  it('lets the tile be once both of the window animations have ended', () => {
    const node = tile();
    tileOpen(node);
    comeIntoView({ node });

    end(node, 'ws-open');
    expect(node.dataset.wsOpen).toBe('open');

    end(node, 'ws-fade-in');
    expect(node.dataset.wsOpen).toBeUndefined();
    expect(node.style.getPropertyValue('--ws-open-delay')).toBe('');
  });

  it('shows tiles at once right after a jump of more than a screen (the scrubber, a year switch)', () => {
    const waiting = tile();
    tileOpen(waiting); // the first tile starts the watch on scrolling
    const view = scroller();
    view.scrollTo(100);

    view.scrollTo(8000);
    comeIntoView({ node: waiting });
    const arriving = tile();
    tileOpen(arriving);

    expect(waiting.dataset.wsOpen).toBeUndefined();
    expect(arriving.dataset.wsOpen).toBeUndefined();
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it('keeps opening tiles while the view scrolls at an easy pace', async () => {
    tileOpen(tile());
    const view = scroller();
    view.scrollTo(0);
    await new Promise((resolve) => setTimeout(resolve, 40));
    view.scrollTo(60);

    const node = tile();
    tileOpen(node);

    expect(node.dataset.wsOpen).toBe('waiting');
  });

  it('leaves tiles alone under reduced motion', () => {
    reduced = true;
    const node = tile();
    tileOpen(node);

    expect(node.dataset.wsOpen).toBeUndefined();
    expect(observe).not.toHaveBeenCalled();
  });

  it('leaves tiles alone when the desktop has its window animations off', () => {
    document.documentElement.style.setProperty('--ws-open-ms', '0ms');
    document.documentElement.style.setProperty('--ws-fade-in-ms', '0ms');
    const node = tile();
    tileOpen(node);

    expect(node.dataset.wsOpen).toBeUndefined();
  });

  it('never holds a tile in a hidden tab, where nothing would ever play', () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try {
      const node = tile();
      tileOpen(node);

      expect(node.dataset.wsOpen).toBeUndefined();
    } finally {
      delete (document as { hidden?: boolean }).hidden;
    }
  });

  it('does nothing for a grid that does not ask for it', () => {
    const node = tile();
    tileOpen(node, false);

    expect(node.dataset.wsOpen).toBeUndefined();
  });
});
