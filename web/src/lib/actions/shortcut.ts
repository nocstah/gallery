import { matchesShortcut, shouldIgnoreEvent as ignoredByUi, type ShortcutOptions } from '@immich/ui';
import type { ActionReturn } from 'svelte/action';
import { on } from 'svelte/events';

export { matchesShortcut, shortcutLabel, type Shortcut, type ShortcutOptions } from '@immich/ui';

// Local Omarchy layer: keys typed into a field are the field's. @immich/ui's check knows text, textarea, date,
// datetime-local, email and password fields only, so a search field (the search page's query, Ask's, a Space's albums',
// the theme picker's) let a page's keys through: typing "beach" over the results sent the photo under the pointer to
// To do on its "b", Ctrl+A selected every photo instead of the words, and ⇧T switched the theme. The check below adds
// the other typed fields and anything editable, and shortcuts and shortcut are @immich/ui's with it (their code is
// upstream's, a dozen lines; @immich/ui's own components keep their own).
const TYPED = new Set(['search', 'url', 'tel', 'number', 'time', 'month', 'week']);

/** Whether a key or paste belongs to the field it happened in rather than to the page's shortcuts. */
export const shouldIgnoreEvent = (event: KeyboardEvent | ClipboardEvent): boolean => {
  if (ignoredByUi(event)) {
    return true;
  }
  const target = event.target;
  if (target === event.currentTarget || !(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || (target instanceof HTMLInputElement && TYPED.has(target.type));
};

/** Binds multiple keyboard shortcuts to node. */
export const shortcuts = <T extends HTMLElement>(
  node: T,
  options: ShortcutOptions<T>[],
): ActionReturn<ShortcutOptions<T>[]> => {
  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }
    const ignoreShortcut = shouldIgnoreEvent(event);
    for (const { shortcut, onShortcut, ignoreInputFields = true, preventDefault = true } of options) {
      if (ignoreInputFields && ignoreShortcut) {
        continue;
      }
      if (matchesShortcut(event, shortcut)) {
        if (preventDefault) {
          event.preventDefault();
        }
        onShortcut(event as KeyboardEvent & { currentTarget: T });
        return;
      }
    }
  };
  const off = on(node, 'keydown', onKeydown);
  return {
    update(next) {
      options = next;
    },
    destroy() {
      off();
    },
  };
};

/** Binds a single keyboard shortcut to node. */
export const shortcut = <T extends HTMLElement>(
  node: T,
  option: ShortcutOptions<T>,
): ActionReturn<ShortcutOptions<T>> => {
  const { update, destroy } = shortcuts(node, [option]);
  return {
    update(next) {
      update?.([next]);
    },
    destroy,
  };
};
