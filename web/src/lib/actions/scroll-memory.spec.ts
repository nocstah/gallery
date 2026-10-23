import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { SessionStorageKey } from '$lib/constants';
import { scrollMemory, scrollMemoryClearer } from './scroll-memory';

const navigation = writable<{ to: { url: URL } } | null>(null);
vi.mock('$app/stores', () => ({
  navigating: { subscribe: (run: Parameters<typeof navigation.subscribe>[0]) => navigation.subscribe(run) },
}));

const navigate = (path: string) => navigation.set({ to: { url: new URL(path, 'http://localhost') } });
const position = () => sessionStorage.getItem(SessionStorageKey.SCROLL_POSITION);

beforeEach(() => {
  sessionStorage.clear();
  navigation.set(null);
});

afterEach(() => vi.unstubAllGlobals());

it('remembers the visited face and its screen offset when opening it', async () => {
  const node = document.createElement('div');
  const link = document.createElement('a');
  link.href = '/people/person-2?previousRoute=%2Fpeople';
  node.append(link);
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ top: 40, bottom: 840 } as DOMRect);
  vi.spyOn(link, 'getBoundingClientRect').mockReturnValue({ top: 280, bottom: 480 } as DOMRect);
  const action = scrollMemory(node, { routeStartsWith: '/people', anchorSelector: 'a[href]' });
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
    if (typeof options === 'object') node.scrollTop = options.top ?? 0;
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
  const action = scrollMemory(node, { routeStartsWith: '/people', anchorSelector: 'a[href]' });
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
    const action = scrollMemory(node, { routeStartsWith: '/people', anchorSelector: 'a[href]' });
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
  const action = scrollMemory(node, {
    routeStartsWith: '/people',
    beforeSave: saved,
    beforeScroll: () => new Promise((resolve) => (ready = resolve)),
  });
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
  const action = scrollMemory(node, {
    routeStartsWith: '/people',
    beforeClear: clear,
    beforeScroll: () => new Promise((resolve) => (ready = resolve)),
  });
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
  const action = scrollMemory(document.createElement('div'), {
    routeStartsWith: '/people',
    beforeClear: clear,
    beforeScroll: () => new Promise((resolve) => (ready = resolve)),
  });
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
  const action = scrollMemoryClearer(document.createElement('div'), { routeStartsWith: '/people', beforeClear: clear });
  navigate('/people');
  expect(position()).toBe('2400');
  navigate('/albums');
  expect(position()).toBeNull();
  expect(clear).toHaveBeenCalledOnce();
  action.destroy();
});
