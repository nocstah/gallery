// Local Omarchy layer: the film's keys (DESIGN.md, Memories, The film): Space pauses and plays, the arrows step a
// photo back and on, M mutes the music, N skips to the next song, Escape closes. A key held with Ctrl, Alt or the
// Meta key is someone else's shortcut (Ctrl+Z, Ctrl+K), and nothing is taken from a field or from an open menu, whose
// arrows move through its items.

export type FilmAction = 'toggle' | 'previous' | 'next' | 'mute' | 'next-song' | 'close';

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

const takesKeys = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return false;
  }
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="menu"]');
};

/** What a key does in the film, or nothing. */
export const filmKeyAction = (event: KeyLike): FilmAction | undefined => {
  if (event.ctrlKey || event.metaKey || event.altKey || takesKeys(event.target)) {
    return undefined;
  }
  return KEYS[event.key];
};
