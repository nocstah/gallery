import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import {
  byteShare,
  doneCount,
  endWords,
  errorWords,
  failureWords,
  goingCount,
  libraryName,
  moveNames,
  pauseWords,
  phaseWords,
  progressWords,
  QUIET_FROM,
  QUIET_TO,
  quietHours,
  sideOf,
  stayedCount,
} from './move-words';
import { parseStatus, type MoveStatus } from './mover';

// Local Omarchy layer: how the pages put a move into words and numbers (gallery/moves). The $t here returns the key
// and its values, so each assertion sees which words were chosen and what they name. Synthetic libraries only.

const $t = ((key: string, options?: { values?: Record<string, unknown> }) =>
  options?.values ? `${key} ${JSON.stringify(options.values)}` : key) as never;

const move = (overrides: Record<string, unknown> = {}): MoveStatus =>
  parseStatus({
    move: '0f8fad5b-d9cb-469f-a165-70867728950e',
    source: 'second',
    destination: 'main',
    state: 'running',
    phase: 'copying',
    plan: { items: 10, bytes: 1000, new: 6, present: 2, held: 2 },
    holds: [
      { reason: 'another-copy', items: 1, forceable: true },
      { reason: 'tombstone', items: 1, forceable: false },
    ],
    progress: { moved: 3, present: 1, copied: 4, bothLibraries: 0, bytes: 250 },
    ...overrides,
  }) as MoveStatus;

beforeEach(async () => {
  resetLibraryContext();
  await loadLibraryContext(serving(libraryContextFile(secondLibrary, [mainLibrary, secondLibrary])));
});

afterEach(() => {
  resetLibraryContext();
});

