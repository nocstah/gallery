import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { libraryContextFile, mainLibrary, secondLibrary, serving } from '@test-data/factories/library-context-factory';
import MoveHeldModal from './MoveHeldModal.svelte';
import { MOVER_ORIGIN, parseStatus, type MoveStatus } from './mover';

// Local Omarchy layer: the photos a move left in this library (gallery/moves, S5): this library's own thumbnails,
// grouped under the words of the reason each stayed, read from the mover's status for the source. A fake receiver
// answers through fetch. Synthetic libraries and ids only.

const MOVE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ids = {
  a: '3f1c8a52-8f6e-4e0a-9d7e-2b5f1c9a4d10',
  b: '7d2e9b63-1a4c-4f8e-b0d5-6c3a2e1f9b07',
  c: 'c4b8e1f2-6d3a-4e9b-8f07-1a2b3c4d5e6f',
  d: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d',
};

const ended = (overrides: Record<string, unknown> = {}) =>
  parseStatus({
    move: MOVE,
    source: 'second',
    destination: 'main',
    state: 'done',
    plan: { items: 10, new: 6, present: 0, held: 4 },
    progress: { moved: 6 },
    endedAt: '2026-10-29T21:00:00Z',
    ...overrides,
  }) as MoveStatus;

const held = [
  { asset: ids.a, reason: 'tombstone' },
  { asset: ids.b, reason: 'cannot-read' },
  { asset: ids.c, reason: 'tombstone' },
  { asset: ids.d, reason: 'a-newer-reason' },
];

let onClose: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  resetLibraryContext();
  await loadLibraryContext(serving(libraryContextFile(secondLibrary, [mainLibrary, secondLibrary])));
  onClose = vi.fn();
});

// Drain bits-ui Modal's deferred body-scroll-lock cleanup before happy-dom tears down `document`.
afterEach(async () => {
  vi.restoreAllMocks();
  resetLibraryContext();
  await new Promise((resolve) => setTimeout(resolve, 50));
});

describe('MoveHeldModal', () => {
  it('asks the mover for the photos that stay, and groups them under their reason’s words', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ...ended(), held }));
    render(MoveHeldModal, { move: ended(), onClose });

    const tombstoneWords = await screen.findByText('moves_hold_tombstone');
    const tombstones = tombstoneWords.closest('section') as HTMLElement;
    expect(
      within(tombstones)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([`/photos/${ids.a}`, `/photos/${ids.c}`]);
    expect(within(tombstones).getByText('2')).toBeInTheDocument();
    const unreadable = screen.getByText('moves_hold_cannot_read').closest('section') as HTMLElement;
    expect(within(unreadable).getAllByRole('link')).toHaveLength(1);
    // a reason this page does not know keeps its photos, under plain words
    expect(screen.getByText('moves_hold_other')).toBeInTheDocument();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe(`${MOVER_ORIGIN}/v1/moves/${MOVE}`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit' });
  });

  it('shows each photo with this library’s own thumbnail, and closes on the way to it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ...ended(), held: held.slice(0, 1) }));
    render(MoveHeldModal, { move: ended(), onClose });
    const link = await screen.findByRole('link');
    const image = link.querySelector('img');
    expect(image?.getAttribute('src')).toContain(`/assets/${ids.a}/thumbnail`);
    expect(image?.getAttribute('src')).not.toContain(MOVER_ORIGIN);
    // the test stays on its page; the modal closes as the link is followed
    link.addEventListener('click', (event) => event.preventDefault());
    await fireEvent.click(link);
    expect(onClose).toHaveBeenCalled();
  });

  it('says it in words when the mover does not answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(MoveHeldModal, { move: ended(), onClose });
    expect(await screen.findByText('moves_error_unreachable')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
