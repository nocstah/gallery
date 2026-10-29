import { addMessages, locale } from 'svelte-i18n';
import { get } from 'svelte/store';
import en from '$i18n/en.json';
import {
  libraryContextFile,
  mainLibrary,
  secondLibrary,
  serving,
  type TestLibrary,
} from '@test-data/factories/library-context-factory';
import { loadLibraryContext, resetLibraryContext } from './library-context.svelte';
import { chipLibrary, libraryNamed, libraryTitle, namedLibrary } from './library-words';

// Local Omarchy layer: the open library is never in doubt. Wherever Kioku lists another library the bar's chip names
// it (Main too); outside Main the tab's title and every destructive confirmation name it as well. Main alone, and a
// Kioku without a library context, read exactly as before.

const main = mainLibrary;
const second = secondLibrary;

const load = (current: TestLibrary, libraries: TestLibrary[]) =>
  loadLibraryContext(serving(libraryContextFile(current, libraries)));

beforeAll(() => {
  addMessages(get(locale) ?? 'dev', { libraries_named: en.libraries_named });
});

beforeEach(() => {
  resetLibraryContext();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetLibraryContext();
});

describe("the tab's title", () => {
  it("is the page's own without a library context, and in Main", async () => {
    expect(libraryTitle('Photos')).toBe('Photos');
    await load(main, [main, second]);
    expect(libraryTitle('Photos')).toBe('Photos');
  });

  it('names the library after the page outside Main', async () => {
    await load(second, [main, second]);
    expect(libraryTitle('Photos')).toBe('Photos - Second');
    expect(libraryTitle('Kioku inspector')).toMatch(/^Kioku inspector/);
  });

  it('names it outside Main even where the context lists no other library', async () => {
    await load(second, [second]);
    expect(libraryTitle('Trash')).toBe('Trash - Second');
  });

  it("names nothing in a vault's Gallery", async () => {
    await load(second, [main, second]);
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(libraryTitle('Photos')).toBe('Photos');
    expect(namedLibrary()).toBeUndefined();
  });
});

describe("the bar's chip", () => {
  it('shows nothing without a library context, or in Main alone', async () => {
    expect(chipLibrary()).toBeUndefined();
    await load(main, [main]);
    expect(chipLibrary()).toBeUndefined();
  });

  it('shows Main once Kioku lists another library', async () => {
    await load(main, [main, second]);
    expect(chipLibrary()).toEqual({ id: 'main', name: 'Main', colour: '#bf5b74' });
  });

  it('shows any library but Main always', async () => {
    await load(second, [second]);
    expect(chipLibrary()).toEqual({ id: 'second', name: 'Second', colour: '#3d7fa6' });
    resetLibraryContext();
    await load(second, [main, second]);
    expect(chipLibrary()?.name).toBe('Second');
  });

  it("shows nothing in a vault's Gallery", async () => {
    await load(second, [main, second]);
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(chipLibrary()).toBeUndefined();
  });
});

describe('a destructive confirmation', () => {
  it('reads as before in Main and without a library context', async () => {
    expect(libraryNamed('Trashed 3 photos')).toBe('Trashed 3 photos');
    await load(main, [main, second]);
    expect(libraryNamed('Empty the trash?')).toBe('Empty the trash?');
  });

  it('leads with the library outside Main', async () => {
    await load(second, [main, second]);
    expect(libraryNamed('Trashed 3 photos')).toBe('Second: Trashed 3 photos');
    expect(libraryNamed('Permanently delete photos')).toBe('Second: Permanently delete photos');
  });
});
