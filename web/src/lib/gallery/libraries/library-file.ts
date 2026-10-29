// Local Omarchy layer: what a library's kioku-library.json may hold, checked strictly (gallery/libraries). Version 1:
//   { "version": 1, "id": "second", "name": "Second", "colour": "#3d7fa6", "main": false,
//     "features": { "curator": false, "specialAlbums": false, "vaults": false },
//     "libraries": [{ "id": "main", "name": "Main", "url": "<Main's address>", "colour": "#bf5b74" }, ...] }
// Every library's address must be on this computer, so the switcher can never send the browser anywhere else. A
// library with a Curator of its own ("curator": true) may name the port that Curator listens on, "curatorPort": 2291
// (a whole number from 1024 to 65535); without one it is 2290, Main's Curator's (utils/curator). One whose Curator
// runs only some of Main's jobs lists what it offers, "curatorFeatures": ["inbox", "picks"] (CuratorFeature); without
// the list it offers everything, as Main's does.

/** Where the deploy writes each library's context: its own web root, read same-origin. */
export const LIBRARY_CONTEXT_URL = '/kioku-library.json';

/** What a library can be without: Main offers all three, another library none until it has a Curator of its own. */
export type LibraryFeature = 'curator' | 'specialAlbums' | 'vaults';
const FEATURES: readonly LibraryFeature[] = ['curator', 'specialAlbums', 'vaults'];

/**
 * What a library's Curator can offer, each one the pages, rows, commands and tools that ask Curator for it
 * (utils/curator's FEATURE_OF names the endpoints of each):
 * - inbox: the AI inbox (its jobs, history, health and calibration) and the command center;
 * - chat: the chat, Ask and Look Up, which Curator's local text and vision models answer;
 * - memories: what Curator adds to memories and trips: their titles and covers, songs, films saved as video, memory
 *   links, more photos of a visit, and the stories told of memories, trips and events;
 * - books: photo books;
 * - restore: Remove objects (the restorer);
 * - live: the photo viewer's Live effects, Adjust, Save frame as photo and Copy subject;
 * - share: a video made ready for WhatsApp or Telegram;
 * - picks: Pick the best of a stack;
 * - smart: smart albums, saved searches Curator keeps filled;
 * - slips: Utilities › Bank slips.
 */
export const CURATOR_FEATURES = [
  'inbox',
  'chat',
  'memories',
  'books',
  'restore',
  'live',
  'share',
  'picks',
  'smart',
  'slips',
] as const;
export type CuratorFeature = (typeof CURATOR_FEATURES)[number];

/** The library a page is in. */
export type LibraryIdentity = { id: string; name: string; colour: string };
/** A library the switcher can open: its own address, always on this computer. */
export type Library = LibraryIdentity & { url: string };

export type LibraryContext = LibraryIdentity & {
  version: 1;
  main: boolean;
  features: Readonly<Record<LibraryFeature, boolean>>;
  /** the port this library's own Curator listens on, when the file names one; it counts only with features.curator */
  curatorPort?: number;
  /** what this library's Curator offers, when the file lists it (without, everything); it counts only with
   * features.curator */
  curatorFeatures?: readonly CuratorFeature[];
  /** every library, this one included, in the deploy's order; an entry that fails its checks is left out */
  libraries: readonly Library[];
};

export class MalformedLibraryContext extends Error {}

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const COLOUR = /^#[\da-f]{6}$/i;
const NAME_LENGTH = 40;
// control characters, and the bidirectional controls that could make a name read as another
const UNSAFE_NAME = /[\p{Cc}\u{61C}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}]/u;
const MAX_LIBRARIES = 16;
// a Curator's own port, above the ones only the system may take
const LEAST_PORT = 1024;
const MOST_PORT = 65_535;
// this computer only: loopback, or a *.localhost name, which browsers resolve to this computer and nowhere else
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|(?:[\da-z](?:[\da-z-]*[\da-z])?\.)+localhost)$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function malformed(what: string): never {
  throw new MalformedLibraryContext(what);
}

const asId = (value: unknown) => (typeof value === 'string' && ID.test(value) ? value : undefined);
const asColour = (value: unknown) =>
  typeof value === 'string' && COLOUR.test(value) ? value.toLowerCase() : undefined;
