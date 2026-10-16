import type { SharedSpaceResponseDto } from '@immich/sdk';
import {
  accepts,
  dropSpring,
  dropTarget,
  EDGE,
  LEAVE_MS,
  offerFor,
  sidebarDrop,
  sourceOf,
  SPRING_MS,
  type Carry,
  type DropTarget,
} from '$lib/managers/sidebar-drop.svelte';
import type { SpecialAlbumManager } from '$lib/managers/special-albums.svelte';
import type { TimelineAsset } from '$lib/managers/timeline-manager/types';

// Local Omarchy layer: photos carried to the sidebar (managers/sidebar-drop): which rows take them, what the carried
// photo says, and folders that spring open under it and close again. happy-dom has no layout, so the tests hand the
// manager the elements under the pointer and give the sidebar its size where it matters.
const asset = (id: string, ownerId = 'me', city: string | null = null) =>
  ({ id, ownerId, city, country: null, localDateTime: { year: 2023, month: 3, day: 12 } }) as unknown as TimelineAsset;

const carry = (overrides: Partial<Carry> = {}): Carry => ({
  ids: ['a', 'b'],
  assets: [asset('a'), asset('b')],
  source: {},
  me: 'me',
  ...overrides,
});

const special = (albumId: string) =>
  ({ isAlbum: (id?: string | null) => id === albumId, words: { move: 'todo_move' } }) as unknown as SpecialAlbumManager;
const space = (id: string, name = 'Family') => ({ id, name }) as SharedSpaceResponseDto;

describe('sidebar drop: which rows take the photos', () => {
  it('takes them into an album I may add to, never the album they come from', () => {
    const album: DropTarget = { kind: 'album', id: 'bali', name: 'Bali', writable: true };
    expect(accepts(album, carry())).toBe(true);
    expect(accepts(album, carry({ source: { albumId: 'bali' } }))).toBe(false);
    expect(accepts({ ...album, writable: false }, carry())).toBe(false);
    expect(accepts(album, carry({ ids: [], assets: [] }))).toBe(false);
  });

  it('moves my photos to To do, Villa or QR, but not back into the one they are in', () => {
    const todo: DropTarget = { kind: 'special', special: special('todo-album'), name: 'To do' };
    expect(accepts(todo, carry())).toBe(true);
    expect(accepts(todo, carry({ source: { albumId: 'todo-album' } }))).toBe(false);
    // someone else's photos cannot go there at all
    expect(accepts(todo, carry({ assets: [asset('a', 'partner')] }))).toBe(false);
  });

  it('adds my photos to a Space I edit, not to the one on screen', () => {
    const family: DropTarget = { kind: 'space', space: space('family'), writable: true };
    expect(accepts(family, carry())).toBe(true);
    expect(accepts(family, carry({ source: { spaceId: 'family' } }))).toBe(false);
    expect(accepts({ ...family, writable: false }, carry())).toBe(false);
    expect(accepts(family, carry({ assets: [asset('a', 'partner')], me: 'me' }))).toBe(false);
  });

  it('makes a new album of photos when some are mine', () => {
    expect(accepts({ kind: 'new-album' }, carry())).toBe(true);
    expect(accepts({ kind: 'new-album' }, carry({ me: undefined }))).toBe(false);
  });

  it('says what a drop would do, a new album with the name it gets', () => {
    expect(offerFor({ kind: 'album', id: 'bali', name: 'Bali', writable: true }, carry()).label).toBe('drop_add_to');
    expect(offerFor({ kind: 'special', special: special('x'), name: 'To do' }, carry()).label).toBe('todo_move');
    const made = offerFor({ kind: 'new-album' }, carry({ assets: [asset('a', 'me', 'Phuket')] }));
    expect(made.label).toBe('sidebar_new_album');
    expect(made.detail).toMatch(/^Phuket · /);
  });

  it('knows the album or Space on screen', () => {
    expect(sourceOf('/photos')).toEqual({});
    expect(sourceOf('/albums')).toEqual({});
    expect(sourceOf('/albums/abc')).toEqual({ albumId: 'abc' });
    expect(sourceOf('/albums/abc/photos/def')).toEqual({ albumId: 'abc' });
    expect(sourceOf('/spaces/s1')).toEqual({ spaceId: 's1' });
    expect(sourceOf('/spaces/s1/albums/abc')).toEqual({ albumId: 'abc', spaceId: 's1' });
  });
});

