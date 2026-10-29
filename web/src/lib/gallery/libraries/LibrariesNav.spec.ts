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
import LibrariesNav from './LibrariesNav.svelte';
import { loadLibraryContext, resetLibraryContext } from './library-context.svelte';

// Local Omarchy layer: the sidebar's Libraries group, every library with its colour and this one marked; another one is
// a plain link to its own address in this tab. Only on this desktop, at a local address, with another library listed.

const mocks = vi.hoisted(() => ({
  page: { url: new URL('http://localhost:2286/photos') },
  sidebarModeStore: { layout: 'expanded' as 'overlay' | 'rail' | 'expanded', railExpanded: false },
}));
vi.mock('$app/state', () => ({ page: mocks.page }));
vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: mocks.sidebarModeStore }));
vi.mock('$lib/components/sidebar/sidebar-nav-group.svelte', async () => {
  const module = await import('@test-data/mocks/sidebar-nav-group.stub.svelte');
  return { default: module.default };
});

const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';
const main = mainLibrary;
const second = secondLibrary;

const load = (libraries: TestLibrary[]) => loadLibraryContext(serving(libraryContextFile(second, libraries)));

const useAgent = (agent: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);

describe('LibrariesNav', () => {
  beforeEach(() => {
    resetLibraryContext();
    mocks.page.url = new URL('/photos', second.url);
    mocks.sidebarModeStore.layout = 'expanded';
    useAgent(desktop);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetLibraryContext();
  });

  it('lists every library with its colour, this one marked and the other one a plain link in this tab', async () => {
    await load([main, second]);
    render(LibrariesNav);

    expect(await screen.findByText('sidebar_libraries')).toBeInTheDocument();
    const rows = screen.getAllByTestId('library-row');
    expect(rows.map((row) => row.textContent?.trim())).toEqual(['Main', 'Second']);

    const other = screen.getByRole('link', { name: 'Main' });
    expect(other).toHaveAttribute('href', main.url);
    expect(other).not.toHaveAttribute('target');
    expect(other).not.toHaveAttribute('aria-current');
    expect(other).toHaveAttribute('data-active', 'false');
    expect(other).toHaveAttribute('rel', 'noreferrer');
    expect(other.querySelector('path')).toHaveAttribute('fill', '#bf5b74');

    const current = screen.getByRole('link', { name: 'Second' });
    expect(current).toHaveAttribute('href', '/photos');
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toHaveAttribute('data-active', 'true');
    expect(current.querySelector('path')).toHaveAttribute('fill', '#3d7fa6');
  });

  it('keeps the names for the rail, where only the colours show', async () => {
    mocks.sidebarModeStore.layout = 'rail';
    await load([main, second]);
    render(LibrariesNav);

    const other = await screen.findByRole('link', { name: 'Main' });
    expect(other).toHaveAttribute('title', 'Main');
    expect(other).toHaveAttribute('data-collapsed', 'true');
  });

  it('shows nothing without a library context, or with this library alone', async () => {
    const { unmount } = render(LibrariesNav);
    await tick();
    expect(screen.queryByTestId('library-row')).not.toBeInTheDocument();
    unmount();

    await load([second]);
    render(LibrariesNav);
    await tick();
    expect(screen.queryByTestId('library-row')).not.toBeInTheDocument();
    expect(screen.queryByText('sidebar_libraries')).not.toBeInTheDocument();
  });

  it('shows nothing away from this computer', async () => {
    mocks.page.url = new URL('https://photos.example.com/photos');
    await load([main, second]);
    render(LibrariesNav);
    await tick();
    expect(screen.queryByTestId('library-row')).not.toBeInTheDocument();
  });

  it("shows nothing in a phone's browser", async () => {
    useAgent('Mozilla/5.0 (Linux; Android 16) Mobile');
    await load([main, second]);
    render(LibrariesNav);
    await tick();
    expect(screen.queryByTestId('library-row')).not.toBeInTheDocument();
  });

  it("shows nothing in a vault's Gallery", async () => {
    await load([main, second]);
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    render(LibrariesNav);
    await tick();
    expect(screen.queryByTestId('library-row')).not.toBeInTheDocument();
  });
});