describe('the words of a move', () => {
  it('names the libraries from the context, and keeps an id the context does not list', () => {
    expect(moveNames(move())).toEqual({ source: 'Second', library: 'Main' });
    expect(libraryName('third')).toBe('third');
  });

  it('knows this library’s side', () => {
    expect(sideOf(move(), 'second')).toBe('source');
    expect(sideOf(move(), 'main')).toBe('destination');
    expect(sideOf(move(), 'third')).toBeUndefined();
    expect(sideOf(move(), undefined)).toBeUndefined();
  });

  it.each([
    ['preparing', 'moves_phase_copying', 'Main'],
    ['copying', 'moves_phase_copying', 'Main'],
    ['reading', 'moves_phase_reading', 'Main'],
    ['applying', 'moves_phase_checking', 'Main'],
    ['linking', 'moves_phase_checking', 'Main'],
    ['verifying', 'moves_phase_checking', 'Main'],
    ['flushing', 'moves_phase_checking', 'Main'],
    ['binning', 'moves_phase_binning', 'Main'],
    ['waiting-space', 'moves_phase_waiting_space', 'Main'],
    ['waiting-source', 'moves_phase_waiting', 'Second'],
    ['waiting-destination', 'moves_phase_waiting', 'Main'],
    ['destination-paused', 'moves_phase_destination_paused', 'Main'],
    ['quiet-hours', 'moves_phase_quiet', 'Main'],
  ])('puts the phase %s as %s, naming %s', (phase, key, library) => {
    expect(phaseWords($t, move({ phase }))).toBe(`${key} ${JSON.stringify({ library, time: QUIET_TO })}`);
  });

  it('has no words for a phase it does not know', () => {
    expect(phaseWords($t, move({ phase: 'dreaming' }))).toBeUndefined();
    expect(phaseWords($t, move({ phase: null }))).toBeUndefined();
  });

  it('waits out the quiet hours until their end, the mover’s when it says them', () => {
    expect(QUIET_TO).toBe('03:30');
    const quiet = move({ phase: 'quiet-hours', quiet: { from: '02:00', to: '04:15' } });
    expect(phaseWords($t, quiet)).toBe(`moves_phase_quiet ${JSON.stringify({ library: 'Main', time: '04:15' })}`);
  });

  it('keeps the quiet hours of Main’s nightly backup only for a move into Main, unless the mover says otherwise', () => {
    expect([QUIET_FROM, QUIET_TO]).toEqual(['01:45', '03:30']);
    // a receiver that does not say: the default, into Main only
    expect(quietHours(move(), true)).toEqual({ from: '01:45', to: '03:30' });
    expect(quietHours(move(), false)).toBeUndefined();
    // a receiver that says: its window, or none
    expect(quietHours(move({ quiet: { from: '02:00', to: '04:15' } }), false)).toEqual({ from: '02:00', to: '04:15' });
    expect(quietHours(move({ quiet: null }), true)).toBeUndefined();
    expect(quietHours(move({ quiet: { from: 'soon', to: 'later' } }), true)).toBeUndefined();
  });

  it('says why a move is paused, and why it failed', () => {
    expect(pauseWords($t, move({ state: 'paused', reason: 'restarted' }))).toMatch(/^moves_pause_restarted /);
    expect(pauseWords($t, move({ state: 'paused', reason: 'trash-off' }))).toMatch(/^moves_pause_trash_off /);
    expect(pauseWords($t, move({ state: 'paused', reason: 'nap' }))).toMatch(/^moves_pause_other /);
    expect(failureWords($t, move({ state: 'failed', reason: 'person-unknown' }))).toMatch(
      /^moves_failure_person_unknown/,
    );
    expect(failureWords($t, move({ state: 'failed', reason: 'odd' }))).toMatch(/^moves_failure_internal/);
  });

  it.each([
    ['unreachable', 'moves_error_unreachable'],
    ['busy', 'moves_error_busy'],
    ['time-zone', 'moves_error_time_zone'],
    ['trash-off', 'moves_error_trash_off'],
    ['source-unreachable', 'moves_error_source_unreachable'],
    ['something-new', 'moves_error_failed'],
  ])('puts the error %s as %s', (code, key) => {
    expect(errorWords($t, code)).toMatch(new RegExp(`^${key} `));
  });

  it('counts what goes, what is done and what stays, the holds moved anyway included', () => {
    expect(goingCount(move())).toBe(8);
    expect(goingCount(move(), ['another-copy'])).toBe(9);
    expect(goingCount(move({ forced: ['another-copy'] }))).toBe(9);
    expect(doneCount(move())).toBe(4);
    expect(stayedCount(move())).toBe(6);
    expect(byteShare(move())).toBe(0.25);
    expect(byteShare(move({ plan: { items: 1, bytes: 0 } }))).toBe(0);
    expect(byteShare(move({ progress: { bytes: 5000 } }))).toBe(1);
  });

  it('says how far a move has got, from either side', () => {
    expect(progressWords($t, move(), 'source')).toBe(
      `moves_progress ${JSON.stringify({ source: 'Second', library: 'Main', done: 4, total: 8 })}`,
    );
    expect(progressWords($t, move(), 'destination')).toMatch(/^moves_progress_from /);
  });

  it('says how a move ended, as each side sees it', () => {
    const done = move({ state: 'done', progress: { moved: 7, present: 1, bothLibraries: 2 } });
    expect(endWords($t, done, 'source').map((line) => line.split(' ', 1)[0])).toEqual([
      'moves_done',
      'moves_done_held',
      'moves_unfinished',
    ]);
    expect(endWords($t, done, 'destination').map((line) => line.split(' ', 1)[0])).toEqual([
      'moves_done_from',
      'moves_done_from_held',
    ]);
    const all = move({ state: 'done', progress: { moved: 8, present: 2 } });
    expect(endWords($t, all, 'source').map((line) => line.split(' ', 1)[0])).toEqual(['moves_done']);
    const cancelled = move({ state: 'cancelled', progress: { moved: 3, present: 0, bothLibraries: 4 } });
    expect(endWords($t, cancelled, 'source')).toEqual([
      `moves_cancelled ${JSON.stringify({ source: 'Second', library: 'Main', moved: 3 })}`,
      `moves_in_both ${JSON.stringify({ source: 'Second', library: 'Main', count: 4 })}`,
    ]);
    expect(endWords($t, move({ state: 'expired' }), 'source')[0]).toMatch(/^moves_expired/);
    expect(endWords($t, move({ state: 'refused', reason: 'versions' }), 'source')[0]).toMatch(/^moves_error_versions/);
    expect(endWords($t, move({ state: 'failed', reason: 'plan-failed' }), 'source')[0]).toMatch(/^moves_failed /);
    expect(endWords($t, move(), 'source')).toEqual([]);
  });
});
