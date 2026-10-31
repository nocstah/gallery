import { mainLibrary } from '@test-data/factories/library-context-factory';
import { load } from './+page';

// Local Omarchy layer: the page load of one series of From the beginning (gallery/series): the owner's only, as the
// list is, the sign-in coming back to the series' own address, and Curator's id read from it.

const { authenticate, getFormatter } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getFormatter: vi.fn(),
}));

vi.mock('$lib/utils/auth', () => ({ authenticate }));
vi.mock(import('$lib/utils/i18n'), async (importOriginal) => ({
  ...(await importOriginal()),
  getFormatter,
}));

const loadFor = (seriesId: string) => {
  const url = new URL(`/from-the-beginning/${seriesId}`, mainLibrary.url);
  return { url, data: load({ url, params: { seriesId } } as never) };
};

describe('the page load of one series', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFormatter.mockResolvedValue((key: string) => key);
  });

  it('asks for the owner, with the series’ address kept for the sign-in, and reads its id', async () => {
    const { url, data } = loadFor('7');
    const page = await data;
    expect(authenticate).toHaveBeenCalledWith(url, { admin: true });
    expect(page?.seriesId).toBe(7);
    expect(page?.meta.title).toBe('memory_series_title');
  });

  it.each(['0', '07', 'seven', '7.5', '-7', '1234567890123456'])('reads %s as no series', async (seriesId) => {
    const page = await loadFor(seriesId).data;
    expect(page?.seriesId).toBeNull();
  });
});