const asName = (value: unknown) => {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.length <= NAME_LENGTH && !UNSAFE_NAME.test(name) ? name : undefined;
};
const asPort = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= LEAST_PORT && value <= MOST_PORT
    ? value
    : undefined;

/**
 * A library's address, when it is one Kioku may send the browser to: http or https, on this computer (a loopback
 * address or a *.localhost name), with no credentials in it. Its origin alone, so nothing rides along with a switch;
 * anything else is no address at all, so nothing can ever navigate to an arbitrary host.
 */
export const libraryAddress = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  const web = url.protocol === 'http:' || url.protocol === 'https:';
  if (!web || url.username || url.password || !LOCAL_HOST.test(url.hostname)) {
    return;
  }
  return url.origin;
};

/**
 * What a library's Curator offers, when its file lists it: names, each once. A name Kioku does not know (a newer
 * deploy's, say) is left out, with a warning; anything else (no list, an entry that is no name, a name twice) is
 * malformed.
 */
const asCuratorFeatures = (value: unknown, warn: (message: string) => void): CuratorFeature[] => {
  if (!Array.isArray(value)) {
    malformed('curatorFeatures');
  }
  // the whole list is checked first, so a malformed one warns of nothing else
  for (const [index, name] of value.entries()) {
    if (typeof name !== 'string' || value.indexOf(name) !== index) {
      malformed(`curatorFeatures[${index}]`);
    }
  }
  const offered: CuratorFeature[] = [];
  for (const [index, name] of value.entries()) {
    const known = CURATOR_FEATURES.find((feature) => feature === name);
    if (known) {
      offered.push(known);
    } else {
      warn(`[kioku-library] ${LIBRARY_CONTEXT_URL}: leaving out curatorFeatures[${index}], which Kioku does not know`);
    }
  }
  return offered;
};

const asLibrary = (value: unknown): Library | undefined => {
  if (!isRecord(value)) {
    return;
  }
  const id = asId(value.id);
  const name = asName(value.name);
  const colour = asColour(value.colour);
  const url = libraryAddress(value.url);
  return id && name && colour && url ? { id, name, colour, url } : undefined;
};

/**
 * The context a file holds (version 1), checked strictly: anything missing or of the wrong kind throws, naming it. A
 * listed library whose id, name, colour or address fails is left out of the list (with a warning), so the switcher
 * never offers it; so is a second entry with an id already listed.
 */
export const parseLibraryContext = (data: unknown, warn: (message: string) => void = console.warn): LibraryContext => {
  if (!isRecord(data)) {
    malformed('not an object');
  }
  if (data.version !== 1) {
    malformed(`version ${JSON.stringify(data.version)}, not 1`);
  }
  const id = asId(data.id) ?? malformed('id');
  const name = asName(data.name) ?? malformed('name');
  const colour = asColour(data.colour) ?? malformed('colour');
  if (typeof data.main !== 'boolean') {
    malformed('main');
  }
  const offered = isRecord(data.features) ? data.features : malformed('features');
  const features = {} as Record<LibraryFeature, boolean>;
  for (const feature of FEATURES) {
    const value = offered[feature];
    features[feature] = typeof value === 'boolean' ? value : malformed(`features.${feature}`);
  }
  // optional, but a port it names has to be one, whether or not this library has a Curator
  const curatorPort =
    data.curatorPort === undefined ? undefined : (asPort(data.curatorPort) ?? malformed('curatorPort'));
  // optional too, and checked the same whether or not this library has a Curator
  const curatorFeatures =
    data.curatorFeatures === undefined ? undefined : asCuratorFeatures(data.curatorFeatures, warn);
  if (!Array.isArray(data.libraries)) {
    malformed('libraries');
  }
  const libraries: Library[] = [];
  for (const [index, entry] of data.libraries.entries()) {
    const library = asLibrary(entry);
    if (!library || libraries.some((listed) => listed.id === library.id)) {
      warn(`[kioku-library] ${LIBRARY_CONTEXT_URL}: leaving out libraries[${index}], which fails its checks`);
      continue;
    }
    if (libraries.length === MAX_LIBRARIES) {
      warn(`[kioku-library] ${LIBRARY_CONTEXT_URL}: more than ${MAX_LIBRARIES} libraries, leaving out the rest`);
      break;
    }
    libraries.push(library);
  }
  return { version: 1, id, name, colour, main: data.main, features, curatorPort, curatorFeatures, libraries };
};
