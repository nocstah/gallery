// Local Omarchy layer: how the pages put a move into words and numbers (gallery/moves): its libraries by name, what
// it is doing, why it waits or stopped, and how far it has got. Every string names libraries through {library} (the
// destination) and {source}, so none names one itself.
import type { MessageFormatter, Translations } from 'svelte-i18n';
import { libraryById } from './move-gates';
import type { MoveSide, MoveStatus, QuietHours } from './mover';

/**
 * The mover's quiet hours by default (KIOKU_MOVER_QUIET), host time: Main's nightly backup window, in which a move into
 * Main starts no upload (the owner, 30 October). A move into any other library keeps none.
 */
export const QUIET_FROM = '01:45';
export const QUIET_TO = '03:30';

/**
 * The quiet hours a move keeps: the ones its status reports (none when it reports null), or, from a receiver that does
 * not say, the default, which holds only a move into Main. `intoMain` is whether its destination is Main, where the page
 * knows it (the destination's own page does: this library is the destination).
 */
export const quietHours = (status: Pick<MoveStatus, 'quiet'>, intoMain: boolean): QuietHours | undefined => {
  if (status.quiet !== undefined) {
    return status.quiet ?? undefined;
  }
  return intoMain ? { from: QUIET_FROM, to: QUIET_TO } : undefined;
};

/** A library's name, from the context; one the context does not list keeps its id. */
export const libraryName = (id: string) => libraryById(id)?.name ?? id;

/** The two names a move's words take: {source}, and {library}, its destination. */
export const moveNames = (status: Pick<MoveStatus, 'source' | 'destination'>) => ({
  source: libraryName(status.source),
  library: libraryName(status.destination),
});

/** This library's side of a move, if it has one. */
export const sideOf = (status: Pick<MoveStatus, 'source' | 'destination'>, here: string | undefined) => {
  if (!here) {
    return;
  }
  if (status.source === here) {
    return 'source' satisfies MoveSide;
  }
  return status.destination === here ? ('destination' satisfies MoveSide) : undefined;
};

/** What a running move is doing, by the mover's phases: the words, and which library they name. */
export const PHASES = {
  preparing: { words: 'moves_phase_copying', names: 'library' },
  copying: { words: 'moves_phase_copying', names: 'library' },
  reading: { words: 'moves_phase_reading', names: 'library' },
  applying: { words: 'moves_phase_checking', names: 'library' },
  linking: { words: 'moves_phase_checking', names: 'library' },
  verifying: { words: 'moves_phase_checking', names: 'library' },
  flushing: { words: 'moves_phase_checking', names: 'library' },
  binning: { words: 'moves_phase_binning', names: 'library' },
  'waiting-space': { words: 'moves_phase_waiting_space', names: 'library' },
  'waiting-source': { words: 'moves_phase_waiting', names: 'source' },
  'waiting-destination': { words: 'moves_phase_waiting', names: 'library' },
  'destination-paused': { words: 'moves_phase_destination_paused', names: 'library' },
  'quiet-hours': { words: 'moves_phase_quiet', names: 'library' },
} as const satisfies Record<string, { words: Translations; names: 'source' | 'library' }>;

/** Why a move is paused, by the mover's reasons. */
export const PAUSES = {
  restarted: 'moves_pause_restarted',
  'source-key': 'moves_pause_source_key',
  'destination-key': 'moves_pause_destination_key',
  'source-unreachable': 'moves_pause_source_unreachable',
  'destination-unreachable': 'moves_pause_destination_unreachable',
  'destination-reading': 'moves_pause_destination_reading',
  'trash-off': 'moves_pause_trash_off',
} as const satisfies Record<string, Translations>;

/** The receiver's answers and no answer at all, then the refusals of its checks. */
export const ERRORS = {
  unreachable: 'moves_error_unreachable',
  invalid: 'moves_error_invalid',
  forbidden: 'moves_error_forbidden',
  unknown: 'moves_error_unknown',
  busy: 'moves_error_busy',
  exists: 'moves_error_exists',
  state: 'moves_error_state',
  stopping: 'moves_error_stopping',
  failed: 'moves_error_failed',
  'source-unreachable': 'moves_error_source_unreachable',
  'destination-unreachable': 'moves_error_destination_unreachable',
  key: 'moves_error_key',
  account: 'moves_error_account',
  versions: 'moves_error_versions',
  'time-zone': 'moves_error_time_zone',
  'trash-off': 'moves_error_trash_off',
  space: 'moves_error_space',
} as const satisfies Record<string, Translations>;

