import type { MessageFormatter } from 'svelte-i18n';
import { describe, expect, it } from 'vitest';
import { shortcutSections, type SheetAccount } from './shortcut-sheet';

// Local Omarchy layer: the shortcuts sheet, grouped by where keys work, a row only for an account it works for
const $t = ((key: string) => key) as MessageFormatter;
const family: SheetAccount = { signedIn: true, owner: false, curator: false, ratings: false, tags: false };
const owner: SheetAccount = { signedIn: true, owner: true, curator: true, ratings: true, tags: true };
const visitor: SheetAccount = { signedIn: false, owner: false, curator: false, ratings: false, tags: false };

const section = (account: SheetAccount, id: string) => shortcutSections($t, account).find((at) => at.id === id);
const actions = (account: SheetAccount, id: string) => section(account, id)?.rows.map(({ action }) => action) ?? [];
const keysFor = (account: SheetAccount, id: string, action: string) =>
  section(account, id)?.rows.find((row) => row.action === action)?.keys;

describe('shortcutSections', () => {
  it('tells the two ⇧S apart: stacking with a selection, saving a frame in the viewer', () => {
    expect(keysFor(owner, 'selection', 'stack_selected_photos')).toEqual([['Shift', 'S']]);
    expect(keysFor(owner, 'viewer', 'save_frame_as_photo')).toEqual([['Shift', 'S']]);
    expect(actions(owner, 'grid')).not.toContain('save_frame_as_photo');
  });

  it('tells D apart: a day in the grid, ⇧D downloading a selection, saying so', () => {
    const day = section(owner, 'grid')?.rows.find((row) => row.action === 'shortcut_day');
    expect(day?.keys).toEqual([['D'], ['Shift', 'D']]);
    expect(day?.note).toBe('shortcut_note_shift_d');
    expect(keysFor(owner, 'selection', 'download')).toEqual([['Shift', 'D']]);
  });

  it('lists the keys the old sheet left out', () => {
    expect(keysFor(family, 'everywhere', 'shortcut_undo')).toEqual([['Ctrl', 'Z']]);
    expect(keysFor(family, 'everywhere', 'shortcut_sidebar')).toEqual([['Ctrl', 'B']]);
    expect(keysFor(family, 'everywhere', 'shortcut_page')).toEqual([['PgUp'], ['PgDn']]);
    expect(keysFor(family, 'everywhere', 'inspector_window_shortcut')).toEqual([['Shift', 'I']]);
    expect(keysFor(family, 'grid', 'select_all')).toEqual([['Ctrl', 'A']]);
    expect(keysFor(family, 'grid', 'shortcut_photo_above_below')).toEqual([['↑'], ['↓']]);
    expect(keysFor(family, 'grid', 'shortcut_quick_trash')).toEqual([['Shift', 'middle-click']]);
    expect(keysFor(family, 'selection', 'deselect_all')).toEqual([['Ctrl', 'D']]);
    expect(keysFor(family, 'selection', 'add_to_album')).toEqual([['L']]);
    expect(keysFor(family, 'selection', 'new_album_from_selection')).toEqual([['N']]);
    expect(keysFor(family, 'album', 'shortcut_album_take_out')).toEqual([['Shift', 'middle-click']]);
  });

  it("gives the owner Villa, QR and the AI inbox's keys, and a family account none of them", () => {
    expect(actions(owner, 'grid')).toEqual(expect.arrayContaining(['villa_shortcut', 'qr_shortcut']));
    expect(section(owner, 'inbox')?.rows.map(({ keys }) => keys[0][0])).toEqual(['J', 'K', 'A', 'R', 'D', 'U']);
    expect(section(owner, 'inbox-review')).toBeDefined();
    expect(actions(family, 'grid')).not.toContain('villa_shortcut');
    expect(actions(family, 'grid')).toContain('todo_shortcut');
    expect(section(family, 'inbox')).toBeUndefined();
    expect(section(family, 'inbox-review')).toBeUndefined();
  });

  it('keeps tags, ratings and the music to the accounts that have them', () => {
    expect(actions(owner, 'selection')).toContain('tag');
    expect(actions(owner, 'viewer')).toContain('shortcut_rate');
    expect(actions(owner, 'film')).toEqual(expect.arrayContaining(['shortcut_sound', 'memory_film_next_song']));
    expect(actions(family, 'selection')).not.toContain('tag');
    expect(actions(family, 'viewer')).not.toContain('shortcut_rate');
    expect(actions(family, 'film')).not.toContain('shortcut_sound');
  });

  it('lists O, the Years overview and back, for a signed-in account, beside the keys that move through time', () => {
    expect(keysFor(family, 'grid', 'shortcut_overview')).toEqual([['O']]);
    expect(keysFor(owner, 'grid', 'shortcut_overview')).toEqual([['O']]);
    const grid = actions(family, 'grid');
    expect(grid.indexOf('shortcut_overview')).toBe(grid.indexOf('shortcut_year_older_newer') + 1);
    // a shared link's grid offers no overviews, so O does nothing there
    expect(actions(visitor, 'grid')).not.toContain('shortcut_overview');
  });

  it('offers ⇧I only where the inspector window is offered, not on a phone or a touch screen', () => {
    expect(actions({ ...owner, inspector: false }, 'everywhere')).not.toContain('inspector_window_shortcut');
    expect(actions({ ...owner, inspector: true }, 'everywhere')).toContain('inspector_window_shortcut');
  });

  it("leaves an account's own actions out for a visitor on a shared link", () => {
    expect(actions(visitor, 'everywhere')).toEqual([
      'shortcut_open_global_search',
      'shortcut_cycle_search_mode',
      'shortcut_page',
      'toggle_theme_description',
      'shortcut_copy_link',
    ]);
    expect(actions(visitor, 'selection')).toEqual(['download', 'deselect_all']);
    expect(actions(visitor, 'viewer')).not.toContain('favorite_or_unfavorite_photo');
  });
});
