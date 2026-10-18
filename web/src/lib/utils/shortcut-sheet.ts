// Local Omarchy layer: the keyboard shortcuts sheet (modals/ShortcutsModal), grouped by where the keys work. The old
// sheet was two lists, General and Actions, so ⇧S read as both stacking and saving a frame and D as both a day back and
// Download, with no word on where each applies; Ctrl+Z, Ctrl+A, Ctrl+D, Ctrl+B, the page keys, Shift+middle-click,
// L, N, ⇧I and the AI inbox's keys were missing. Every key here is bound in the source (the file named beside it), and
// a row shows only for an account it works for.
import type { MessageFormatter } from 'svelte-i18n';

/**
 * One way to press a shortcut: its keys in order. 'Shift' draws as ⇧ (and is read out as Shift), 'click' and
 * 'middle-click' are the pointer's, anything else is the key's own label.
 */
export type KeyCombo = readonly string[];

export type ShortcutRow = {
  /** the ways to press it: one combination, or alternatives (← / →) read in the order of the action's words */
  keys: readonly KeyCombo[];
  action: string;
  /** where or when it applies, when the section does not say */
  note?: string;
};

export type ShortcutSection = { id: string; title: string; rows: ShortcutRow[] };

/** Who is looking: the rows for what this account cannot do are left out. */
export type SheetAccount = {
  /** signed in (not a visitor on a shared link) */
  signedIn: boolean;
  /** the server's admin, the owner: Villa, QR and the AI inbox are theirs */
  owner: boolean;
  /** Curator works for this account (utils/curator's curatorIsMine): saving a frame, a film's music */
  curator: boolean;
  /** star ratings are on in this account's preferences */
  ratings: boolean;
  /** tags are on in this account's preferences */
  tags: boolean;
  /** the inspector window is offered here (managers/inspector-link's inspectorFits): not on a phone or a touch screen,
   * which has no second screen to put it on; offered when not said */
  inspector?: boolean;
};

const row = (keys: KeyCombo[], action: string, note?: string): ShortcutRow => ({ keys, action, note });
const only = (shown: boolean, ...rows: ShortcutRow[]) => (shown ? rows : []);

