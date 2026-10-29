import { vaultEdition } from '$lib/gallery/edition';
import { libraryHas } from '$lib/gallery/libraries/library-context.svelte';

// A fixed local application link: no vault IDs, passwords, names or server API.
export const VAULT_CHOOSER_URI = 'kioku-vault://open';

// The desktop's own Gallery: a loopback address, or a *.localhost name (browsers resolve those to this computer
// only), such as kioku.localhost, which gives a password manager a site of its own.
export const isLoopback = (hostname: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(hostname) || hostname.endsWith('.localhost');

// This desktop's own browser, not a phone's or a tablet's (the Libraries switcher follows the same rule).
export const isDesktop = (userAgent: string) => /Linux/.test(userAgent) && !/Android|Mobile/.test(userAgent);

// Never inside a vault: its Gallery is the vault edition (gallery/edition). Nor in a library that does not offer the
// vaults, which are Main's (gallery/libraries).
export const canLaunchVaultChooser = (url: URL, userAgent: string, isOwner: boolean) =>
  !vaultEdition() &&
  libraryHas('vaults') &&
  isOwner &&
  isLoopback(url.hostname) &&
  url.port === '2283' &&
  isDesktop(userAgent);
