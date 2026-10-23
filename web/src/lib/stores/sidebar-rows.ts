// Local Omarchy layer: the sidebar rows a person hid in this browser, by name, like the pins and the folded groups; a
// row not named here shows. People is always in Browse otherwise (components/shared-components/side-bar/UserSidebar):
// upstream showed it only with the server preference people.sidebarWeb, which is off for every account until someone
// finds its switch, so that preference is no longer read, and nothing here writes it. People hides from its row's
// right-click menu (utils/sidebar-row-menu) or Settings > Features, and shows again from Settings > Features.
import { persisted } from 'svelte-persisted-store';

export const sidebarRowsHidden = persisted<Record<string, boolean>>('sidebar-rows-hidden', {}, {});

/** Hides a sidebar row in this browser, or shows it again (a shown row is not named in what the browser keeps). */
export const setSidebarRowHidden = (row: string, hidden: boolean) =>
  sidebarRowsHidden.update((rows) => {
    const rest = Object.fromEntries(Object.entries(rows).filter(([name]) => name !== row));
    return hidden ? { ...rest, [row]: true } : rest;
  });
