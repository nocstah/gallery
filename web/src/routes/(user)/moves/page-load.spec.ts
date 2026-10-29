import { mainLibrary } from '@test-data/factories/library-context-factory';
import { load } from './+page';

// Local Omarchy layer: the move page's load (gallery/moves): the owner's only, the sign-in coming back with the
// move's address; and none at all in a vault's Gallery, which is none of Kioku's libraries.

const { authenticate, getFormatter } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getFormatter: vi.fn(),
}));

vi.mock('$lib/utils/auth', () => ({ authenticate }));
vi.mock(import('$lib/utils/i18n'), async (importOriginal) => ({
  ...(await importOriginal()),
  getFormatter,
}));

const url = new URL('/moves?move=0f8fad5b-d9cb-469f-a165-70867728950e&from=second', mainLibrary.url);

describe('the move page load', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getFormatter.mockResolvedValue((key: string) => key);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is the owner’s: it asks for the owner, with the move’s address kept for the sign-in', async () => {
    const data = await load({ url } as never);
    expect(authenticate).toHaveBeenCalledWith(url, { admin: true });
    expect(data?.meta.title).toBe('moves_list_title');
  });

  it('sends a vault’s Gallery to Photos before anything else', async () => {
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    await expect(load({ url } as never)).rejects.toMatchObject({ status: 307, location: '/photos' });
    expect(authenticate).not.toHaveBeenCalled();
  });
});
