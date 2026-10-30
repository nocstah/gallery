import type { AssetResponseDto } from '@immich/sdk';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { privateFilmMedia } from '$lib/components/memories/film/private-film-media';
import { comingMemory } from '@test-data/factories/series-factory';
import SeriesFilm from './SeriesFilm.svelte';
import { seen } from './memory-film.test-wrapper.svelte';

// Local Omarchy layer: Play in Coming up (gallery/series): the film Kioku plays, full screen over the shell, given the
// memory as the family will see it: its photos from Gallery, Curator's cover, faces and songs, the title and the line,
// nothing to wait for and no story. A stand-in film keeps what it was given. Synthetic ids only.

const mocks = vi.hoisted(() => ({
  auth: {
    authenticated: true,
    user: { id: 'owner-id', isAdmin: true },
    params: {},
    preferences: { memories: { duration: 7 } },
  },
}));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: mocks.auth }));
vi.mock('$lib/components/memories/film/MemoryFilm.svelte', async () => {
  const { default: stub } = await import('./memory-film.test-wrapper.svelte');
  return { default: stub };
});

describe('SeriesFilm', () => {
  it('plays the memory as the family will see it, over the whole page', () => {
    const memory = comingMemory();
    const assets = memory.photos.map(({ id }) => ({ id }) as AssetResponseDto);
    const onClose = vi.fn();
    const { container } = render(SeriesFilm, { props: { memory, assets, onClose } });

    // out of the page's own box, at the end of the body
    const film = screen.getByTestId('memory-film');
    expect(container).not.toContainElement(film);
    expect(seen.props).toMatchObject({
      media: privateFilmMedia,
      memory: { id: 'series:event:340', assets },
      assetId: 'photo-1',
      active: true,
      name: 'Riverton harbour',
      line: 'Riverton · March 2018',
      title: 'Riverton harbour',
      cover: 'photo-3',
      focus: { 'photo-1': [0.5, 0.4] },
      settled: true,
      story: null,
      tracks: memory.tracks,
      photoSeconds: 7,
    });

    void fireEvent.click(screen.getByTestId('memory-film-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
