import { redirect } from '@sveltejs/kit';
import { Route } from '$lib/route';
import { curatorOffers, libraryHas, loadLibraryContext, whenLibraryKnown } from './library-context.svelte';
import type { CuratorFeature, LibraryFeature } from './library-file';

// Local Omarchy layer: the pages a library without a feature leaves out. Main's Curator listens on this host's port
// 2290, which any local address reaches, so a library without a Curator of its own has none of Curator's pages (the
// client refuses to make the address: utils/curator); one with its own names that one's port (curatorPort), and one
// whose Curator offers only some of what Main's does (curatorFeatures) has the pages of those. The special albums (To
// do, Villa, QR) are Main's workflows. Pages are named by their first path segments, as the vault edition's are
// (gallery/edition).
const PAGES: Partial<Record<LibraryFeature, readonly string[]>> = {
  specialAlbums: ['todo', 'villa', 'qr'],
};

// Curator's pages, by what each is for: the command center and the AI inbox; the chat and Ask; a memory a day (From
// the beginning); the bank slips
const CURATOR_PAGES: Partial<Record<CuratorFeature, readonly string[]>> = {
  inbox: ['command', 'inbox'],
  chat: ['chat', 'ask'],
  memories: ['from-the-beginning'],
  slips: ['utilities/slips'],
};

const onPage = (pathname: string, page: string) => {
  const path = pathname.split('/').filter(Boolean);
  return page.split('/').every((part, index) => path[index] === part);
};

/** Whether this library offers the page a route opens (a route with a query, /inbox?tab=jobs, by its path). */
export const pageInThisLibrary = (route: string): boolean => {
  const [pathname] = route.split(/[?#]/, 1);
  const outside = (pages: readonly string[] = []) => pages.every((page) => !onPage(pathname, page));
  return (
    Object.entries(PAGES).every(([feature, pages]) => libraryHas(feature as LibraryFeature) || outside(pages)) &&
    Object.entries(CURATOR_PAGES).every(
      ([feature, pages]) => curatorOffers(feature as CuratorFeature) || outside(pages),
    )
  );
};

/**
 * In the root layout's load, beside notInVaults: waits for this library's context (read once, by hooks.client's init),
 * then sends a page this library does not offer to Photos.
 */
export const notInThisLibrary = async (url: URL, fetchFn?: typeof fetch) => {
  await loadLibraryContext(fetchFn);
  if (!pageInThisLibrary(url.pathname)) {
    redirect(307, Route.photos());
  }
};

/** A list of Ctrl+K's pages, which loses the pages this library does not offer once its context is known. */
export const leaveOutOfThisLibrary = <T extends readonly { route: string }[]>(items: T): T => {
  whenLibraryKnown(() => {
    const list = items as unknown as { route: string }[];
    for (let index = list.length - 1; index >= 0; index--) {
      if (!pageInThisLibrary(list[index].route)) {
        list.splice(index, 1);
      }
    }
  });
  return items;
};
