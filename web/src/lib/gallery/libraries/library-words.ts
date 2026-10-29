import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { vaultEdition } from '$lib/gallery/edition';
import { currentLibrary, isMainLibrary, listsSeveralLibraries } from './library-context.svelte';

// Local Omarchy layer: the open library is never in doubt. The bar's chip names it wherever Kioku lists another (Main
// too), and outside Main the tab's title and every destructive confirmation name it as well. A vault's Gallery shows
// none of this.

/** The library to name where it could be taken for another: any library but Main, never a vault's Gallery. */
export const namedLibrary = () => (vaultEdition() || isMainLibrary() ? undefined : currentLibrary());

/** The library the bar's chip shows: this one once Kioku lists another, and any library but Main always. */
export const chipLibrary = () =>
  vaultEdition() || (isMainLibrary() && !listsSeveralLibraries()) ? undefined : currentLibrary();

/** The tab's title: the page's own, then outside Main the library's name ("Photos - Second", then " - Kioku"). */
export const libraryTitle = (title: string): string => {
  const library = namedLibrary();
  return library ? `${title} - ${library.name}` : title;
};

/** A destructive confirmation's words, or the toast after one, naming the library outside Main ("Second: …"). */
export const libraryNamed = (text: string): string => {
  const library = namedLibrary();
  return library ? get(t)('libraries_named', { values: { library: library.name, text } }) : text;
};