export const shortcutSections = ($t: MessageFormatter, account: SheetAccount): ShortcutSection[] => {
  const { signedIn, owner, curator, ratings, tags, inspector = true } = account;
  const sections: ShortcutSection[] = [
    {
      // routes/+layout.svelte, routes/(user)/+layout.svelte, utils/page-keys, layouts/UserPageLayout,
      // inspector/InspectorFeed, routes/(user)/DragAndDropUploadOverlay
      id: 'everywhere',
      title: $t('shortcut_section_everywhere'),
      rows: [
        row([['Ctrl', 'K'], ['/']], $t('shortcut_open_global_search')),
        row([['Ctrl', '/']], $t('shortcut_cycle_search_mode'), $t('shortcut_note_searching')),
        row([['PgUp'], ['PgDn']], $t('shortcut_page')),
        ...only(
          signedIn,
          row([['Ctrl', 'Z']], $t('shortcut_undo')),
          row([['Ctrl', 'B']], $t('shortcut_sidebar')),
          ...only(inspector, row([['Shift', 'I']], $t('inspector_window_shortcut'))),
          row([['Ctrl', 'V']], $t('shortcut_paste')),
        ),
        row([['Shift', 'T']], $t('toggle_theme_description')),
        row([['Ctrl', 'Shift', 'M']], $t('shortcut_copy_link')),
      ],
    },
    {
      // timeline/actions/TimelineKeyboardActions, timeline/TimelineWorkspaces ([ and ]), assets/thumbnail/Thumbnail
      // (Enter, X), managers/thumbnail-zoom-manager (+ - 0), utils/quick-trash, managers/special-albums (B V Q)
      id: 'grid',
      title: $t('shortcut_section_grid'),
      rows: [
        row([['←'], ['→']], $t('shortcut_photo_previous_next')),
        row([['↑'], ['↓']], $t('shortcut_photo_above_below')),
        row([['Home'], ['End']], $t('shortcut_photo_first_last')),
        row([['D'], ['Shift', 'D']], $t('shortcut_day'), $t('shortcut_note_shift_d')),
        row([['M'], ['Shift', 'M']], $t('shortcut_month')),
        row([['Y'], ['Shift', 'Y']], $t('shortcut_year')),
        row([['['], [']']], $t('shortcut_year_older_newer')),
        row([['G']], $t('shortcut_go_to_date')),
        row([['Enter']], $t('shortcut_open_photo')),
        row([['X']], $t('select')),
        row([['Ctrl', 'A']], $t('select_all')),
        row([['Shift', 'click']], $t('shortcut_select_range')),
        row([['+'], ['-'], ['0']], $t('shortcut_tile_size')),
        ...only(signedIn, row([['Shift', 'middle-click']], $t('shortcut_quick_trash'))),
        ...only(signedIn, row([['B']], $t('todo_shortcut'), $t('shortcut_note_pointer'))),
        ...only(owner, row([['V']], $t('villa_shortcut')), row([['Q']], $t('qr_shortcut'))),
        row([['?']], $t('keyboard_shortcuts')),
        row([['Esc']], $t('back_close_deselect')),
      ],
    },
    {
      // TimelineKeyboardActions (with a selection), services/asset.service (L N ⇧L T), timeline/actions/DownloadAction
      id: 'selection',
      title: $t('shortcut_section_selection'),
      rows: [
        ...only(
          signedIn,
          row([['L']], $t('add_to_album'), $t('add_to_album_last_hint')),
          row([['N']], $t('new_album_from_selection')),
          row([['Shift', 'L']], $t('remove_from_album'), $t('shortcut_note_in_album')),
        ),
        ...only(signedIn && tags, row([['T']], $t('tag'))),
        ...only(signedIn, row([['Shift', 'A']], $t('archive_or_unarchive_photo'))),
        ...only(signedIn, row([['Shift', 'S']], $t('stack_selected_photos'))),
        row([['Shift', 'D']], $t('download')),
        ...only(signedIn, row([['Del']], $t('shortcut_trash')), row([['Shift', 'Del']], $t('delete_permanently'))),
        row([['Ctrl', 'D']], $t('deselect_all')),
      ],
    },
    {
      // asset-viewer/actions/PreviousAssetAction and NextAssetAction, AssetViewer (↑ ↓ in a stack), services/asset.service
      // (F I E 0-5 L ⇧L T P ⇧D), PhotoViewer (S Z Ctrl+C), VideoNativeViewer (Space, ⇧← ⇧→), actions/SaveFrameAction
      id: 'viewer',
      title: $t('shortcut_section_viewer'),
      rows: [
        row([['←'], ['→']], $t('shortcut_photo_previous_next')),
        row([['↑'], ['↓']], $t('shortcut_stack_previous_next')),
        ...only(signedIn, row([['F']], $t('favorite_or_unfavorite_photo'))),
        row([['I']], $t('show_or_hide_info')),
        ...only(signedIn, row([['E']], $t('edit'))),
        ...only(signedIn && ratings, row([['0'], ['1'], ['2'], ['3'], ['4'], ['5']], $t('shortcut_rate'))),
        row([['S']], $t('slideshow')),
        row([['Z']], $t('zoom_image')),
        row([['Ctrl', 'C']], $t('copy_image')),
        row([['Space']], $t('play_or_pause_video')),
        row(
          [
            ['Shift', '←'],
            ['Shift', '→'],
          ],
          $t('shortcut_video_step'),
        ),
        ...only(signedIn, row([['P']], $t('tag_people'))),
        ...only(
          signedIn,
          row(
            [
              ['L'],
              ['Shift', 'L'],
              ...(tags ? [['T']] : []),
              ['Shift', 'A'],
              ['Shift', 'D'],
              ['Del'],
              ['B'],
              ...(owner ? [['V'], ['Q']] : []),
            ],
            $t('shortcut_viewer_as_selection'),
          ),
        ),
        ...only(curator, row([['Shift', 'S']], $t('save_frame_as_photo'))),
        row([['Esc']], $t('close')),
      ],
    },
    {
      // routes/(user)/albums/[albumId=id]: Escape's steps, utils/quick-trash (out of the album, with Undo)
      id: 'album',
      title: $t('shortcut_section_album'),
      rows: [
        ...only(
          signedIn,
          row([['Shift', 'middle-click']], $t('shortcut_album_take_out')),
          row([['Ctrl', 'Z']], $t('shortcut_undo')),
        ),
        row([['Esc']], $t('shortcut_album_back')),
      ],
    },
    {
      // modals/SelectionReviewModal, utils/review-grid
      id: 'review',
      title: $t('show_selected'),
      rows: [
        row([['←'], ['→'], ['↑'], ['↓'], ['Home'], ['End']], $t('shortcut_review_move')),
        row([['Space'], ['Enter']], $t('shortcut_review_toggle')),
        row([['Del']], $t('shortcut_review_leave_out')),
        row([['Esc']], $t('close')),
      ],
    },
  ];

  if (owner) {
    sections.push(
      {
        // curator/InboxGroupView (a row of the AI inbox has focus)
        id: 'inbox',
        title: $t('shortcut_section_inbox'),
        rows: [
          row([['J'], ['↓']], $t('shortcut_inbox_next')),
          row([['K'], ['↑']], $t('shortcut_inbox_previous')),
          row([['A']], $t('accept')),
          row([['R'], ['X']], $t('ai_inbox_reject')),
          row([['D']], $t('shortcut_inbox_trash')),
          row([['U']], $t('shortcut_inbox_undo')),
        ],
      },
      {
        // curator/ReviewMode
        id: 'inbox-review',
        title: $t('ai_inbox_review'),
        rows: [
          row([['A'], ['→']], $t('accept')),
          row([['R'], ['←']], $t('ai_inbox_reject')),
          row([['S'], ['Space']], $t('skip')),
          row([['U'], ['Backspace']], $t('shortcut_inbox_take_back')),
          row([['Esc']], $t('close')),
        ],
      },
    );
  }

  sections.push({
    // memories/film/film-keys and MemoryFilm, room/RoomPlayer (F); the music is Curator's, for its owner
    id: 'film',
    title: $t('shortcut_section_film'),
    rows: [
      row([['Space']], $t('shortcut_play_pause')),
      row([['←'], ['→']], $t('shortcut_photo_previous_next')),
      ...only(curator, row([['M']], $t('shortcut_sound')), row([['N']], $t('memory_film_next_song'))),
      row([['↑'], ['↓']], $t('shortcut_room_film')),
      row([['F']], $t('shortcut_room_full_screen')),
      row([['Esc']], $t('close')),
    ],
  });

  return sections.filter((section) => section.rows.length > 0);
};
