import '@testing-library/jest-dom';
import { render } from '@testing-library/svelte';
import { loadLibraryContext, resetLibraryContext } from '$lib/gallery/libraries/library-context.svelte';
import {
  libraryContextFile,
  mainLibrary,
  SECOND_CURATOR_FEATURES,
  secondLibrary,
  secondOffering,
  serving,
} from '@test-data/factories/library-context-factory';
import UtilitiesMenu from './UtilitiesMenu.svelte';

// Local Omarchy layer: Utilities › Bank slips is Curator's (it reads each slip's amount and files slips into QR), so it
// is offered only where this library's Curator reads slips (gallery/libraries): every library's but a vault's when its
// file lists nothing, as Main's, and none whose Curator only cleans up, as the second library's does

const slips = () => document.querySelector('a[href="/utilities/slips"]');
const duplicates = () => document.querySelector('a[href="/utilities/duplicates"]');

afterEach(() => {
  resetLibraryContext();
});

describe('UtilitiesMenu', () => {
  it.each([
    ['without a library context', () => Promise.resolve()],
    ['in Main, whose file lists nothing', () => loadLibraryContext(serving(libraryContextFile(mainLibrary)))],
    ['where its Curator offers the bank slips', () => loadLibraryContext(serving(secondOffering(['slips'])))],
  ])('offers Bank slips %s', async (_, load) => {
    await load();
    render(UtilitiesMenu);

    expect(slips()).toBeInTheDocument();
    expect(duplicates()).toBeInTheDocument();
  });

  it.each([
    ['where its Curator offers only the AI inbox and picks', () => secondOffering(SECOND_CURATOR_FEATURES)],
    ['without a Curator', () => libraryContextFile(secondLibrary)],
  ])('leaves Bank slips out %s, and keeps the rest', async (_, file) => {
    await loadLibraryContext(serving(file()));
    render(UtilitiesMenu);

    expect(slips()).not.toBeInTheDocument();
    expect(duplicates()).toBeInTheDocument();
  });
});
