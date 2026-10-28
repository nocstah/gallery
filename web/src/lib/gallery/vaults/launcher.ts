import { vaultEdition } from '$lib/gallery/edition';

// A fixed local application link: no vault IDs, passwords, names or server API.
export const VAULT_CHOOSER_URI = 'kioku-vault://open';

// The desktop's own Gallery: a loopback address, or a *.localhost name (browsers resolve those to this computer
// only), such as kioku.localhost, which gives a password manager a site of its own.
const isLoopback = (hostname: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost');

// Never inside a vault: its Gallery is the vault edition (gallery/edition).
export const canLaunchVaultChooser = (url: URL, userAgent: string, isOwner: boolean) =>
  !vaultEdition() &&
  isOwner &&
  isLoopback(url.hostname) &&
  url.port === '2283' &&
  /Linux/.test(userAgent) &&
  !/Android|Mobile/.test(userAgent);
