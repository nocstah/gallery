import { Route } from '#lib/route.ts';
import { describe, expect, it } from 'vitest';
import { params } from '../../params';
import { NAVIGATION_ITEMS, editionItems, isAlmostExactNavMatch } from './navigation-items';
import { specialAlbums } from './special-albums.svelte';

// The specs run in the browser, so the route tree comes from Vite's glob rather than off disk. Keys are
// root-relative (`/src/routes/(user)/photos/[[assetId=id]]/+page.svelte`); the loaders are never called.
const ROUTES_ROOT = '/src/routes';
const PAGE_DIRS = new Set(
  Object.keys(import.meta.glob('/src/routes/**/+page.svelte')).map((file) => file.slice(0, -'/+page.svelte'.length)),
);
// Every directory on the way to a page. A directory with no page below it can never resolve a route, so
// leaving those out does not change what resolveRoute accepts.
const CHILD_DIRS = new Map<string, Set<string>>();
for (const pageDir of PAGE_DIRS) {
  const parts = pageDir.slice(ROUTES_ROOT.length).split('/').filter(Boolean);
  let dir = ROUTES_ROOT;
  for (const part of parts) {
    CHILD_DIRS.set(dir, (CHILD_DIRS.get(dir) ?? new Set()).add(part));
    dir += `/${part}`;
  }
}
const join = (dir: string, name: string) => `${dir}/${name}`;

// The source files, as raw text.
const SOURCES = import.meta.glob<string>('/src/**/*.{ts,svelte,js}', { query: '?raw', import: 'default' });

// Local Omarchy layer: the param matchers (`[name=matcher]` -> `params.<matcher>` in web/src/params.ts), so a required
// param resolves only for a segment its matcher accepts (e.g. `(user)/[special=special]` serves /todo and /villa)
type Matcher = { '~standard': { validate: (value: unknown) => Promise<unknown> | { issues?: unknown } } };
const MATCHERS = params as unknown as Record<string, Matcher | undefined>;

/**
Resolves a NAVIGATION_ITEMS `route` (a URL pathname, optionally with a
`?query` or `#hash` suffix) to a real SvelteKit page directory under
`web/src/routes`, i.e. proves the route isn't a dead hardcoded string.

Has to understand two SvelteKit filesystem-routing constructs that don't
appear in the URL:
 - route GROUPS `(name)` — transparent, consume zero path segments
   (e.g. all user pages live under `routes/(user)/...`)
 - OPTIONAL params `[[name=matcher]]` — may consume one path segment OR be
   skipped entirely (e.g. `routes/(user)/photos/[[assetId=id]]/+page.svelte`
   serves plain `/photos` by skipping the optional segment)

Returns true iff some path through the directory tree consumes all of
`segments` and lands on a directory containing `+page.svelte`.
*/
function resolveRoute(pathname: string, dir = ROUTES_ROOT, segments = pathToSegments(pathname)): boolean {
  if (segments.length === 0) {
    if (PAGE_DIRS.has(dir)) {
      return true;
    }
    // Even with no segments left, a route-group or optional-param directory
    // can still be entered (both consume zero segments here) to reach a
    // deeper +page.svelte.
    return childDirs(dir).some(
      (name) => (isRouteGroup(name) || isOptionalParam(name)) && resolveRoute(pathname, join(dir, name), []),
    );
  }

  const [next, ...rest] = segments;
  for (const name of childDirs(dir)) {
    if (name === next && resolveRoute(pathname, join(dir, name), rest)) {
      return true;
    }
    if (isRouteGroup(name) && resolveRoute(pathname, join(dir, name), segments)) {
      // Groups don't consume a segment — retry the same remaining segments.
      return true;
    }
    // Required params consume exactly one segment, when their matcher (if any) accepts it.
    if (isRequiredParam(name) && paramAccepts(name, next) && resolveRoute(pathname, join(dir, name), rest)) {
      return true;
    }
    if (!isOptionalParam(name)) {
      continue;
    }

    // Optional params may consume the next segment...
    if (resolveRoute(pathname, join(dir, name), rest)) {
      return true;
    }
    // ...or be skipped, leaving the segment for something deeper.
    if (resolveRoute(pathname, join(dir, name), segments)) {
      return true;
    }
  }
  return false;
}

