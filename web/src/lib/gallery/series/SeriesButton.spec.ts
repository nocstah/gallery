import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import { secondWithout, serving } from '@test-data/factories/library-context-factory';
import SeriesButton from './series-button.test-wrapper.svelte';

// Local Omarchy layer: the Memories page's way to "From the beginning" (gallery/series): the owner's only, and only
// where this library's Curator offers what it adds to memories.

const mocks = vi.hoisted(() => ({ auth: { authenticated: true, user: { id: 'owner-id', isAdmin: true } } }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));

beforeEach(() => {
  resetLibraryContext();
  mocks.auth.user = { id: 'owner-id', isAdmin: true };
});

afterEach(() => {
  resetLibraryContext();
  vi.unstubAllEnvs();
});

describe('SeriesButton', () => {
  it('opens the page for the owner, by its name', () => {
    render(SeriesButton);
    const link = screen.getByRole('link', { name: 'memory_series_title' });
    expect(link).toHaveAttribute('href', '/from-the-beginning');
  });

  it.each([
    ['a family account', () => (mocks.auth.user = { id: 'family-id', isAdmin: false })],
    ['a vault’s Gallery', () => vi.stubEnv('VITE_KIOKU_EDITION', 'vault')],
  ])('is not there for %s', (_case, arrange) => {
    arrange();
    render(SeriesButton);
    expect(screen.queryByTestId('memories-series')).not.toBeInTheDocument();
  });

  it('is not there where this library’s Curator does not offer what it adds to memories', async () => {
    await loadLibraryContext(serving(secondWithout('memories')));
    render(SeriesButton);
    expect(screen.queryByTestId('memories-series')).not.toBeInTheDocument();
  });
});
