import { removeObjects } from './remove-objects.svelte';

// Local Omarchy layer: the viewer offers the brush only when Curator answers and knows restore.inpaint.

const { kinds } = vi.hoisted(() => ({ kinds: vi.fn() }));

vi.mock('$lib/utils/curator', () => ({ curator: { kinds } }));

describe('removeObjects', () => {
  beforeEach(() => {
    removeObjects.reset();
  });

  it('is offered when Curator has the restore.inpaint job, and asks only once', async () => {
    kinds.mockResolvedValue([
      { kind: 'restore.photos', title: 'Restore', heavy: true },
      { kind: 'restore.inpaint', title: 'Remove what was painted over', heavy: false },
    ]);
    removeObjects.check();
    removeObjects.check();
    await vi.waitFor(() => expect(removeObjects.available).toBe(true));
    expect(kinds).toHaveBeenCalledTimes(1);
  });

  it('is not offered by an older Curator, or when Curator does not answer', async () => {
    kinds.mockResolvedValue([{ kind: 'restore.photos', title: 'Restore', heavy: true }]);
    removeObjects.check();
    await vi.waitFor(() => expect(kinds).toHaveBeenCalled());
    expect(removeObjects.available).toBe(false);

    removeObjects.reset();
    kinds.mockRejectedValue(new Error('Curator is not answering'));
    removeObjects.check();
    await vi.waitFor(() => expect(kinds).toHaveBeenCalledTimes(2));
    expect(removeObjects.available).toBe(false);
  });

  it('opens for one photo and closes', () => {
    removeObjects.open('a');
    expect(removeObjects.assetId).toBe('a');
    removeObjects.close();
    expect(removeObjects.assetId).toBeUndefined();
  });
});