describe('sidebar drop: over the sidebar', () => {
  let nav: HTMLElement;
  let panel: HTMLElement;

  const row = (target?: DropTarget, parent: HTMLElement = panel) => {
    const element = document.createElement('div');
    parent.append(element);
    dropTarget(element, target);
    return element;
  };

  const folder = (open = false) => {
    const group = document.createElement('li');
    group.dataset.dropGroup = '';
    panel.append(group);
    const head = document.createElement('div');
    group.append(head);
    const state = { open };
    const spring = {
      isOpen: () => state.open,
      open: vi.fn(() => (state.open = true)),
      close: vi.fn(() => (state.open = false)),
    };
    dropSpring(head, spring);
    return { group, head, spring, state };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    nav = document.createElement('nav');
    nav.id = 'sidebar';
    nav.dataset.layout = 'expanded';
    panel = document.createElement('div');
    panel.dataset.testid = 'sidebar-panel';
    nav.append(panel);
    document.body.append(nav);
  });

  afterEach(() => {
    sidebarDrop.end();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('is there to drop on only while the sidebar is on screen', () => {
    expect(sidebarDrop.available()).toBe(true);
    nav.dataset.layout = 'rail';
    expect(sidebarDrop.available()).toBe(true);
    nav.dataset.layout = 'overlay';
    expect(sidebarDrop.available()).toBe(false);
    nav.dataset.layout = 'hidden';
    expect(sidebarDrop.available()).toBe(false);
  });

  it('lights the row that takes the photos, and only while they are carried', () => {
    const bali = row({ kind: 'album', id: 'bali', name: 'Bali', writable: true });
    const links = row();

    expect(sidebarDrop.hover([bali])).toBeNull();
    sidebarDrop.begin(carry());
    expect(sidebarDrop.hover([bali])).toEqual({ label: 'drop_add_to' });
    expect(bali.dataset.dropTarget).toBeDefined();
    expect(sidebarDrop.target).toMatchObject({ kind: 'album', id: 'bali' });

    // a row that takes nothing says nothing, and the light leaves the last row
    expect(sidebarDrop.hover([links])).toEqual({});
    expect(bali.dataset.dropTarget).toBeUndefined();
    expect(sidebarDrop.target).toBeUndefined();

    // off the sidebar
    expect(sidebarDrop.hover([document.body])).toBeNull();
  });

  it('keeps the album the photos come from dark', () => {
    const bali = row({ kind: 'album', id: 'bali', name: 'Bali', writable: true });
    sidebarDrop.begin(carry({ source: { albumId: 'bali' } }));
    expect(sidebarDrop.hover([bali])).toEqual({});
    expect(bali.dataset.dropTarget).toBeUndefined();
  });

  it('springs a folder open once it has been pointed at long enough', () => {
    const { head, spring } = folder();
    sidebarDrop.begin(carry());
    sidebarDrop.hover([head]);
    vi.advanceTimersByTime(SPRING_MS - 1);
    expect(spring.open).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spring.open).toHaveBeenCalledTimes(1);
  });

  it('does not open a folder the pointer only passed over', () => {
    const { head, spring } = folder();
    const other = row();
    sidebarDrop.begin(carry());
    sidebarDrop.hover([head]);
    vi.advanceTimersByTime(SPRING_MS / 2);
    sidebarDrop.hover([other]);
    vi.advanceTimersByTime(SPRING_MS);
    expect(spring.open).not.toHaveBeenCalled();
  });

  it('leaves a folder that was open already alone', () => {
    const { head, spring } = folder(true);
    sidebarDrop.begin(carry());
    sidebarDrop.hover([head]);
    vi.advanceTimersByTime(SPRING_MS);
    sidebarDrop.end();
    expect(spring.open).not.toHaveBeenCalled();
    expect(spring.close).not.toHaveBeenCalled();
  });

  it('closes what it opened once the pointer has stayed off the sidebar a moment', () => {
    const { head, spring } = folder();
    sidebarDrop.begin(carry());
    sidebarDrop.hover([head]);
    vi.advanceTimersByTime(SPRING_MS);

    // a brief slip off the edge is forgiven
    sidebarDrop.hover([document.body]);
    vi.advanceTimersByTime(LEAVE_MS / 2);
    sidebarDrop.hover([head]);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(spring.close).not.toHaveBeenCalled();

    sidebarDrop.hover([document.body]);
    vi.advanceTimersByTime(LEAVE_MS);
    expect(spring.close).toHaveBeenCalledTimes(1);
  });

  it('closes what it opened when the drag ends without a drop', () => {
    const { head, spring } = folder();
    sidebarDrop.begin(carry());
    sidebarDrop.hover([head]);
    vi.advanceTimersByTime(SPRING_MS);
    sidebarDrop.end();
    expect(spring.close).toHaveBeenCalledTimes(1);
    expect(sidebarDrop.carrying).toBeUndefined();
  });

  it('keeps the folders on the way to the album the photos went into open, and closes the others', () => {
    const trips = folder();
    const asia = row({ kind: 'album', id: 'bali', name: 'Bali', writable: true }, trips.group);
    const family = folder();
    sidebarDrop.begin(carry());
    sidebarDrop.hover([family.head]);
    vi.advanceTimersByTime(SPRING_MS);
    sidebarDrop.hover([trips.head]);
    vi.advanceTimersByTime(SPRING_MS);
    sidebarDrop.hover([asia]);
    sidebarDrop.end(true);
    expect(trips.spring.close).not.toHaveBeenCalled();
    expect(family.spring.close).toHaveBeenCalledTimes(1);
    expect(asia.dataset.dropTarget).toBeUndefined();
  });

  it('scrolls the sidebar near its edges, not in the middle', () => {
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 256, 800));
    let scrollTop = 200;
    Object.defineProperty(panel, 'scrollTop', { get: () => scrollTop, configurable: true });
    panel.scrollBy = ((_x: number, y: number) => (scrollTop += y)) as typeof panel.scrollBy;

    expect(sidebarDrop.over({ x: 100, y: 500 })).toBe(true);
    expect(sidebarDrop.over({ x: 400, y: 500 })).toBe(false);
    expect(sidebarDrop.scroll({ x: 100, y: 500 })).toBe(false);
    expect(sidebarDrop.scroll({ x: 100, y: 100 + EDGE / 2 })).toBe(true);
    expect(scrollTop).toBeLessThan(200);
    const top = scrollTop;
    expect(sidebarDrop.scroll({ x: 100, y: 900 - EDGE / 2 })).toBe(true);
    expect(scrollTop).toBeGreaterThan(top);
  });

  it('lights an album a drop made for a moment', () => {
    sidebarDrop.arrive('new', 1000);
    expect(sidebarDrop.arrived).toBe('new');
    vi.advanceTimersByTime(1000);
    expect(sidebarDrop.arrived).toBeUndefined();
  });
});
