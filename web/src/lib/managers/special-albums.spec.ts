import { AssetVisibility } from '@immich/sdk';
import { planDone, planMove, type From } from '$lib/managers/special-albums.svelte';

// Local Omarchy layer: a special album (To do, Villa) takes photos out of Photos, and taking them out of it puts each
// back where it came from, unless another special album still holds it
describe('special albums', () => {
  const visibility = new Map<string, string | undefined>([
    ['photos', AssetVisibility.Timeline],
    ['archived', AssetVisibility.Archive],
    ['locked', AssetVisibility.Locked],
  ]);

  it('archives what was in Photos and notes where each photo came from', () => {
    const { notes, archive } = planMove(['photos', 'archived'], visibility, new Set(['photos', 'archived']));
    expect(archive).toEqual(['photos']);
    expect(notes).toEqual([
      { id: 'photos', from: 'timeline' },
      { id: 'archived', from: 'archive' },
    ]);
  });

  it('keeps the note of a photo already in the album, and hides one that was unarchived meanwhile', () => {
    const { notes, archive } = planMove(['photos', 'archived'], visibility, new Set());
    expect(archive).toEqual(['photos']);
    expect(notes).toEqual([{ id: 'photos', from: 'timeline' }]);
  });

  it('notes Photos as the origin of a photo another special album took out of there', () => {
    const elsewhere = new Map<string, From | undefined>([['archived', 'timeline']]);
    const { notes, archive } = planMove(['archived'], visibility, new Set(['archived']), elsewhere);
    expect(archive).toEqual([]);
    expect(notes).toEqual([{ id: 'archived', from: 'timeline' }]);
  });

  it('never touches a photo in the Locked Folder', () => {
    expect(planMove(['locked'], visibility, new Set(['locked']))).toEqual({ notes: [], archive: [] });
  });

  const now = new Map<string, string | undefined>([
    ['photos', AssetVisibility.Archive],
    ['archived', AssetVisibility.Archive],
    ['locked', AssetVisibility.Locked],
    ['unnoted', AssetVisibility.Archive],
    ['unarchived', AssetVisibility.Timeline],
  ]);
  const notes = new Map<string, From | undefined>([
    ['photos', 'timeline'],
    ['archived', 'archive'],
    ['locked', 'timeline'],
    ['unnoted', undefined],
    ['unarchived', 'timeline'],
  ]);

  it('puts back in Photos only what came from there and is still archived', () => {
    expect(planDone([...now.keys()], now, notes)).toEqual(['photos']);
  });

  it('keeps a photo out of Photos while another special album holds it', () => {
    const elsewhere = new Map<string, From | undefined>([['photos', 'timeline']]);
    expect(planDone([...now.keys()], now, notes, elsewhere)).toEqual([]);
  });
});
