import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import PlaceTile from '$lib/components/places/PlaceTile.svelte';

// Local Omarchy layer: a place tile shows its face once chosen (managers/place-faces), the quiet ground before, and
// the server's photo where none qualifies
const { faces } = vi.hoisted(() => ({
  faces: { current: undefined as string | null | undefined, requests: [] as unknown[] },
}));
vi.mock('$lib/managers/place-faces.svelte', () => ({
  placeFaces: {
    get: () => faces.current,
    request: (places: unknown[]) => {
      faces.requests.push(...places);
    },
  },
}));

const tile = () => render(PlaceTile, { props: { assetId: 'listed', city: 'Riverton', country: 'Examplestan' } });

describe('PlaceTile', () => {
  beforeEach(() => {
    faces.requests = [];
    // the tile in view at once
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly seen: (entries: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.seen([{ isIntersecting: true }]);
        }
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps its quiet ground while its face is looked for, asking for it as it comes near the view', () => {
    faces.current = undefined;
    tile();

    expect(screen.getByTestId('place-tile').querySelector('img')).toBeNull();
    expect(faces.requests).toEqual([{ city: 'Riverton', country: 'Examplestan' }]);
  });

  it('shows its face once chosen', () => {
    faces.current = 'face';
    tile();

    expect(screen.getByTestId('place-tile').querySelector('img')?.getAttribute('src')).toContain('/assets/face/');
  });

  it("shows the server's photo where no photo of the place qualifies", () => {
    faces.current = null;
    tile();

    expect(screen.getByTestId('place-tile').querySelector('img')?.getAttribute('src')).toContain('/assets/listed/');
  });
});
