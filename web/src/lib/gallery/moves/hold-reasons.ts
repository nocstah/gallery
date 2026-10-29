// Local Omarchy layer: why a move leaves photos where they are (gallery/moves), as the pages show it. The mover reports
// the reasons under these shown names; the two that involve a Locked Folder come under neutral ones (cannot-read,
// not-verified), each shared with an ordinary case, so no page, word or count ever says what a Locked Folder holds.
// Three are the import's own marks and may be moved anyway, by the owner's tick on the move page.
import type { MessageFormatter, Translations } from 'svelte-i18n';

/** Every reason a page shows: its words, and whether the owner may move those photos anyway. */
export const HOLD_REASONS = {
  'cannot-read': { words: 'moves_hold_cannot_read', forceable: false },
  'special-album': { words: 'moves_hold_special_album', forceable: false },
  'live-video-alone': { words: 'moves_hold_live_video_alone', forceable: false },
  'another-copy': { words: 'moves_hold_another_copy', forceable: true },
  'deleted-before': { words: 'moves_hold_deleted_before', forceable: true },
  'deleted-in-main': { words: 'moves_hold_deleted_in_main', forceable: true },
  'in-destination-trash': { words: 'moves_hold_in_destination_trash', forceable: false },
  'not-verified': { words: 'moves_hold_not_verified', forceable: false },
  tombstone: { words: 'moves_hold_tombstone', forceable: false },
  'live-photo-in-destination': { words: 'moves_hold_live_photo_in_destination', forceable: false },
  unreadable: { words: 'moves_hold_unreadable', forceable: false },
  unsupported: { words: 'moves_hold_unsupported', forceable: false },
  'upload-failed': { words: 'moves_hold_upload_failed', forceable: false },
  mismatch: { words: 'moves_hold_mismatch', forceable: false },
  'not-read': { words: 'moves_hold_not_read', forceable: false },
  details: { words: 'moves_hold_details', forceable: false },
  edits: { words: 'moves_hold_edits', forceable: false },
  'live-photo': { words: 'moves_hold_live_photo', forceable: false },
  stack: { words: 'moves_hold_stack', forceable: false },
  changed: { words: 'moves_hold_changed', forceable: false },
  'not-on-disk': { words: 'moves_hold_not_on_disk', forceable: false },
} as const satisfies Record<string, { words: Translations; forceable: boolean }>;

export type HoldReason = keyof typeof HOLD_REASONS;

/** The words of a reason this page does not know (a newer mover's). */
export const OTHER_HOLD: Translations = 'moves_hold_other';

export const isHoldReason = (reason: string): reason is HoldReason => Object.hasOwn(HOLD_REASONS, reason);

/** Whether the owner may move photos held for this reason anyway: only the three marks the import left. */
export const isForceable = (reason: string) => isHoldReason(reason) && HOLD_REASONS[reason].forceable;

/** The i18n key of a reason's words. */
export const holdKey = (reason: string): Translations =>
  isHoldReason(reason) ? HOLD_REASONS[reason].words : OTHER_HOLD;

/** A reason's words, naming the two libraries where it needs them: the move's source and its destination. */
export const holdWords = ($t: MessageFormatter, reason: string, names: { source: string; library: string }) =>
  $t(holdKey(reason), { values: names });
