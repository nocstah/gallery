import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FORK_LOCALES } from '$lib/i18n/fork-locales';
import { HOLD_REASONS, holdKey, holdWords, isForceable, isHoldReason, OTHER_HOLD } from './hold-reasons';
import { ERRORS, FAILURES, PAUSES, PHASES } from './move-words';

// Local Omarchy layer: why a move leaves photos where they are (gallery/moves). Every reason the pages show has its
// words in English and the nine locales, only the import's three marks may be moved anyway, and no reason's words
// say anything of a Locked Folder: its cases come under neutral reasons the pages share with ordinary ones.

const MERGED = path.resolve(process.cwd(), '../i18n/gallery/merged');
const OVERLAY = path.resolve(process.cwd(), '../i18n/gallery');
const read = (dir: string, code: string) =>
  JSON.parse(readFileSync(path.join(dir, `${code}.json`), 'utf8')) as Record<string, string>;

const LOCALES = ['en', ...FORK_LOCALES];

describe('hold reasons', () => {
  it('lets only the import’s three marks be moved anyway', () => {
    const forceable = Object.keys(HOLD_REASONS).filter((reason) => isForceable(reason));
    expect(forceable.sort()).toEqual(['another-copy', 'deleted-before', 'deleted-in-main']);
    expect(isForceable('tombstone')).toBe(false);
    expect(isForceable('made-up')).toBe(false);
  });

  it('shows the Locked Folder’s cases only under the neutral reasons', () => {
    for (const exact of ['locked', 'offline', 'in-destination-locked']) {
      expect(isHoldReason(exact)).toBe(false);
    }
    expect(isHoldReason('cannot-read')).toBe(true);
    expect(isHoldReason('not-verified')).toBe(true);
  });

  it('has words for a reason it does not know', () => {
    expect(holdKey('a-newer-reason')).toBe(OTHER_HOLD);
    const $t = vi.fn((key: string) => key);
    expect(holdWords($t as never, 'tombstone', { source: 'Second', library: 'Main' })).toBe('moves_hold_tombstone');
    expect($t).toHaveBeenCalledWith('moves_hold_tombstone', { values: { source: 'Second', library: 'Main' } });
  });

  describe.each(LOCALES)('%s', (code) => {
    const overlay = read(OVERLAY, code);
    const merged = read(MERGED, code);
    const words = [...Object.values(HOLD_REASONS).map(({ words }) => words), OTHER_HOLD];

    it('has words for every reason', () => {
      for (const key of words) {
        expect(overlay[key], key).toBeTruthy();
      }
    });

    it('never names a Locked Folder in a reason', () => {
      const locked = merged.locked_folder.toLowerCase();
      for (const key of words) {
        const text = overlay[key].toLowerCase();
        expect(text, key).not.toContain(locked);
        if (code === 'en') {
          expect(text, key).not.toMatch(/lock/);
        }
      }
    });

    it('has words for every phase, pause, error and failure the pages show', () => {
      const keys = [
        ...Object.values(PHASES).map(({ words }) => words),
        ...Object.values(PAUSES),
        ...Object.values(ERRORS),
        ...Object.values(FAILURES),
      ];
      for (const key of keys) {
        expect(overlay[key], key).toBeTruthy();
      }
    });

    it('translates every string of the moves that English has', () => {
      const english = Object.keys(read(OVERLAY, 'en')).filter((key) => key.startsWith('moves_'));
      expect(english.length).toBeGreaterThan(100);
      expect(english.filter((key) => !Object.hasOwn(overlay, key) || overlay[key] === '')).toEqual([]);
    });
  });
});
