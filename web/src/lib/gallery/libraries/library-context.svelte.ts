import { vaultEdition } from '$lib/gallery/edition';
import {
  LIBRARY_CONTEXT_URL,
  MalformedLibraryContext,
  parseLibraryContext,
  type Library,
  type LibraryContext,
  type LibraryFeature,
  type LibraryIdentity,
} from './library-file';

// Local Omarchy layer: which Kioku library this page belongs to, and what it offers. Each library is a Gallery of its
// own (its own database, storage, address and sign-in) serving the same full-edition build, and the deploy writes a
// small static file into each library's web root that says which library it is, what it offers, and every library for
// the switcher. It is read once, before anything else runs (hooks.client's init, then the root layout's load waits for
// it), so nothing asks a service before Kioku knows which library it is in. A missing file, or one that fails to load or
// to parse, means one library with every feature, exactly as before there was a second one. A vault's Gallery (the
// vault edition) never reads one.

let context = $state.raw<LibraryContext | undefined>();
let loading: Promise<void> | undefined;
let known = false;
const waiting: (() => void)[] = [];

const read = async (fetchFn: typeof fetch): Promise<LibraryContext | undefined> => {
  let response: Response;
  try {
    response = await fetchFn(LIBRARY_CONTEXT_URL, {
      cache: 'no-store',
      credentials: 'same-origin',
      // a server that answers every page with the app's own (Gallery's, for a missing file) answers 406 instead
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    console.warn(`[kioku-library] could not load ${LIBRARY_CONTEXT_URL}: one library, every feature`, error);
    return;
  }
  // no file: Kioku is one library, as it was before there were two
  if ([404, 406, 410].includes(response.status)) {
    return;
  }
  if (!response.ok) {
    console.warn(`[kioku-library] ${LIBRARY_CONTEXT_URL} answered ${response.status}: one library, every feature`);
    return;
  }
  if (/^text\/html\b/i.test(response.headers.get('content-type') ?? '')) {
    return;
  }
  try {
    return parseLibraryContext(await response.json());
  } catch (error) {
    const why = error instanceof MalformedLibraryContext ? error.message : String(error);
    console.warn(`[kioku-library] ignoring a malformed ${LIBRARY_CONTEXT_URL} (${why}): one library, every feature`);
    return;
  }
};

/**
 * Reads this library's context, once: every later call (each navigation's root load) waits for the same read. It never
 * fails; anything that goes wrong leaves Kioku one library with every feature.
 */
export const loadLibraryContext = (fetchFn: typeof fetch = fetch): Promise<void> => {
  loading ??= (vaultEdition() ? Promise.resolve(undefined) : read(fetchFn)).then((found) => {
    context = found;
    known = true;
    for (const callback of waiting.splice(0)) {
      try {
        callback();
      } catch (error) {
        console.error('[kioku-library] a hook on the library context failed', error);
      }
    }
  });
  return loading;
};

/** Runs once the context has been read (at once when it has): how Ctrl+K's lists take this library's pages. */
export const whenLibraryKnown = (callback: () => void) => {
  if (known) {
    callback();
  } else {
    waiting.push(callback);
  }
};

/** Forgets the context, so the next load reads it again (tests). */
export const resetLibraryContext = () => {
  context = undefined;
  loading = undefined;
  known = false;
  waiting.length = 0;
};

/** This library, when its context says which one it is. */
export const currentLibrary = (): LibraryIdentity | undefined =>
  context && { id: context.id, name: context.name, colour: context.colour };

/** Whether this is Main: true without a context too, where Kioku is the one library it always was. */
export const isMainLibrary = (): boolean => context?.main ?? true;

/** Whether this library offers a feature: without a context, every one. */
export const libraryHas = (feature: LibraryFeature): boolean => context?.features[feature] ?? true;

/** Every library the context lists, this one included. */
export const libraries = (): readonly Library[] => context?.libraries ?? [];

/** The libraries besides this one. */
export const otherLibraries = (): readonly Library[] => libraries().filter(({ id }) => id !== context?.id);

/** Whether the context lists another library besides this one. */
export const listsSeveralLibraries = (): boolean => otherLibraries().length > 0;
