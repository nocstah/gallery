import type { LibraryFeature } from '$lib/gallery/libraries/library-file';

// Local Omarchy layer: the libraries a kioku-library.json lists, for the specs of lib/gallery/libraries. Every library's
// address is http on one of this computer's *.localhost names, which unicorn/prefer-https takes for a public host.
const local = (name: string, port: number) => `http://${name}.localhost:${port}`;

export const mainLibrary = { id: 'main', name: 'Main', url: local('kioku', 2283), colour: '#bf5b74' };
export const secondLibrary = { id: 'second', name: 'Second', url: local('second', 2286), colour: '#3d7fa6' };
export const cleanupLibrary = { id: 'my-cleanup', name: 'Cleanup', url: local('cleanup', 2287), colour: '#4f8a5b' };
export type TestLibrary = typeof mainLibrary;

/** A library's kioku-library.json: Main with every feature, any other library with none, unless told otherwise. */
export const libraryContextFile = (
  current: TestLibrary,
  libraries: unknown[] = [mainLibrary, secondLibrary],
  features: Partial<Record<LibraryFeature, boolean>> = {},
) => {
  const main = current.id === mainLibrary.id;
  return {
    version: 1,
    id: current.id,
    name: current.name,
    colour: current.colour,
    main,
    features: { curator: main, specialAlbums: main, vaults: main, ...features },
    libraries,
  };
};

/** A fetch that answers every request with this file. */
export const serving = (data: unknown) =>
  vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(Response.json(data)));
