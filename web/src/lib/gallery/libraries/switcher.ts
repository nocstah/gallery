import { mdiSwapHorizontal } from '@mdi/js';
import { vaultEdition } from '$lib/gallery/edition';
import { isDesktop, isLoopback } from '$lib/gallery/vaults/launcher';
import type { CommandItem } from '$lib/managers/command-items';
import { Route } from '$lib/route';
import {
  currentLibrary,
  libraries,
  listsSeveralLibraries,
  otherLibraries,
  whenLibraryKnown,
} from './library-context.svelte';

// Local Omarchy layer: the Libraries switcher, in the sidebar and in Ctrl+K. Switching is a plain full navigation to the
// other library's own address: each library has its own sign-in and keeps its own tabs, so nothing is carried over.

/**
 * Whether the switcher shows: Kioku lists another library, the page is on this computer (every library's address is),
 * the browser is this desktop's (the Vaults launcher's rule), and this is not a vault's Gallery.
 */
export const canSwitchLibraries = (url: URL, userAgent: string): boolean =>
  !vaultEdition() && listsSeveralLibraries() && isLoopback(url.hostname) && isDesktop(userAgent);

/** A row of the switcher: this library leads to its own Photos; another one is its own address. */
export type SwitcherRow = { id: string; name: string; colour: string; href: string; current: boolean };

/** Every library in the deploy's order, this one marked (put first if the list leaves it out). */
export const switcherRows = (): SwitcherRow[] => {
  const here = currentLibrary();
  if (!here) {
    return [];
  }
  const current: SwitcherRow = { ...here, href: Route.photos(), current: true };
  const rows = libraries().map(({ id, name, colour, url }) =>
    id === here.id ? current : { id, name, colour, href: url, current: false },
  );
  return rows.includes(current) ? rows : [current, ...rows];
};

/** Ctrl+K's Switch to <library>, one for each other library; each opens that library's address in this tab. */
export const libraryCommands = (): CommandItem[] =>
  vaultEdition()
    ? []
    : otherLibraries().map((library) => ({
        id: `cmd:library_${library.id.replaceAll('-', '_')}`,
        labelKey: 'libraries_switch_to',
        labelValues: { name: library.name },
        descriptionKey: 'libraries_switch_description',
        icon: mdiSwapHorizontal,
        isAvailable: () => canSwitchLibraries(new URL(location.href), navigator.userAgent),
        handler: () => location.assign(library.url),
      }));

/** Ctrl+K's commands, which the Switch to commands join once this library's context is known. */
export const addLibraryCommands = <T extends readonly CommandItem[]>(items: T): T => {
  whenLibraryKnown(() => {
    (items as unknown as CommandItem[]).push(...libraryCommands());
  });
  return items;
};
