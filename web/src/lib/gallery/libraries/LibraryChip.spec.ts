import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import {
  libraryContextFile,
  mainLibrary,
  secondLibrary,
  serving,
  type TestLibrary,
} from '@test-data/factories/library-context-factory';
import LibraryChip from './LibraryChip.svelte';
import { loadLibraryContext, resetLibraryContext } from './library-context.svelte';

// Local Omarchy layer: the bar's chip, the open library's name in its colour beside the mark: wherever Kioku lists
// another library (Main too), and any library but Main always; never in a vault's Gallery.

const main = mainLibrary;
const second = secondLibrary;

const load = (current: TestLibrary, libraries: TestLibrary[]) =>
  loadLibraryContext(serving(libraryContextFile(current, libraries)));

const chip = () => screen.queryByTestId('library-chip');

describe('LibraryChip', () => {
  beforeEach(() => {
    resetLibraryContext();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetLibraryContext();
  });

  it("names the open library in its colour, with a label that says it is the library's name", async () => {
    await load(second, [main, second]);
    render(LibraryChip);

    const room = chip();
    expect(room).toBeInTheDocument();
    expect(room).toHaveTextContent('Second');
    const frame = room?.querySelector('.ws-library-chip') as HTMLElement;
    expect(frame.style.getPropertyValue('--ws-library')).toBe('#3d7fa6');
    expect(frame).toHaveAttribute('title', 'libraries_open_here');
  });

  it('names Main once Kioku lists another library', async () => {
    await load(main, [main, second]);
    render(LibraryChip);

    expect(chip()).toHaveTextContent('Main');
    expect((chip()?.querySelector('.ws-library-chip') as HTMLElement).style.getPropertyValue('--ws-library')).toBe(
      '#bf5b74',
    );
  });

  it('names a library other than Main even when its context lists no other', async () => {
    await load(second, [second]);
    render(LibraryChip);

    expect(chip()).toHaveTextContent('Second');
  });

  it('shows nothing without a library context, or in Main alone', async () => {
    const { unmount } = render(LibraryChip);
    await tick();
    expect(chip()).not.toBeInTheDocument();
    unmount();

    await load(main, [main]);
    render(LibraryChip);
    await tick();
    expect(chip()).not.toBeInTheDocument();
  });

  it("shows nothing in a vault's Gallery", async () => {
    await load(second, [main, second]);
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    render(LibraryChip);
    await tick();

    expect(chip()).not.toBeInTheDocument();
  });
});
