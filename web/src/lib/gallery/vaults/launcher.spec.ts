import { canLaunchVaultChooser, VAULT_CHOOSER_URI } from './launcher';

const desktop = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0';

describe('local vault launcher', () => {
  it('opens only a fixed neutral chooser, without a vault identity or password', () => {
    expect(VAULT_CHOOSER_URI).toBe('kioku-vault://open');
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'kioku.localhost']) {
      expect(canLaunchVaultChooser(new URL(`http://${host}:2283/photos`), desktop, true)).toBe(true);
    }
  });

  it.each([
    ['http://localhost:2283/photos', desktop, false],
    ['http://localhost:2299/photos', desktop, true],
    ['https://photos.example.com/photos', desktop, true],
    ['https://kioku.localhost.example.com:2283/photos', desktop, true],
    ['https://kioku.localhost:2299/photos', desktop, true],
    ['http://localhost:2283/photos', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', true],
    ['http://localhost:2283/photos', 'Mozilla/5.0 (Linux; Android 16) Mobile', true],
    ['http://localhost:2283/photos', '', true],
  ])('does not offer a desktop launcher for %s / %s / owner=%s', (url, agent, owner) => {
    expect(canLaunchVaultChooser(new URL(url), agent, owner)).toBe(false);
  });

  it('is never offered inside a vault, whose Gallery is the vault edition, at any address', () => {
    vi.stubEnv('VITE_KIOKU_EDITION', 'vault');
    expect(canLaunchVaultChooser(new URL('https://kioku.localhost:2283/photos'), desktop, true)).toBe(false);
    vi.unstubAllEnvs();
  });
});
