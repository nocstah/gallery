import { mainLibrary } from '@test-data/factories/library-context-factory';
import { load } from './+page';

// Local Omarchy layer: the page load of "From the beginning" (gallery/series): the owner's only, as the AI inbox, the
// sign-in coming back to the page.

const { authenticate, getFormatter } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getFormatter: vi.fn(),
}));

vi.mock('$lib/utils/auth', () => ({ authenticate }));
vi.mock(import('$lib/utils/i18n'), async (importOriginal) => ({
  ...(await importOriginal()),
  getFormatter,
}));

describe('the page load of From the beginning', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFormatter.mockResolvedValue((key: string) => key);
  });

  it('asks for the owner, with the page’s address kept for the sign-in, and names the page', async () => {
    const url = new URL('/from-the-beginning', mainLibrary.url);
    const data = await load({ url } as never);
    expect(authenticate).toHaveBeenCalledWith(url, { admin: true });
    expect(data?.meta.title).toBe('memory_series_title');
  });
});
