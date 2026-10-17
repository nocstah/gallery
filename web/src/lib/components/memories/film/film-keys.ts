// Local Omarchy layer: the film's keys (DESIGN.md, Memories, The film): Space pauses and plays, the arrows step a
// photo back and on, M mutes the music, N skips to the next song, Escape closes. A key held with Ctrl, Alt or the
// Meta key is someone else's shortcut (Ctrl+Z, Ctrl+K), and nothing is taken from a field or from an open menu, whose
// arrows move through its items.
//
// Dressed for Room (DESIGN.md, Room: a film across the room, chained to the next), a TV remote does the same: its OK
// (Enter) pauses and plays, ↑ and ↓ go to the film before and the one after, its Back leaves, and a remote's or a
// keyboard's media keys play, pause and skip films.

export type FilmAction =
  'toggle' | 'previous' | 'next' | 'mute' | 'next-song' | 'close' | 'previous-film' | 'next-film';

export type FilmDress = 'screen' | 'room';

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>;

const KEYS: Record<string, FilmAction> = {
  ' ': 'toggle',
  Spacebar: 'toggle',
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  m: 'mute',
  M: 'mute',
  n: 'next-song',
  N: 'next-song',
  Escape: 'close',
};

const ROOM_KEYS: Record<string, FilmAction> = {
  ...KEYS,
  Enter: 'toggle',
  ArrowUp: 'previous-film',
  ArrowDown: 'next-film',
  // a TV browser's Back: webOS and Android TV say GoBack or BrowserBack, Tizen XF86Back
  GoBack: 'close',
  BrowserBack: 'close',
  XF86Back: 'close',
  MediaPlayPause: 'toggle',
  MediaTrackNext: 'next-film',
  MediaTrackPrevious: 'previous-film',
};

const takesKeys = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return false;
  }
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"]');
};

/** What a key does in the film, or nothing. */
export const filmKeyAction = (event: KeyLike, dress: FilmDress = 'screen'): FilmAction | undefined => {
  if (event.ctrlKey || event.metaKey || event.altKey || takesKeys(event.target)) {
    return undefined;
  }
  return (dress === 'room' ? ROOM_KEYS : KEYS)[event.key];
};
