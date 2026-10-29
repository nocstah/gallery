import type { CommandItem } from '$lib/managers/command-items';
import {
  cleanupLibrary,
  libraryContextFile,
  mainLibrary,
  secondLibrary,
  serving,
} from '@test-data/factories/library-context-factory';
import { loadLibraryContext, resetLibraryContext } from './library-context.svelte';
import { addLibraryCommands, canSwitchLibraries, libraryCommands, switcherRows } from './switcher';

// Local Omarchy layer: the Libraries switcher shows only where switching works: Kioku lists another library, the page
// is on this computer (every library's address is), the browser is this desktop's, and it is not a vault's Gallery.
// Switching is a plain navigation to the other library's own address.

const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';
const here = new URL('/photos', secondLibrary.url);

const load = (libraries: unknown[], current = secondLibrary) =>
  loadLibraryContext(serving(libraryContextFile(current, libraries)));

beforeEach(() => {
  resetLibraryContext();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetLibraryContext();
});

describe('canSwitchLibraries', () => {
  it('shows on this desktop when Kioku lists another library', async () => {
    await load([mainLibrary, secondLibrary]);
    for (const url of [here.href, 'http://localhost:2286/albums', 'http://127.0.0.1:2286', 'http://[::1]:2286']) {
      expect(canSwitchLibraries(new URL(url), desktop), url).toBe(true);
    }
  });

  it('does not show without a library context, or with this library alone', async () => {
    expect(canSwitchLibraries(here, desktop)).toBe(false);
    await load([secondLibrary]);
    expect(canSwitchLibraries(here, desktop)).toBe(false);
  });

  it('does not show when every other listed library fails its checks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await load([{ ...mainLibrary, url: 'https://photos.example.com' }, secondLibrary]);
    expect(canSwitchLibraries(here, desktop)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it.each([
    'https://photos.example.com/photos',
    'https://second.localhost.example.com:2286/photos',
    'http://100.64.0.1:2283/photos',
    'http://192.0.2.10:2283/photos',
  ])('does not show away from this computer: %s', async (url) => {
    await load([mainLibrary, secondLibrary]);
    expect(canSwitchLibraries(new URL(url), desktop)).toBe(false);
  });

  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    'Mozilla/5.0 (Linux; Android 16) Mobile',
    'Mozilla/5.0 (Linux; Android 16; Tablet)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)',
    '',
  ])('does not show in a browser that is not this desktop: %s', async (agent) => {
    await load([mainLibrary, secondLibrary]);
    expect(canSwitchLibraries(here, agent)).toBe(false);
  });

  it("does not show in a vault's Gallery", async () => {
    await load([mainLibrary, secondLibrary]);
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(canSwitchLibraries(here, desktop)).toBe(false);
  });
});

describe('switcherRows', () => {
  it("lists every library in the context's order, this one marked and leading to its own Photos", async () => {
    await load([mainLibrary, secondLibrary, cleanupLibrary]);
    expect(switcherRows()).toEqual([
      { id: 'main', name: 'Main', colour: '#bf5b74', href: mainLibrary.url, current: false },
      { id: 'second', name: 'Second', colour: '#3d7fa6', href: '/photos', current: true },
      { id: 'my-cleanup', name: 'Cleanup', colour: '#4f8a5b', href: cleanupLibrary.url, current: false },
    ]);
  });

  it('puts this library first when the list leaves it out', async () => {
    await load([mainLibrary]);
    expect(switcherRows().map(({ id, current }) => [id, current])).toEqual([
      ['second', true],
      ['main', false],
    ]);
  });

  it('has no rows without a library context', () => {
    expect(switcherRows()).toEqual([]);
  });
});

describe("Ctrl+K's Switch to", () => {
  it('has one command for each other library, named after it, opening its address in this tab', async () => {
    await load([mainLibrary, secondLibrary, cleanupLibrary]);
    const commands = libraryCommands();

    expect(commands.map(({ id }) => id)).toEqual(['cmd:library_main', 'cmd:library_my_cleanup']);
    for (const command of commands) {
      expect(command.id).toMatch(/^cmd:[a-z][a-z0-9_]*$/);
      expect(command.labelKey).toBe('libraries_switch_to');
      expect(command.descriptionKey).toBe('libraries_switch_description');
    }
    expect(commands.map(({ labelValues }) => labelValues)).toEqual([{ name: 'Main' }, { name: 'Cleanup' }]);

    const assign = vi.fn();
    vi.stubGlobal('location', { href: here.href, assign });
    try {
      await commands[0].handler();
      expect(assign).toHaveBeenCalledWith(mainLibrary.url);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('is available only where the switcher shows', async () => {
    await load([mainLibrary, secondLibrary]);
    const [command] = libraryCommands();
    const context = {} as never;

    vi.stubGlobal('location', { href: here.href });
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(desktop);
    try {
      expect(command.isAvailable?.(context)).toBe(true);
      vi.stubGlobal('location', { href: 'https://photos.example.com/photos' });
      expect(command.isAvailable?.(context)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("has none without a library context, with this library alone, or in a vault's Gallery", async () => {
    expect(libraryCommands()).toEqual([]);
    await load([secondLibrary]);
    expect(libraryCommands()).toEqual([]);
    resetLibraryContext();
    await load([mainLibrary, secondLibrary]);
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(libraryCommands()).toEqual([]);
  });

  it("joins Ctrl+K's commands once the context is known", async () => {
    const theme: CommandItem = {
      id: 'cmd:theme',
      labelKey: 'theme',
      descriptionKey: 'cmdk_cmd_theme_description',
      icon: 'M0,0',
      handler: vi.fn(),
    };
    const commands = [theme];
    expect(addLibraryCommands(commands)).toBe(commands);
    expect(commands).toHaveLength(1);

    await load([mainLibrary, secondLibrary]);
    expect(commands.map(({ id }) => id)).toEqual(['cmd:theme', 'cmd:library_main']);
  });
});
