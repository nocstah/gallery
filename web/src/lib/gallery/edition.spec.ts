import type { ServerConfigDto, ServerFeaturesDto } from '@immich/sdk';
import { leftOutOfVaults, markEdition, notInVaults, vaultEdition, vaultFeatures, vaultServerConfig } from './edition';

// Local Omarchy layer: one source, two Kiokus. A build is the full edition unless local-build.sh asks for the vault
// edition, which a vault's private Gallery serves: one person's, on this computer only, locked most of the time.
describe('Kioku edition', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is the full edition unless a build asks for the vault edition', () => {
    expect(vaultEdition()).toBe(false);
    expect(() => notInVaults(new URL('https://kioku.localhost:2283/spaces'))).not.toThrow();
  });

  it('marks the page with its edition', () => {
    markEdition();
    expect(document.documentElement.dataset.kiokuEdition).toBe('full');
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    markEdition();
    expect(document.documentElement.dataset.kiokuEdition).toBe('vault');
  });

  it('knows the pages a vault leaves out by whole path segments', () => {
    const left = [
      '/command',
      '/inbox',
      '/chat',
      '/ask',
      '/utilities/slips',
      '/sharing',
      '/spaces',
      '/spaces/space-1/members',
      '/shared-links',
      '/shared-links/link-1/edit',
      '/partners/user-1',
      '/share/key-1',
      '/s/slug-1',
      '/admin/users',
      '/admin/users/user-1/edit',
      '/install',
      '/map',
      '/utilities/geolocation',
      '/admin/library-management/new',
      '/admin/storage-migration',
      '/buy',
      '/locked',
      '/locked/photos/asset-1',
      '/auth/pin-prompt',
    ];
    for (const path of left) {
      expect(leftOutOfVaults(path), path).toBe(true);
    }
    const kept = [
      '/photos',
      '/search',
      '/shares',
      '/albums',
      '/people',
      '/places',
      '/explore',
      '/memories/memory-1',
      '/archive',
      '/trash',
      '/import',
      '/utilities',
      '/utilities/duplicates',
      '/admin',
      '/admin/system-settings',
      '/admin/user',
    ];
    for (const path of kept) {
      expect(leftOutOfVaults(path), path).toBe(false);
    }
  });

  it("sends a vault's Gallery from each page it leaves out to Photos, and from nowhere else", () => {
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(vaultEdition()).toBe(true);
    let thrown: unknown;
    try {
      notInVaults(new URL('https://vault-0123456789.localhost:2299/spaces/space-1'));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ status: 307, location: '/photos' });
    expect(() => notInVaults(new URL('https://vault-0123456789.localhost:2299/photos'))).not.toThrow();
  });

  it('offers no map or email in a vault, and gives its maps an empty style that asks no tile server', () => {
    const features = { map: true, email: true, search: true } as ServerFeaturesDto;
    const config = {
      mapDarkStyleUrl: 'https://tiles.example/dark.json',
      mapLightStyleUrl: 'https://tiles.example/light.json',
      loginPageMessage: 'hello',
    } as ServerConfigDto;
    expect(vaultFeatures(features)).toBe(features);
    expect(vaultServerConfig(config)).toBe(config);

    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(vaultFeatures(features)).toEqual({ map: false, email: false, search: true });
    const vault = vaultServerConfig(config);
    expect(vault.loginPageMessage).toBe('hello');
    for (const style of [vault.mapDarkStyleUrl, vault.mapLightStyleUrl]) {
      const [scheme, body] = style.split(',', 2);
      expect(scheme).toBe('data:application/json');
      expect(JSON.parse(decodeURIComponent(body))).toEqual({ version: 8, sources: {}, layers: [] });
    }
  });
});