/** Why a move failed, by the mover's reasons. */
export const FAILURES = {
  'plan-failed': 'moves_failure_plan_failed',
  'person-unknown': 'moves_failure_person_unknown',
  internal: 'moves_failure_internal',
} as const satisfies Record<string, Translations>;

const lookup = <T>(table: Record<string, T>, code: string | null | undefined): T | undefined =>
  code && Object.hasOwn(table, code) ? table[code] : undefined;

/** What a running move is doing, in words; nothing for a phase this page does not know. */
export const phaseWords = ($t: MessageFormatter, status: MoveStatus): string | undefined => {
  const phase = lookup<{ words: Translations; names: 'source' | 'library' }>(PHASES, status.phase);
  if (!phase) {
    return;
  }
  const names = moveNames(status);
  // the quiet hours' end, which the words of that phase name; only a move in them is ever in that phase
  return $t(phase.words, { values: { library: names[phase.names], time: status.quiet?.to ?? QUIET_TO } });
};

/** Why a move is paused, in words. */
export const pauseWords = ($t: MessageFormatter, status: MoveStatus) =>
  $t(lookup<Translations>(PAUSES, status.reason) ?? 'moves_pause_other', { values: moveNames(status) });

/** A receiver's error or a check's refusal, in words; the libraries are a move's when there is one. */
export const errorWords = ($t: MessageFormatter, code: string, names?: { source: string; library: string }) =>
  $t(lookup<Translations>(ERRORS, code) ?? 'moves_error_failed', { values: names ?? { source: '', library: '' } });

/** Why a move failed, in words. */
export const failureWords = ($t: MessageFormatter, status: MoveStatus) =>
  $t(lookup<Translations>(FAILURES, status.reason) ?? 'moves_failure_internal', { values: moveNames(status) });

/** The photos a confirmed move takes: the new ones, those the destination has, and the holds moved anyway. */
export const goingCount = (status: MoveStatus, force: readonly string[] = status.forced) =>
  (status.plan?.new ?? 0) +
  (status.plan?.present ?? 0) +
  status.holds.filter(({ reason }) => force.includes(reason)).reduce((sum, { items }) => sum + items, 0);

/** The photos done: put in the source's trash after their copy was checked, or because the destination had them. */
export const doneCount = (status: MoveStatus) => status.progress.moved + status.progress.present;

/** The photos that stay in the source: whatever of the move was not done. */
export const stayedCount = (status: MoveStatus) => Math.max(0, (status.plan?.items ?? 0) - doneCount(status));

/** How far a move has got, as this library's side reads it: "Moving to Main: 340 of 1,234". */
export const progressWords = ($t: MessageFormatter, status: MoveStatus, side: MoveSide | undefined) =>
  $t(side === 'destination' ? 'moves_progress_from' : 'moves_progress', {
    values: { ...moveNames(status), done: doneCount(status), total: goingCount(status) },
  });

/** How much of the move's new bytes have gone, from 0 to 1. */
export const byteShare = (status: MoveStatus) => {
  const bytes = status.plan?.bytes ?? 0;
  return bytes > 0 ? Math.min(1, status.progress.bytes / bytes) : 0;
};

/** The words of a move that has ended, as one library's side sees it, a sentence each; nothing while it runs. */
export const endWords = ($t: MessageFormatter, status: MoveStatus, side: MoveSide | undefined): string[] => {
  const names = moveNames(status);
  const moved = doneCount(status);
  const stayed = stayedCount(status);
  const both = status.progress.bothLibraries;
  // copies in the destination whose originals stayed: the source counts them, the destination lists them (D7)
  const inBoth = both > 0 ? [$t('moves_in_both', { values: { ...names, count: both } })] : [];
  switch (status.state) {
    case 'done': {
      if (side === 'destination') {
        return [
          $t('moves_done_from', { values: { ...names, count: moved } }),
          ...(stayed > 0 ? [$t('moves_done_from_held', { values: { ...names, count: stayed } })] : []),
        ];
      }
      return [
        $t('moves_done', { values: { ...names, count: moved } }),
        ...(stayed > 0 ? [$t('moves_done_held', { values: { ...names, count: stayed } })] : []),
        ...(both > 0 ? [$t('moves_unfinished', { values: { ...names, count: both } })] : []),
      ];
    }
    case 'cancelled': {
      return [$t('moves_cancelled', { values: { ...names, moved } }), ...inBoth];
    }
    case 'expired': {
      return [$t('moves_expired', { values: names })];
    }
    case 'failed': {
      return [$t('moves_failed', { values: { ...names, reason: failureWords($t, status) } }), ...inBoth];
    }
    case 'refused': {
      return [errorWords($t, status.reason ?? 'failed', names)];
    }
    default: {
      return [];
    }
  }
};
