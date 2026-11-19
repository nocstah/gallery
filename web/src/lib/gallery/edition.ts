import { Route } from '#lib/route.ts';
import type { ServerFeaturesDto } from '@immich/sdk';
import { redirect } from '@sveltejs/kit';

// Local Omarchy layer: which Kioku a build is. local-build.sh builds two from this one source: the full edition for the
// owner's Gallery, and the vault edition (VITE_KIOKU_EDITION=vault) that each encrypted vault's private Gallery serves.
// A vault is one person's, on this computer only, and locked most of the time, so the vault edition leaves out what
// needs anyone or anything else ("strip all of them, including the locked folder"): Curator with its AI tools and
// pages; the Vaults launcher; the special albums (To do, Villa, QR), which are the main library's; sharing (links,
// Spaces, partners, albums shared with other users); other accounts; phones and TVs (the app, Google Cast); the map,
// whose tiles come from a public server; email; what would move photos out of the encryption (external libraries,
// storage migration); the licence page; and the PIN Locked Folder, a lock inside the vault's own. Read at call time,
// so a test can switch it with vi.stubEnv; a build turns it into a constant.
export const vaultEdition = (): boolean => import.meta.env.VITE_KIOKU_EDITION === 'vault';

/**
Marks the page with the edition it was built as: <html data-kioku-edition="vault"> or "full". The test is written out
here, not through vaultEdition(), so a build folds it to one word, which local-build.sh looks for in each build: proof
the vault flag reached the vault edition, and only it.
*/
export const markEdition = (): void => {
  document.documentElement.dataset.kiokuEdition = import.meta.env.VITE_KIOKU_EDITION === 'vault' ? 'vault' : 'full';
};

// The pages the vault edition leaves out, by their first path segments. Their links and menu entries are hidden where
// each feature starts; this list sends anything that still leads there to Photos.
const LEFT_OUT = [
  // Curator's
  'command',
  'inbox',
  'chat',
  'ask',
  'utilities/slips',
  'from-the-beginning',
  // sharing, and the pages a shared link opens
  'sharing',
  'spaces',
  'shared-links',
  'partners',
  'share',
  's',
  // other accounts, phones, the map, outside the encryption, the licence, the Locked Folder
  'admin/users',
  'install',
  'map',
  'utilities/geolocation',
  'admin/library-management',
  'admin/storage-migration',
  'buy',
  'locked',
  'auth/pin-prompt',
];

export const leftOutOfVaults = (pathname: string): boolean => {
  const path = pathname.split('/').filter(Boolean);
  return LEFT_OUT.some((page) => page.split('/').every((part, index) => path[index] === part));
};

/** In the root layout's load: a vault's Gallery sends each page it leaves out to Photos. */
export const notInVaults = (url: URL): void => {
  if (vaultEdition() && leftOutOfVaults(url.pathname)) {
    redirect(307, Route.photos());
  }
};

/** The server's features as a vault's Gallery offers them: no map and no email, which Gallery then hides everywhere. */
export const vaultFeatures = (features: ServerFeaturesDto): ServerFeaturesDto =>
  vaultEdition() ? { ...features, map: false, email: false } : features;

// An empty map style, inline: a map that still shows in a vault's Gallery draws on it and asks no tile server anything,
// so where vault photos were taken stays on this computer.
const NO_MAP = 'data:application/json,' + encodeURIComponent('{"version":8,"sources":{},"layers":[]}');

type MapConfig = { map: { enabled: boolean; darkStyle: string; lightStyle: string } };

/**
The server's map settings (the public and the user config, queries/config-*.query) as a vault's Gallery uses them: no
map, as its features say (vaultFeatures), and every map style the empty one.
*/
export const vaultMapConfig = <T extends MapConfig>(config: T): T =>
  vaultEdition()
    ? { ...config, map: { ...config.map, enabled: false, darkStyle: NO_MAP, lightStyle: NO_MAP } }
    : config;
