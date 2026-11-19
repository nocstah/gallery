import { SessionStorageKey } from '#lib/constants.ts';
import { flushSync, tick } from 'svelte';
import { navigating } from '$app/state';
import { scrollMemory, scrollMemoryClearer } from './scroll-memory.svelte.ts';

// The setup's `$app/state` stand-in is a plain object: give its `to` a reactive value, as SvelteKit's own has, so the
// attachments follow a navigation
let to = $state<{ url: URL } | null>(null);
Object.defineProperty(navigating, 'to', { configurable: true, get: () => to });

const navigate = (path: string) => {
  to = { url: new URL(path, 'http://localhost') };
  flushSync();
};
const position = () => sessionStorage.getItem(SessionStorageKey.SCROLL_POSITION);

/** Runs an attachment as a template's {@attach} does: in an effect that tracks what it reads, torn down on destroy. */
const attach = (node: HTMLElement, attachment: (node: HTMLElement) => void | (() => void)) => {
  const destroy = $effect.root(() => {
    $effect(() => attachment(node));
  });
  flushSync();
  return { destroy };
};

beforeEach(() => {
  sessionStorage.clear();
  to = null;
});

afterEach(() => vi.unstubAllGlobals());

it('remembers the visited face and its screen offset when opening it', async () => {
  const node = document.createElement('div');
  const link = document.createElement('a');
  link.href = '/people/person-2?previousRoute=%2Fpeople';
  node.append(link);
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ top: 40, bottom: 840 } as DOMRect);
  vi.spyOn(link, 'getBoundingClientRect').mockReturnValue({ top: 280, bottom: 480 } as DOMRect);
  const action = attach(node, scrollMemory({ routeStartsWith: '/people', anchorSelector: 'a[href]' }));
  await tick();
  await tick();
  node.scrollTop = 2400;
  navigate('/people/person-2?previousRoute=%2Fpeople');
  expect(JSON.parse(sessionStorage.getItem(SessionStorageKey.SCROLL_ANCHOR)!)).toEqual({
    href: '/people/person-2?previousRoute=%2Fpeople',
    offset: 240,
  });
  expect(position()).toBe('2400');
  action.destroy();
});

it('keeps the face in place through row layout changes and releases it on user input', async () => {
  const node = document.createElement('div');
  const link = document.createElement('a');
  link.href = '/people/person-2';
  node.append(link);
  let rowTop = 1000;
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ top: 40 } as DOMRect);
  vi.spyOn(link, 'getBoundingClientRect').mockImplementation(() => ({ top: 40 + rowTop - node.scrollTop }) as DOMRect);
  vi.spyOn(node, 'scroll').mockImplementation((options?: number | ScrollToOptions) => {
    if (typeof options === 'object') {
      node.scrollTop = options.top ?? 0;
    }
  });
  let onResize!: () => void;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function (callback: () => void) {
      onResize = callback;
      return { observe: vi.fn(), disconnect };
    }),
  );
  sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '600');
  sessionStorage.setItem(SessionStorageKey.SCROLL_ANCHOR, JSON.stringify({ href: '/people/person-2', offset: 120 }));
  const action = attach(node, scrollMemory({ routeStartsWith: '/people', anchorSelector: 'a[href]' }));
  await vi.waitFor(() => expect(node.scrollTop).toBe(880));
  expect(link.getBoundingClientRect().top).toBe(160);
  rowTop = 1300;
  onResize();
  expect(node.scrollTop).toBe(1180);
  expect(link.getBoundingClientRect().top).toBe(160);

  dispatchEvent(new WheelEvent('wheel'));
  expect(disconnect).toHaveBeenCalledOnce();
  expect(node.style.overflowAnchor).not.toBe('none');
  rowTop = 1500;
  onResize();
  expect(node.scrollTop).toBe(1180);
  action.destroy();
});

it.each(['invalid', JSON.stringify({ href: '/people/removed-person', offset: 120 })])(
  'falls back to the saved offset when the anchor cannot be restored',
  async (anchor) => {
    const node = document.createElement('div');
    const scroll = vi.spyOn(node, 'scroll');
    sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '2400');
    sessionStorage.setItem(SessionStorageKey.SCROLL_ANCHOR, anchor);
    const action = attach(node, scrollMemory({ routeStartsWith: '/people', anchorSelector: 'a[href]' }));
    await vi.waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 2400, behavior: 'instant' }));
    expect(sessionStorage.getItem(SessionStorageKey.SCROLL_ANCHOR)).toBeNull();
    action.destroy();
  },
);

it('waits for content before restoring, then records a fresh position on the next visit', async () => {
  const node = document.createElement('div');
  const scroll = vi.spyOn(node, 'scroll');
  const saved = vi.fn();
  sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '2400');
  let ready!: () => void;
  const action = attach(
    node,
    scrollMemory({
      routeStartsWith: '/people',
      beforeSave: saved,
      beforeScroll: () => new Promise((resolve) => (ready = resolve)),
    }),
  );
  expect(scroll).not.toHaveBeenCalled();
  ready();
  await vi.waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 2400, behavior: 'instant' }));
  expect(position()).toBeNull();
  node.scrollTop = 3100;
  navigate('/people/person-2');
  expect(saved).toHaveBeenCalledOnce();
  expect(position()).toBe('3100');
  action.destroy();
});

it('does not let an abandoned restoration clear the next visits position', async () => {
  const node = document.createElement('div');
  const scroll = vi.spyOn(node, 'scroll');
  const clear = vi.fn();
  sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '2400');
  let ready!: () => void;
  const action = attach(
    node,
    scrollMemory({
      routeStartsWith: '/people',
      beforeClear: clear,
      beforeScroll: () => new Promise((resolve) => (ready = resolve)),
    }),
  );
  action.destroy();
  sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '3800');
  ready();
  await tick();
  await tick();
  expect(scroll).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  expect(position()).toBe('3800');
});

it('forgets a pending position when leaving the People section while restoration is loading', async () => {
  sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '2400');
  const clear = vi.fn();
  let ready!: () => void;
  const action = attach(
    document.createElement('div'),
    scrollMemory({
      routeStartsWith: '/people',
      beforeClear: clear,
      beforeScroll: () => new Promise((resolve) => (ready = resolve)),
    }),
  );
  navigate('/photos');
  expect(position()).toBeNull();
  expect(clear).toHaveBeenCalledOnce();
  action.destroy();
  ready();
  await tick();
});

it('keeps the position through a person page and clears it when leaving that section', () => {
  sessionStorage.setItem(SessionStorageKey.SCROLL_POSITION, '2400');
  const clear = vi.fn();
  const action = attach(
    document.createElement('div'),
    scrollMemoryClearer({ routeStartsWith: '/people', beforeClear: clear }),
  );
  navigate('/people');
  expect(position()).toBe('2400');
  navigate('/albums');
  expect(position()).toBeNull();
  expect(clear).toHaveBeenCalledOnce();
  action.destroy();
});
