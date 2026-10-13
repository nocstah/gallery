import { AssetVisibility } from '@immich/sdk';
import { planDone, planMove, type TodoFrom } from '$lib/managers/todo-manager.svelte';

// Local Omarchy layer: To do takes photos out of Photos and Mark done puts each back where it came from
describe('To do', () => {
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

  it('keeps the note of a photo already in To do, and hides one that was unarchived meanwhile', () => {
    const { notes, archive } = planMove(['photos', 'archived'], visibility, new Set());
    expect(archive).toEqual(['photos']);
    expect(notes).toEqual([{ id: 'photos', from: 'timeline' }]);
  });

  it('never touches a photo in the Locked Folder', () => {
    expect(planMove(['locked'], visibility, new Set(['locked']))).toEqual({ notes: [], archive: [] });
  });

  it('puts back in Photos only what came from there and is still archived', () => {
    const now = new Map<string, string | undefined>([
      ['photos', AssetVisibility.Archive],
      ['archived', AssetVisibility.Archive],
      ['locked', AssetVisibility.Locked],
      ['unnoted', AssetVisibility.Archive],
      ['unarchived', AssetVisibility.Timeline],
    ]);
    const notes = new Map<string, TodoFrom | undefined>([
      ['photos', 'timeline'],
      ['archived', 'archive'],
      ['locked', 'timeline'],
      ['unnoted', undefined],
      ['unarchived', 'timeline'],
    ]);
    expect(planDone([...now.keys()], now, notes)).toEqual(['photos']);
  });
});
