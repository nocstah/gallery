import { INSPECTOR_TITLE, INSPECTOR_WINDOW } from '$lib/managers/inspector-link.svelte';
import { load } from './+page';

const { authenticate, getFormatter } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getFormatter: vi.fn(),
}));

vi.mock('$lib/utils/auth', () => ({ authenticate }));
vi.mock(import('$lib/utils/i18n'), async (importOriginal) => ({
  ...(await importOriginal()),
  getFormatter,
}));

// Local Omarchy layer: the owner's Hyprland rule sends a window whose title starts "Gallery inspector" to the Dell
describe('inspector page load', () => {
  const url = new URL('https://gallery.test/inspector?from=main');

  beforeEach(() => {
    vi.resetAllMocks();
    getFormatter.mockResolvedValue((key: string) => key);
    document.title = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the window Gallery opened for the inspector before anything is asked of the server', async () => {
    vi.spyOn(globalThis as unknown as Window, 'name', 'get').mockReturnValue(INSPECTOR_WINDOW);
    authenticate.mockImplementation(() => {
      expect(document.title).toBe(INSPECTOR_TITLE);
    });

    const data = await load({ url } as never);

    expect(authenticate).toHaveBeenCalledWith(url);
    expect(data.meta.title).toBe(INSPECTOR_TITLE);
  });

  it('keeps that name out of an ordinary tab, whose browser window would go to the Dell with every tab', async () => {
    const data = await load({ url } as never);

    expect(document.title).toBe('');
    expect(data.meta.title).toBe('inspector_window');
    expect(data.meta.title.startsWith(INSPECTOR_TITLE)).toBe(false);
  });
});