function pathToSegments(pathname: string): string[] {
  return pathname.split(/[?#]/, 1)[0].split('/').filter(Boolean);
}

function childDirs(dir: string): string[] {
  return [...(CHILD_DIRS.get(dir) ?? [])];
}

function isRouteGroup(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')');
}

function isOptionalParam(name: string): boolean {
  return name.startsWith('[[') && name.endsWith(']]');
}

function isRequiredParam(name: string): boolean {
  return name.startsWith('[') && !name.startsWith('[[') && name.endsWith(']') && !name.startsWith('[...');
}

function paramAccepts(name: string, segment: string): boolean {
  const matcher = /=(\w+)]$/.exec(name)?.[1];
  const result = matcher ? MATCHERS[matcher]?.['~standard'].validate(segment) : undefined;
  return !matcher || (!!result && !(result instanceof Promise) && !result.issues);
}

describe('NAVIGATION_ITEMS schema', () => {
  it('has exactly 57 items', () => {
    expect(NAVIGATION_ITEMS).toHaveLength(57);
  });

  it('every item has non-empty required fields', () => {
    for (const item of NAVIGATION_ITEMS) {
      expect(item.id).toMatch(/^nav:/);
      expect(item.labelKey.length).toBeGreaterThan(0);
      expect(item.descriptionKey.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
      expect(item.route.length).toBeGreaterThan(0);
    }
  });

  it('does not include any item with category "actions" (migrated to command-items)', () => {
    for (const item of NAVIGATION_ITEMS) {
      // Drift-guard: 'actions' was removed from NavigationCategory when
      // nav:theme migrated to cmd:theme. Widen the compare to string so tsc
      // doesn't flag a never-type comparison.
      expect(item.category as string).not.toBe('actions');
    }
  });

  it('every navigation item has a non-empty route', () => {
    for (const item of NAVIGATION_ITEMS) {
      expect(item.route.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = NAVIGATION_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('system-settings routes match the /admin/system-settings?isOpen=<key> pattern', () => {
    const items = NAVIGATION_ITEMS.filter((i) => i.category === 'systemSettings');
    expect(items).toHaveLength(22);
    for (const item of items) {
      expect(item.route).toMatch(/^\/admin\/system-settings\?isOpen=[a-z-]+$/);
      expect(item.adminOnly).toBe(true);
    }
  });

  it('admin routes start with /admin/', () => {
    const items = NAVIGATION_ITEMS.filter((i) => i.category === 'admin');
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.route.startsWith('/admin/')).toBe(true);
      expect(item.adminOnly).toBe(true);
    }
  });

  it('every navigation item route resolves to a real page component', () => {
    // Drift-guard: catches ANY palette entry (not just Server Stats) whose
    // route string points at a page that doesn't exist in web/src/routes —
    // e.g. a hardcoded route left stale after a page was renamed/moved.
    for (const item of NAVIGATION_ITEMS) {
      expect(resolveRoute(item.route), `route "${item.route}" (item ${item.id}) does not resolve`).toBe(true);
    }
  });

  it('Server Stats resolves to the real /admin/server-status page (not the dead /admin/system-statistics)', () => {
    const item = NAVIGATION_ITEMS.find((i) => i.id === 'nav:admin:server-stats');
    expect(item?.route).toBe('/admin/server-status');
    expect(resolveRoute('/admin/system-statistics')).toBe(false);
    expect(resolveRoute('/admin/server-status')).toBe(true);
  });

  // Local Omarchy layer: the owner's tools are the owner's only ("Owner tools only for me"), and so are the owner's own
  // special albums, Villa and QR; every other user page is for every account
  it('user-pages items are admin-only exactly for the owner tools and the owner’s special albums', () => {
    const ownerOnly = new Set([
      'nav:userPages:command',
      'nav:userPages:inbox',
      'nav:userPages:inbox_jobs',
      'nav:userPages:inbox_history',
      'nav:userPages:inbox_health',
      'nav:userPages:chat',
      'nav:userPages:duplicates',
      'nav:userPages:utilities',
      'nav:userPages:import',
      'nav:userPages:villa',
      'nav:userPages:qr',
    ]);
    const items = NAVIGATION_ITEMS.filter((i) => i.category === 'userPages');
    expect(items).toHaveLength(30);
    for (const item of items) {
      expect(item.adminOnly, item.id).toBe(ownerOnly.has(item.id));
    }
  });

  // Local Omarchy layer: a vault's Gallery is the vault edition (gallery/edition), which leaves out of Ctrl+K what its
  // sidebar leaves out
  it("leaves out of a vault's Gallery what it has none of", () => {
    const left = NAVIGATION_ITEMS.filter((item) => item.inVaults === false).map((item) => item.route);
    expect(new Set(left)).toEqual(
      new Set([
        '/admin/users',
        '/admin/library-management',
        '/map',
        '/sharing',
        '/spaces',
        '/todo',
        '/villa',
        '/qr',
        '/command',
        '/inbox',
        '/inbox?tab=jobs',
        '/inbox?tab=history',
        '/inbox?tab=health',
        '/chat',
        Route.locked(),
        Route.sharedLinks(),
      ]),
    );
    // the browser keeps a loaded module, so the vault list is asked for directly rather than re-imported under the flag
    const vault = editionItems(true);
    expect(editionItems(false)).toHaveLength(NAVIGATION_ITEMS.length);
    expect(vault).toHaveLength(NAVIGATION_ITEMS.length - left.length);
    expect(vault.filter((item) => item.inVaults === false)).toEqual([]);
  });

  // Local Omarchy layer: Ctrl+K offers a special album as the sidebar does (managers/special-albums' ownerOnly, through
  // `offered`): To do to every account, Villa and QR to the owner alone
  it('offers each special album’s page to the accounts its sidebar row is offered to', () => {
    for (const special of specialAlbums) {
      const item = NAVIGATION_ITEMS.find((i) => i.route === special.route);
      expect(item, special.route).toBeDefined();
      expect(item?.adminOnly, special.route).toBe(special.ownerOnly);
    }
    expect(NAVIGATION_ITEMS.find((i) => i.route === '/todo')?.adminOnly).toBe(false);
  });

  it("no source file references the migrated 'nav:theme' literal", async () => {
    // Pinned invariant: after Task 6, the theme toggle lives as cmd:theme in
    // the commands registry. If this assertion trips, a stale 'nav:theme'
    // reference slipped back in — check navigation-items, global-search-manager,
    // or test fixtures. This drift-guard is what keeps dual rendering from
    // regressing. The spec files are excluded via the suffix check.
    const files = Object.entries(SOURCES).filter(([file]) => !file.endsWith('.spec.ts'));
    expect(files.length).toBeGreaterThan(100);
    // In parallel: one request to Vite per file, one at a time, outlasts the test timeout in a full run.
    const sources = await Promise.all(files.map(([file, load]) => load().then((source) => [file, source] as const)));
    const offenders = sources.filter(([, source]) => source.includes('nav:theme')).map(([file]) => file);
    expect(offenders).toEqual([]);
  }, 60_000);

  it('drift guard: every systemSettings isOpen key exists in the accordion source', async () => {
    const source = await SOURCES['/src/routes/admin/system-settings/+page.svelte']();
    const sourceKeys = new Set([...source.matchAll(/key:\s*'([a-z-]+)'/g)].map((m) => m[1]));
    const ourKeys = NAVIGATION_ITEMS.filter((i) => i.category === 'systemSettings').map((i) =>
      i.route.replace('/admin/system-settings?isOpen=', ''),
    );
    for (const key of ourKeys) {
      expect(sourceKeys.has(key)).toBe(true);
    }
  });

  it('drift guard: every accordion source key has a systemSettings navigation item', async () => {
    const source = await SOURCES['/src/routes/admin/system-settings/+page.svelte']();
    const sourceKeys = new Set([...source.matchAll(/key:\s*'([a-z-]+)'/g)].map((m) => m[1]));
    const ourKeys = new Set(
      NAVIGATION_ITEMS.filter((i) => i.category === 'systemSettings').map((i) =>
        i.route.replace('/admin/system-settings?isOpen=', ''),
      ),
    );

    for (const key of sourceKeys) {
      expect(ourKeys.has(key)).toBe(true);
    }
  });

  // Local Omarchy layer: Places is among the pages, right after the Map, as in the sidebar's Browse (only Explore's
  // View all had led there)
  it('lists Places right after the Map', () => {
    const pages = NAVIGATION_ITEMS.filter((item) => item.category === 'userPages').map((item) => item.route);

    expect(pages.indexOf('/places')).toBe(pages.indexOf('/map') + 1);
    expect(NAVIGATION_ITEMS.find((item) => item.route === '/places')).toMatchObject({
      labelKey: 'places',
      adminOnly: false,
    });
  });

  it('drift guard: every page in the sidebar can be opened from Ctrl+K', async () => {
    // Local Omarchy layer: the command center, AI inbox and chat were added to the sidebar without a palette entry,
    // so typing "inbox" found nothing. Every href in the sidebar, a literal or a Route helper, must be in the list.
    const source = await SOURCES['/src/lib/components/shared-components/side-bar/UserSidebar.svelte']();
    const routes = Route as unknown as Record<string, () => string>;
    const hrefs = [
      ...[...source.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]),
      ...[...source.matchAll(/href=\{Route\.(\w+)\(\)\}/g)].map((m) => routes[m[1]]()),
    ];
    const paths = new Set(NAVIGATION_ITEMS.map((i) => i.route.split(/[?#]/, 1)[0]));

    expect(hrefs.length).toBeGreaterThan(15);
    for (const href of hrefs) {
      expect(paths.has(href.split(/[?#]/, 1)[0]), `${href} is in the sidebar but not in Ctrl+K`).toBe(true);
    }
  });
});

describe('isAlmostExactNavMatch', () => {
  // Promotes a navigation item to the palette's "Top result" band when the
  // user's query unambiguously points at the item. The gate is deliberately
  // narrow, because promotion also suppresses the free-text "search for …" row:
  // a query word must all but spell out a label word (one untyped character of
  // slack, so "album" → "Albums" still lands), and every query word must match,
  // so a sentence can never be promoted by one incidental collision.

  it('returns true on an exact case-insensitive match', () => {
    expect(isAlmostExactNavMatch('people', 'People')).toBe(true);
    expect(isAlmostExactNavMatch('PHOTOS', 'photos')).toBe(true);
  });

  it('returns true when the query is one character short of the label word', () => {
    expect(isAlmostExactNavMatch('album', 'Albums')).toBe(true);
  });

  it('rejects a partial prefix that leaves more than one character untyped', () => {
    expect(isAlmostExactNavMatch('classif', 'Classification Settings')).toBe(false);
  });

  it('returns true when a whole word in the label starts with the query', () => {
    expect(isAlmostExactNavMatch('classification', 'Classification Settings')).toBe(true);
    // Compound query: even though the full query "auto-classification" is not
    // a prefix of "Classification Settings", the word "classification" inside
    // the query is a word-prefix of "Classification" inside the label.
    expect(isAlmostExactNavMatch('auto-classification', 'Classification Settings')).toBe(true);
  });

  it('rejects queries shorter than 3 characters (too noisy to promote)', () => {
    expect(isAlmostExactNavMatch('sp', 'Spaces')).toBe(false);
    expect(isAlmostExactNavMatch('', 'Photos')).toBe(false);
  });

  it('rejects when no word-prefix match exists', () => {
    expect(isAlmostExactNavMatch('xyz', 'Spaces')).toBe(false);
    expect(isAlmostExactNavMatch('people', 'Sharing')).toBe(false);
  });

  it('ignores query words shorter than 3 chars when scanning a compound query', () => {
    // "a-classification" — the first word 'a' is too short but the second word
    // 'classification' still carries the match.
    expect(isAlmostExactNavMatch('a-classification', 'Classification Settings')).toBe(true);
    // A query consisting solely of short words fails even if it is otherwise
    // a substring of the label.
    expect(isAlmostExactNavMatch('a b', 'Albums')).toBe(false);
  });
});
